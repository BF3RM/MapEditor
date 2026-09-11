#!/usr/bin/env python3
"""Read a VU/BF3 crash minidump: exception, registers, and a scan of the stack for return sites.

VU writes one per crash to
%LOCALAPPDATA%/VeniceUnleashed/dumps/<guid>.dmp inside the Proton prefix -- for the CLIENT and the
dedicated SERVER alike, since both are vu.com. A server that "hangs at Loading terrain" and a
client that "just disappears" both leave one, and it is the difference between a guess and a
finding.

vu.com is a 32-bit process: its CONTEXT record is 716 bytes and the registers live at the x86
offsets (Eip 0xB8, Esp 0xC4), not the x64 ones. Reading it as x64 yields plausible-looking
garbage, which is worse than an error.

    vu_minidump.py <dump.dmp> [...]
"""
import struct, sys

def parse(path):
    d = open(path,'rb').read()
    _,_,n,dr = struct.unpack_from('<IIII', d, 0)
    st = {}
    for i in range(n):
        t, size, rva = struct.unpack_from('<III', d, dr+i*12); st[t] = (size, rva)

    mods = []
    _, rva = st[4]
    nm = struct.unpack_from('<I', d, rva)[0]
    for i in range(nm):
        base, size, _c, _t, nrva = struct.unpack_from('<QIIII', d, rva+4+i*108)
        ln = struct.unpack_from('<I', d, nrva)[0]
        mods.append((base, size, d[nrva+4:nrva+4+ln].decode('utf-16le','replace')))
    def who(a):
        for base, size, name in mods:
            if base <= a < base+size:
                return '%s+0x%X' % (name.split('\\')[-1], a-base)
        return None

    _, rva = st[6]
    code, _f, _r, addr, np = struct.unpack_from('<IIQQI', d, rva+8)
    params = struct.unpack_from('<15Q', d, rva+8+32)
    cs, cr = struct.unpack_from('<II', d, rva+8+152)
    c = d[cr:cr+cs]
    r = lambda o: struct.unpack_from('<I', c, o)[0]
    regs = dict(edi=r(0x9C), esi=r(0xA0), ebx=r(0xA4), edx=r(0xA8), ecx=r(0xAC),
                eax=r(0xB0), ebp=r(0xB4), eip=r(0xB8), esp=r(0xC4))

    ranges = []
    if 5 in st:
        _, rva = st[5]
        nr = struct.unpack_from('<I', d, rva)[0]
        for i in range(nr):
            start, sz, mrva = struct.unpack_from('<QII', d, rva+4+i*16)
            ranges.append((start, sz, mrva))
    def read(a, ln):
        for start, sz, off in ranges:
            if start <= a < start+sz:
                k = off + (a-start); return d[k:k+min(ln, sz-(a-start))]
        return b''

    print('== %s' % path.split('/')[-1])
    print('   0x%08X ACCESS_VIOLATION %s 0x%X   eip=%s' % (
        code, 'writing' if params[0] == 1 else 'reading', params[1], who(regs['eip'])))
    for k in ('eax','ebx','ecx','edx','esi','edi','ebp','esp'):
        print('   %-3s 0x%08X %s' % (k, regs[k], who(regs[k]) or ''))
    stack = read(regs['esp'], 0x1000)
    print('   stack captured: %d bytes' % len(stack))
    seen = []
    for i in range(0, max(0, len(stack)-4), 4):
        v = struct.unpack_from('<I', stack, i)[0]
        w = who(v)
        if w and w.startswith('vu.com') and w not in seen:
            seen.append(w)
    for w in seen[:20]:
        print('     ret? %s' % w)

for p in sys.argv[1:]:
    parse(p)
