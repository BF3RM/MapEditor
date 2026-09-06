#!/usr/bin/env python3
"""Prove references become relationships, that an untouched stage reports no edits, and that a real
re-point IS detected.

    tools/usd/references_test.py [closure_dir] [limit]

The middle check is the one that matters: a reader that reports every reference as changed would
rewrite every partition on every trip, and a reader that reports none would make re-pointing
impossible. Both fail silently, so both are asserted.
"""
import os
import sys

from pxr import Usd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import closure_export
import references


def main(closure_dir="/tmp/closure", limit=400):
    stage = Usd.Stage.CreateInMemory()
    n, counts = closure_export.author(stage, closure_dir, limit)
    linked, unresolved = references.link(stage, [closure_dir])
    print("closure      %d partition(s), %d instance(s)" % (n, sum(counts.values())))
    print("references   %d linked, %d unresolved" % (linked, unresolved))

    if linked == 0:
        print("FAIL         nothing linked")
        return 1

    tmp = "/tmp/references_test.usda"
    stage.GetRootLayer().Export(tmp)
    ro = Usd.Stage.Open(tmp)

    edits = references.read(ro, [closure_dir])
    print("untouched    %d re-point(s) reported  -> %s"
          % (len(edits), "PASS" if not edits else "FAIL"))

    if edits:
        return 1

    # A real edit must be seen, or the check above is vacuous.
    target = None

    for prim in ro.Traverse():
        for r in prim.GetRelationships():
            if r.GetName().startswith("bf3") and len(r.GetTargets()) == 1:
                target = (prim, r)
                break

        if target:
            break

    if target is None:
        print("FAIL         no single-target relationship to exercise")
        return 1

    prim, rel = target
    other = next(p.GetPath() for p in ro.Traverse()
                 if p.GetCustomDataByKey("bf3Entity") and p.GetPath() != rel.GetTargets()[0])
    rel.SetTargets([other])
    ro.GetRootLayer().Export(tmp)
    seen = references.read(Usd.Stage.Open(tmp), [closure_dir])
    print("re-pointed   %d reported  -> %s" % (len(seen), "PASS" if len(seen) == 1 else "FAIL"))

    return 0 if len(seen) == 1 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/closure",
                  int(sys.argv[2]) if len(sys.argv) > 2 else 400))
