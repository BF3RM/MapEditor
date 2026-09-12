#!/usr/bin/env python3
"""Find an object in a live VU process by its vtable, and lay its fields out with their strings.

A crash tells you WHICH field of an object is null, never what that field IS. The answer is in any
process where the field is set: load a level the game ships, find the same object by the vtable the
crash reported, and read the field. A name comes straight out.

    vu_object.py 0x223AB38            # every instance of that class, fields and strings
    vu_object.py 0x223AB38 --field 0x18

The vtable address comes from the faulting object's +0x00, which vu_catch prints.
"""
import argparse
import os
import re
import struct
import sys


def client_pids():
    """The CLIENT only -- the dedicated server maps vu.com too, and its objects are not the
    renderer's. Matched on /proc/<pid>/comm, never a pattern that would match this script."""
    out = []

    for p in os.listdir('/proc'):
        if not p.isdigit():
            continue

        try:
            if not open('/proc/%s/comm' % p).read().strip().startswith('vu.'):
                continue

            cmd = open('/proc/%s/cmdline' % p, 'rb').read().decode(errors='replace')
        except OSError:
            continue

        if '-server' in cmd or '-dedicated' in cmd:
            continue

        out.append(int(p))

    return out


def regions(pid):
    """Writable, non-file-backed mappings -- where the heap objects live."""
    out = []

    for line in open('/proc/%d/maps' % pid):
        m = re.match(r'([0-9a-f]+)-([0-9a-f]+) (\S{4}) \S+ \S+ \S+\s*(.*)', line)

        if not m or 'w' not in m.group(3):
            continue

        lo, hi = int(m.group(1), 16), int(m.group(2), 16)

        # 32-bit process: nothing above 4 GB is ours. Do NOT skip large mappings -- VU's heap is
        # one of them, and a 128 MB cap made this find nothing at all while the object it wanted
        # sat at 0xAA57BC60. Only skip a reservation big enough to be the whole address space.
        if lo > 0xFFFFFFFF or hi - lo > 0x40000000:
            continue

        out.append((lo, hi))

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('vtable')
    ap.add_argument('--pid', type=int)
    ap.add_argument('--fields', default='0x90', help='how far into the object to print')
    ap.add_argument('--max', type=int, default=4, help='objects to print')
    args = ap.parse_args()

    want = struct.pack('<I', int(args.vtable, 16))
    pids = [args.pid] if args.pid else client_pids()

    if not pids:
        sys.exit('no VU client running')

    for pid in pids:
        try:
            mem = open('/proc/%d/mem' % pid, 'rb', 0)
        except OSError as ex:
            print('%d: %s' % (pid, ex))
            continue

        def rd(addr, n):
            try:
                mem.seek(addr)
                return mem.read(n)
            except (OSError, ValueError, OverflowError):
                return b''

        def u32(addr):
            b = rd(addr, 4)
            return struct.unpack('<I', b)[0] if len(b) == 4 else None

        def text(addr, n=120):
            b = rd(addr, n)
            out = bytearray()

            for c in b:
                if c == 0:
                    break

                if not (32 <= c < 127):
                    return None

                out.append(c)

            return out.decode() if len(out) >= 4 else None

        found = 0

        for lo, hi in regions(pid):
            blob = rd(lo, hi - lo)

            if not blob:
                continue

            for m in re.finditer(re.escape(want), blob):
                obj = lo + m.start()
                # A vtable pointer can appear anywhere; a real object of this class has the level
                # name at +0x34. Without that check the scan reports every stale copy on the stack.
                if not (text(u32(obj + 0x34) or 0) or '').startswith('Levels/'):
                    continue

                print('object %08X in pid %d' % (obj, pid))

                for off in range(0, int(args.fields, 16), 4):
                    val = u32(obj + off)

                    if val is None:
                        break

                    s = text(val) if val else None

                    if s is None and val:
                        inner = u32(val + 8)
                        s = ('[+8] ' + text(inner)) if inner and text(inner) else None

                    print('  +0x%02X = %08X %s' % (off, val, repr(s) if s else ''))

                found += 1

                if found >= args.max:
                    break

            if found >= args.max:
                break

        if not found:
            print('pid %d: no object with that vtable and a level name at +0x34' % pid)

        mem.close()


if __name__ == '__main__':
    main()
