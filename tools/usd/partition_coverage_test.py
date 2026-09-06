#!/usr/bin/env python3
"""How much of the GAME round-trips, not just how much of a level.

    tools/usd/partition_coverage_test.py [dir] [limit]

The pipeline is often judged on one level, which flatters it: a level's own partitions are a narrow
slice of what BF3 contains. Weapons, characters, vehicles, sounds and destruction live in other
partitions entirely, and a claim of "everything round trips" has to be measured against those too.

This authors every partition in a directory and reads it back, comparing every scalar field, and
reports coverage per TYPE so the gaps are named rather than averaged away.
"""
import collections
import glob
import json
import os
import struct
import sys

from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import level_entities


def _f32(x):
    try:
        return struct.unpack('f', struct.pack('f', float(x)))[0]
    except Exception:                                                   # noqa: BLE001
        return x


def _same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b)

    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return _f32(a) == _f32(b)

    return a == b


def main(src="/tmp/closure", limit=0):
    files = sorted(glob.glob(os.path.join(src, "**", "*.json"), recursive=True))

    if limit:
        files = files[:limit]

    print("corpus       %d partition(s) from %s" % (len(files), src))

    if not files:
        print("FAIL         nothing to measure")
        return 1

    # level_entities.author takes names relative to a directory, without .json.
    parts = [os.path.relpath(f, src)[:-5] for f in files]

    stage = Usd.Stage.CreateInMemory()
    root = UsdGeom.Xform.Define(stage, "/World")
    counts, placed = level_entities.author(stage, root, src, parts)
    authored = sum(counts.values())
    print("authored     %d instance(s) across %d type(s)" % (authored, len(counts)))

    if authored == 0:
        print("FAIL         nothing authored -- an empty pass is not a pass")
        return 1

    tmp = "/tmp/partition_coverage.usda"
    stage.GetRootLayer().Export(tmp)
    reopened = Usd.Stage.Open(tmp)

    # Index by the instance guid inside each prim's bf3Entity record -- that is the identity
    # level_entities writes, and prim names are positional (e00001) rather than meaningful.
    got = {}

    for prim in reopened.Traverse():
        blob = prim.GetCustomDataByKey("bf3Entity")

        if not blob:
            continue

        try:
            got[str(json.loads(blob).get("instance")).lower()] = prim
        except Exception:                                               # noqa: BLE001
            continue

    checked = collections.Counter()
    changed = collections.Counter()
    missing = collections.Counter()

    for f, part in zip(files, parts):
        try:
            doc = json.load(open(f))
        except Exception:                                               # noqa: BLE001
            continue

        for ig, inst in (doc.get("Instances") or {}).items():
            t = inst.get("$type")

            if not t:
                continue

            prim = got.get(str(ig).lower())

            if prim is None:
                missing[t] += 1
                continue

            for k, v in inst.items():
                if k in level_entities._SKIP_FIELDS or isinstance(v, (dict, list)):
                    continue

                attr = prim.GetAttribute("bf3" + k)

                if not attr or not attr.IsValid() or attr.Get() is None:
                    continue

                checked[t] += 1

                if not _same(v, attr.Get()):
                    changed[t] += 1

    total_checked = sum(checked.values())
    total_changed = sum(changed.values())
    total_missing = sum(missing.values())

    print("fields       %d compared, %d changed" % (total_checked, total_changed))
    print("instances    %d never authored" % total_missing)

    if changed:
        print("\nTYPES WITH CHANGED FIELDS")

        for t, n in changed.most_common(15):
            print("   %-44s %d of %d" % (t[:44], n, checked[t]))

    if missing:
        print("\nTYPES NEVER AUTHORED (top 15 of %d)" % len(missing))

        for t, n in missing.most_common(15):
            print("   %-44s %d" % (t[:44], n))

    ok = total_changed == 0 and total_missing == 0
    print("\nRESULT       %s" % ("PASS" if ok else "INCOMPLETE"))

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/closure",
                  int(sys.argv[2]) if len(sys.argv) > 2 else 0))
