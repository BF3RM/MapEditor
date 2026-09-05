#!/usr/bin/env python3
"""Find a shipped hkpConvexVerticesShape and read its field layout out of the file.

The fixup tables make this possible without guessing: every pointer field in an object is named by
a local or global fixup, so the array members announce themselves. What is left -- the counts and
the vectors -- falls out of the gaps between them.
"""
import glob
import struct
import sys

from dump_collision import read

WANT = "hkpConvexVerticesShape"


def analyse(path):
    blob = open(path, "rb").read()

    try:
        packs = read(blob)
    except Exception:
        return None

    for pf in packs:
        names = [n for _o, n in pf["objects"]]

        if WANT not in names:
            continue

        ptrs = {f: ("local", t) for f, t in pf["local"]}
        ptrs.update({f: ("OBJECT", t) for f, t in pf["glob"]})
        out = []

        for k, (o, name) in enumerate(pf["objects"]):
            if name != WANT:
                continue

            end = pf["objects"][k + 1][0] if k + 1 < len(pf["objects"]) else len(pf["data"])
            fields = []

            for at in range(o, min(end, o + 160), 4):
                u = struct.unpack_from("<I", pf["data"], at)[0]
                f = struct.unpack_from("<f", pf["data"], at)[0]

                if at in ptrs:
                    fields.append((at - o, "ptr -> %s +%d" % ptrs[at]))
                elif u == 0:
                    continue
                elif 1e-4 < abs(f) < 1e5:
                    fields.append((at - o, "%.6g" % f))
                else:
                    fields.append((at - o, "0x%08x (%d)" % (u, u)))

            out.append((pf["ptr"] * 8, o, end - o, fields))

        if out:
            return out

    return None


if __name__ == "__main__":
    files = sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else "/tmp/hkdump/*.bin"))
    hits = 0

    for p in files:
        r = analyse(p)

        if not r:
            continue

        hits += 1
        print("\n=== %s" % p)

        for bits, off, size, fields in r[:2]:
            print("  %d-bit  object at +%d, %d bytes" % (bits, off, size))

            for at, what in fields:
                print("      +%-4d %s" % (at, what))

        if hits >= 2:
            break

    print("\n%d of %d files contain %s" % (hits, len(files), WANT))
