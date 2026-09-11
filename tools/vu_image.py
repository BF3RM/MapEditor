#!/usr/bin/env python3
"""Read and disassemble the VU client's DECRYPTED code image.

Why this exists: `vu.com` on disk is a 26 KB loader whose `.cdata` section is 34 MB of ALLOC-only
space. It decrypts BF3's protected image into that space at runtime, so `bf3.exe` on disk does NOT
disassemble at the addresses a crash reports -- the bytes at the faulting file offset are unrelated.
The only way to read the code that actually ran is to copy it out of a live process.

The image is identical whatever level is loaded, so a client sitting in the main menu is enough:
dump once, then work offline against the saved copy for as long as the VU build stays the same.

    vu_image.py dump                  # from any running VU client (or --pid)
    vu_image.py dis 0x173CB7C         # disassemble, from the containing function's start
    vu_image.py fn 0x173CB7C          # function start, strings it references, calls it makes
    vu_image.py xref lightMaps        # code that references a string
    vu_image.py trace /tmp/cli_seh.log  # annotate every vu.com frame in a wine/minidump backtrace

Addresses are the ones crashes report: absolute VAs with the module based at 0x400000, which is what
both wine's `vu.com (+0xNNN)` frames and vu_minidump.py print.
"""
import argparse
import json
import os
import re
import subprocess
import sys

BASE = 0x400000
STORE = os.path.expanduser('~/Games/VeniceUnleashed/debug/vu-image')
IMAGE = os.path.join(STORE, 'vu-image.bin')
MANIFEST = os.path.join(STORE, 'vu-image.json')


def _pids():
    """VU processes, by /proc/<pid>/comm -- never `pgrep -f`, which matches this script too."""
    out = []

    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue

        try:
            comm = open('/proc/%s/comm' % pid).read().strip()
        except OSError:
            continue

        if comm.startswith('vu.'):
            out.append(int(pid))

    return out


def _module_range(pid):
    """The mapped extent of vu.com: its first mapping, plus the anonymous rwx region after it."""
    lo = hi = None

    for line in open('/proc/%d/maps' % pid):
        span, perms = line.split()[0], line.split()[1]
        a, b = (int(x, 16) for x in span.split('-'))

        if lo is None:
            if a == BASE and line.rstrip().endswith('vu.com'):
                lo, hi = a, b
            continue

        # The decrypted body is anonymous rwx immediately after the 4 KB PE header mapping.
        if a == hi and 'x' in perms:
            hi = b
        elif a > hi:
            break

    return lo, hi


def cmd_dump(args):
    pid = args.pid or next((p for p in _pids() if _module_range(p)[0]), None)

    if not pid:
        sys.exit('no VU process with a vu.com image mapped at 0x%X -- start a client first' % BASE)

    lo, hi = _module_range(pid)

    if lo is None:
        sys.exit('pid %d has no vu.com mapping at 0x%X' % (pid, BASE))

    os.makedirs(STORE, exist_ok=True)

    with open('/proc/%d/mem' % pid, 'rb', 0) as m:
        m.seek(lo)
        data = m.read(hi - lo)

    out = args.out or IMAGE
    open(out, 'wb').write(data)

    loader = os.path.expanduser('~/Games/VeniceUnleashed/client/vu.com')
    meta = {'base': lo, 'size': len(data), 'pid': pid,
            'loader': loader,
            'loader_mtime': os.path.getmtime(loader) if os.path.exists(loader) else None}
    json.dump(meta, open(args.manifest or MANIFEST, 'w'), indent=1)
    print('wrote %s (%d bytes, base 0x%X, from pid %d)' % (out, len(data), lo, pid))


def _load(args):
    path = args.image or IMAGE

    if not os.path.exists(path):
        sys.exit('no image at %s -- run "vu_image.py dump" with a client running' % path)

    stale = ''
    man = args.manifest or MANIFEST

    if os.path.exists(man):
        meta = json.load(open(man))
        loader = meta.get('loader') or ''

        if loader and os.path.exists(loader) and meta.get('loader_mtime') \
                and abs(os.path.getmtime(loader) - meta['loader_mtime']) > 1:
            stale = ('  WARNING: %s changed since this dump -- addresses may have moved; re-dump.\n'
                     % loader)

    if stale:
        sys.stderr.write(stale)

    return open(path, 'rb').read()


def _md():
    try:
        from capstone import CS_ARCH_X86, CS_MODE_32, Cs
    except ImportError:
        sys.exit('capstone is required: pip install --user capstone')

    return Cs(CS_ARCH_X86, CS_MODE_32)


def _cstr(data, va, maxlen=200):
    o = va - BASE

    if o < 0 or o >= len(data) - 1:
        return None

    end = data.find(b'\0', o, o + maxlen)

    if end < 0:
        return None

    s = data[o:end]

    if len(s) < 4 or not all(32 <= c < 127 for c in s):
        return None

    return s.decode()


