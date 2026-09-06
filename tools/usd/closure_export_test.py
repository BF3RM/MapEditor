#!/usr/bin/env python3
"""Prove the closure is authored into USD and comes back unchanged.

    tools/usd/closure_export_test.py [closure_dir] [limit]

The closure is what makes a level's weapons, soldiers, vehicles and sounds editable rather than
merely shipped. This authors it into a stage, exports, reopens, and compares every scalar field --
and refuses to pass on an empty run, which is the failure that has made several earlier checks in
this project look green.
"""
import json
import os
import struct
import sys

from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import closure_export
import level_entities


def _f32(x):
    try:
        return struct.unpack("f", struct.pack("f", float(x)))[0]
    except Exception:                                                # noqa: BLE001
        return x


def _same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b)

    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return _f32(a) == _f32(b)

    return a == b


def main(closure_dir="/tmp/closure", limit=0):
    stage = Usd.Stage.CreateInMemory()
    n_parts, counts = closure_export.author(stage, closure_dir, limit)
    authored = sum(counts.values())
    print("closure      %d partition(s), %d instance(s), %d type(s)"
          % (n_parts, authored, len(counts)))

    if n_parts == 0 or authored == 0:
        print("FAIL         nothing authored -- an empty pass is not a pass")
        return 1

    # It must land under the library scope, not loose in the level's hierarchy: a soldier blueprint
    # is an asset the level draws on, not something placed in its world.
    tmp = "/tmp/closure_export.usda"
    stage.GetRootLayer().Export(tmp)
    reopened = Usd.Stage.Open(tmp)
    lib = reopened.GetPrimAtPath(closure_export.SCOPE)

    if not lib or not lib.IsValid():
        print("FAIL         %s missing" % closure_export.SCOPE)
        return 1

    got = {}

    for prim in Usd.PrimRange(lib):
        blob = prim.GetCustomDataByKey("bf3Entity")

        if not blob:
            continue

        try:
            rec = json.loads(blob)
            got[(str(rec.get("partition")), str(rec.get("instance")).lower())] = prim
        except Exception:                                            # noqa: BLE001
            continue

    print("read back    %d prim(s) under %s" % (len(got), closure_export.SCOPE))

    parts = sorted(f[:-5] for f in os.listdir(closure_dir) if f.endswith(".json"))

    if limit:
        parts = parts[:limit]

    checked = changed = missing = 0

    for part in parts:
        try:
            doc = json.load(open(os.path.join(closure_dir, part + ".json")))
        except Exception:                                            # noqa: BLE001
            continue

        for ig, inst in (doc.get("Instances") or {}).items():
            if not inst.get("$type"):
                continue

            prim = got.get((part, str(ig).lower()))

            if prim is None:
                missing += 1
                continue

            for k, v in inst.items():
                if k in level_entities._SKIP_FIELDS or isinstance(v, (dict, list)):
                    continue

                attr = prim.GetAttribute("bf3" + k)

                if not attr or not attr.IsValid() or attr.Get() is None:
                    continue

                checked += 1

                if not _same(v, attr.Get()):
                    changed += 1

    names = json.loads(lib.GetCustomDataByKey("bf3:closureNames") or "{}")
    print("fields       %d compared, %d changed" % (checked, changed))
    print("instances    %d never authored" % missing)
    print("names        %d partition name(s) carried" % len(names))

    ok = changed == 0 and missing == 0 and checked > 0 and len(names) == n_parts
    print("RESULT       %s" % ("PASS" if ok else "INCOMPLETE"))

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/closure",
                  int(sys.argv[2]) if len(sys.argv) > 2 else 0))
