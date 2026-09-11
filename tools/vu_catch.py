#!/usr/bin/env python3
"""Catch a VU client fault and read the objects it died on, out of the live process.

A renderer null tells you an address, not WHICH shader or material owns it, and no amount of
offline auditing of the bundle narrows that down once the obvious classes are closed. But the
process is still alive while wine's auto-debugger prints its backtrace, so the structures the
faulting instruction was walking can still be read.

Run this alongside a client launch: it tails the +seh log, and the moment the register dump
appears it reads the process's memory at the registers, follows the pointer chains, and prints any
name string it can reach. Addresses come from the log, so this works with no symbols.

    WINEDEBUG=+seh ... vu.com ... 2>/tmp/cli_seh.log &
    vu_catch.py /tmp/cli_seh.log
"""
import os
import re
import signal
import struct
import sys
import time

REG = re.compile(r'E(AX|BX|CX|DX|SI|DI|BP|IP):([0-9a-f]{8})')


def client_pids():
    """The CLIENT only -- the dedicated server maps vu.com too, and reading the wrong one gives
    zeros. Matched on /proc/<pid>/comm, never on a pattern that would match this script."""
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


def reader(pid):
    try:
        return open('/proc/%d/mem' % pid, 'rb', 0)
    except OSError:
        return None


def rd(mem, addr, n):
    try:
        mem.seek(addr)
        return mem.read(n)
    except (OSError, ValueError, OverflowError):
        return b''


def u32(mem, addr):
    b = rd(mem, addr, 4)
    return struct.unpack('<I', b)[0] if len(b) == 4 else None


def ascii_at(mem, addr, maxlen=160):
    b = rd(mem, addr, maxlen)
    out = bytearray()

    for c in b:
        if c == 0:
            break

        if not (32 <= c < 127):
            return None

        out.append(c)

    return out.decode() if len(out) >= 4 else None


def chase(mem, addr, depth=3, seen=None, path='')  :
    """Follow pointers a few levels and report any string found."""
    seen = seen if seen is not None else set()

    if depth == 0 or addr in seen or not addr:
        return []

    seen.add(addr)
    found = []
    s = ascii_at(mem, addr)

    if s:
        found.append((path or '*', s))

    for off in range(0, 0x60, 4):
        p = u32(mem, addr + off)

        if p and 0x10000 < p < 0xFFFF0000:
            st = ascii_at(mem, p)

            if st:
                found.append(('%s+0x%X' % (path, off), st))
            elif depth > 1:
                found += chase(mem, p, depth - 1, seen, '%s+0x%X' % (path, off))

    return found


def main():
    log = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cli_seh.log'
    seen_at = 0
    stopped = []
    print('watching %s for a fault...' % log, flush=True)

    while True:
        try:
            size = os.path.getsize(log)
        except OSError:
            time.sleep(0.05)
            continue

        if size > seen_at:
            with open(log, 'rb') as f:
                f.seek(seen_at)
                chunk = f.read().decode('utf-8', 'replace')

            seen_at = size

            # STOP THE PROCESS FIRST, but not before wine has printed the registers: stopping on
            # "starting debugger" freezes wine's auto-debugger too and the dump never arrives.
            # The register dump is followed by the whole module and thread listing, so there is
            # time. Never SIGKILL a Proton client -- that leaks host RAM through the nvidia driver
            # until a reboot.
            if 'Register dump:' in chunk and not stopped:
                for pid in client_pids():
                    try:
                        os.kill(pid, signal.SIGSTOP)
                        stopped.append(pid)
                    except OSError:
                        pass

                print('stopped %s at the fault' % stopped, flush=True)

            if 'Register dump:' in chunk:
                regs = {}

                for m in REG.finditer(chunk):
                    regs['E' + m.group(1)] = int(m.group(2), 16)

                pids = stopped or client_pids()
                print('FAULT regs=%s pids=%s' % (
                    {k: hex(v) for k, v in regs.items()}, pids), flush=True)

                for pid in pids:
                    mem = reader(pid)

                    if not mem:
                        continue

                    # The faulting loop: EDX is the shader stage, [EDX+0x35] the record count,
                    # [EDX+0x10] the record array, and the record's resource pointer sits at
                    # +0x88. Print the records themselves rather than guessing from a 32-byte
                    # window.
                    edx = regs.get('EDX')

                    if edx:
                        cnt = rd(mem, edx + 0x35, 1)
                        arr = u32(mem, edx + 0x10)
                        print('  stage EDX=%08X count=%s array=%s' % (
                            edx, cnt[0] if cnt else '?', hex(arr) if arr else None), flush=True)

                        if arr:
                            stride = None

                            for i in range(int(cnt[0]) if cnt else 4):
                                for st in (0x8C, 0x90, 0x94, 0xA0):
                                    pass

                                base = arr + i * (stride or 0x94)
                                blob = rd(mem, base, 0x8C)

                                if not blob:
                                    break

                                res = u32(mem, base + 0x88)
                                nm = ascii_at(mem, base + 8) or ascii_at(mem, base + 4)
                                print('    rec[%d] @%08X slot=%s resource=%s name=%r' % (
                                    i, base, blob[0], hex(res) if res else 'NULL', nm), flush=True)

                    for name in ('EDX', 'ESI', 'EBX', 'EDI', 'EBP'):
                        a = regs.get(name)

                        if not a:
                            continue

                        raw = rd(mem, a, 0x20)

                        if not raw:
                            continue

                        print('  %s=%08X %s' % (name, a, raw.hex()), flush=True)

                        for where, s in chase(mem, a)[:12]:
                            print('     %s -> %r' % (where, s), flush=True)

                    mem.close()

                # Let it finish dying on its own.
                for pid in stopped:
                    try:
                        os.kill(pid, signal.SIGCONT)
                    except OSError:
                        pass

                return

        time.sleep(0.03)


if __name__ == '__main__':
    main()