def _fn_start(data, va, maxback=0x2000):
    """Walk back to the first byte after int3 padding -- MSVC pads between functions with 0xCC."""
    for back in range(4, maxback):
        o = va - BASE - back

        if o <= 0:
            break

        if data[o - 1] == 0xCC and data[o] != 0xCC:
            return va - back

    return va - 0x40


def _disasm(data, start, end):
    for i in _md().disasm(data[start - BASE:end - BASE + 16], start):
        if i.address > end:
            break

        yield i


def cmd_dis(args):
    data = _load(args)
    va = int(args.addr, 16)
    start = va if args.here else _fn_start(data, va)

    for i in _disasm(data, start, start + args.bytes):
        print('%s %08X  %-8s %s'
              % ('>>' if i.address == va else '  ', i.address, i.mnemonic, i.op_str))


HEX = re.compile(r'0x[0-9a-f]+')


def cmd_fn(args):
    data = _load(args)
    va = int(args.addr, 16)
    start = _fn_start(data, va)
    print('function start %08X (target %08X, +0x%X into it)' % (start, va, va - start))

    strings, calls = [], []

    for i in _disasm(data, start, start + args.bytes):
        if i.mnemonic == 'call' and i.op_str.startswith('0x'):
            calls.append((i.address, int(i.op_str, 16)))

        for tok in HEX.findall(i.op_str):
            v = int(tok, 16)
            s = _cstr(data, v)

            if s:
                strings.append((i.address, s))

    print('\nstrings referenced (%d):' % len(strings))

    for a, s in strings:
        print('  %08X  %r' % (a, s))

    print('\ncalls (%d):' % len(calls))

    for a, t in calls:
        print('  %08X  -> %08X' % (a, t))


def cmd_xref(args):
    data = _load(args)
    needle = args.text.encode()
    hits = []
    off = data.find(needle)

    while off >= 0 and len(hits) < args.max:
        if off == 0 or data[off - 1] == 0:
            hits.append(off + BASE)

        off = data.find(needle, off + 1)

    if not hits:
        sys.exit('string %r not found in the image' % args.text)

    for va in hits:
        print('string %08X %r' % (va, _cstr(data, va)))
        # A 32-bit push of the pointer is how these are referenced; scan for the literal bytes.
        pat = va.to_bytes(4, 'little')
        o = data.find(pat)
        n = 0

        while o >= 0 and n < args.max:
            print('    referenced from ~%08X' % (o + BASE))
            n += 1
            o = data.find(pat, o + 1)


FRAME = re.compile(r'vu\.com\s*(?:\(\+|\+)0x([0-9a-fA-F]+)')


def cmd_trace(args):
    data = _load(args)
    text = open(args.file, 'rb').read().decode('utf-8', 'replace')
    seen = []

    for m in FRAME.finditer(text):
        va = BASE + int(m.group(1), 16)

        if va in seen:
            continue

        seen.append(va)

    if not seen:
        sys.exit('no vu.com frames found in %s' % args.file)

    for va in seen:
        start = _fn_start(data, va)
        strings = []

        for i in _disasm(data, start, start + args.bytes):
            for tok in HEX.findall(i.op_str):
                s = _cstr(data, int(tok, 16))

                if s:
                    strings.append(s)

        ins = next(_disasm(data, va, va + 16), None)
        print('%08X  fn %08X  %-24s  %s'
              % (va, start,
                 ('%s %s' % (ins.mnemonic, ins.op_str))[:24] if ins else '?',
                 ', '.join(dict.fromkeys(strings))[:110]))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--image')
    ap.add_argument('--manifest')
    sub = ap.add_subparsers(dest='cmd', required=True)

    d = sub.add_parser('dump', help='copy the decrypted image out of a live VU process')
    d.add_argument('--pid', type=int)
    d.add_argument('--out')
    d.set_defaults(fn=cmd_dump)

    s = sub.add_parser('dis', help='disassemble around an address')
    s.add_argument('addr')
    s.add_argument('--bytes', type=lambda v: int(v, 0), default=0x400)
    s.add_argument('--here', action='store_true', help='start AT the address, not at the function')
    s.set_defaults(fn=cmd_dis)

    f = sub.add_parser('fn', help='function start, strings referenced, calls made')
    f.add_argument('addr')
    f.add_argument('--bytes', type=lambda v: int(v, 0), default=0x800)
    f.set_defaults(fn=cmd_fn)

    x = sub.add_parser('xref', help='find a string and the code that pushes its address')
    x.add_argument('text')
    x.add_argument('--max', type=int, default=8)
    x.set_defaults(fn=cmd_xref)

    t = sub.add_parser('trace', help='annotate vu.com frames in a wine/minidump backtrace')
    t.add_argument('file')
    t.add_argument('--bytes', type=lambda v: int(v, 0), default=0x800)
    t.set_defaults(fn=cmd_trace)

    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
