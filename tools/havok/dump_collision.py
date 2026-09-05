#!/usr/bin/env python3
"""Decode a HavokPhysicsData resource end to end: objects, classes and every resolved pointer.

Unlike packfile.py -- which carries sections verbatim so a round trip is byte-exact -- this reads
the trailer, so it can say what each pointer actually points at. That is what makes it a check on
generated files rather than just a parser.
"""
import struct
import sys

MAGIC = struct.pack("<II", 0x57E0E057, 0x10C0C010)


def read(blob):
    bases = []
    i = blob.find(MAGIC)

    while i >= 0:
        bases.append(i)
        i = blob.find(MAGIC, i + 4)

    packs = []

    for base in bases:
        n = struct.unpack_from("<i", blob, base + 20)[0]
        secs = {}

        for k in range(n):
            o = base + 64 + k * 48
            tag = blob[o:o + 19].split(b"\0")[0].decode()
            secs[tag] = struct.unpack_from("<7i", blob, o + 20)

        packs.append((base, blob[base + 16], secs))

    trailer = max(b + s["__data__"][0] + s["__data__"][6] for b, _p, s in packs)
    sizes = struct.unpack_from("<%dI" % len(packs), blob, trailer)
    at = trailer + 4 * len(packs)
    out = []

    for (base, ptr, secs), size in zip(packs, sizes):
        block = blob[at:at + size]
        at += size

        local, i = [], 0

        while True:
            f, t = struct.unpack_from("<2i", block, i)
            i += 8

            if f == -1:
                break

            local.append((f, t))

        glob, g = [], secs["__data__"][2]

        while g + 12 <= size:
            f, s, t = struct.unpack_from("<3i", block, g)
            g += 12

            if f == -1:
                break

            glob.append((f, t))

        d0 = base + secs["__data__"][0]
        cn = blob[base + secs["__classnames__"][0]:][:secs["__classnames__"][6]]
        virt, vo = [], secs["__data__"][3]

        while vo + 12 <= secs["__data__"][4]:
            o, _si, co = struct.unpack_from("<3I", blob, d0 + vo)
            vo += 12

            if co >= len(cn) or o >= secs["__data__"][3]:
                break

            end = cn.find(b"\0", co)
            name = cn[co:end].decode("latin1") if end > co else ""

            # The virtual table is padded out to 16 bytes, and that padding can be wide enough to
            # read as one more entry. A real entry names a class; padding does not.
            if not name.isascii() or not name[:1].isalpha():
                break

            virt.append((o, name))

        out.append(dict(ptr=ptr, data=blob[d0:d0 + secs["__data__"][3]],
                        local=local, glob=glob, objects=virt))

    return out


def show(path):
    for pf in read(open(path, "rb").read()):
        ptrs = {f: ("local", t) for f, t in pf["local"]}
        ptrs.update({f: ("OBJECT", t) for f, t in pf["glob"]})
        byoff = dict(pf["objects"])
        print("\n== %d-bit  %d objects, %d local + %d global fixups"
              % (pf["ptr"] * 8, len(pf["objects"]), len(pf["local"]), len(pf["glob"])))

        for k, (o, name) in enumerate(pf["objects"]):
            end = pf["objects"][k + 1][0] if k + 1 < len(pf["objects"]) else len(pf["data"])
            print("  +%-5d %s" % (o, name))

            for at in range(o, end, 4):
                v = struct.unpack_from("<I", pf["data"], at)[0]
                f = struct.unpack_from("<f", pf["data"], at)[0]

                if at in ptrs:
                    kind, to = ptrs[at]
                    print("      +%-4d -> %s +%d%s" % (at - o, kind, to,
                          "  (" + byoff[to] + ")" if to in byoff else ""))
                elif v and abs(f) > 1e-6 and abs(f) < 1e6:
                    print("      +%-4d %g" % (at - o, f))
                elif v:
                    print("      +%-4d 0x%08x" % (at - o, v))


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print("###", p)
        show(p)
