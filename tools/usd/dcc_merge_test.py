#!/usr/bin/env python3
"""Prove a Blender edit merges back without losing anything.

    tools/usd/dcc_merge_test.py <pristine.usda> <untouched-from-blender.usda> <edited.usda>

Two assertions, and the first is the one that matters: an UNTOUCHED trip through Blender must merge
to zero changes. A merge that reports edits nobody made would rewrite the level every time it passed
through a DCC. The second is that a real edit is still seen, or the first is vacuous.

The third check is why this tool exists at all: Blender's USD export drops customData, custom
attributes and relationships wholesale, so the merged stage is verified to still hold every one.
"""
import os
import sys

from pxr import Usd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import dcc_merge


def _survey(path):
    stage = Usd.Stage.Open(path)
    ent = attrs = rels = 0

    for prim in stage.Traverse():
        if prim.GetCustomDataByKey("bf3Entity"):
            ent += 1

        attrs += sum(1 for a in prim.GetAttributes()
                     if a.GetName().startswith("bf3") and a.HasAuthoredValue())
        rels += sum(1 for r in prim.GetRelationships() if r.GetName().startswith("bf3"))

    return ent, attrs, rels


def main(pristine, untouched, edited):
    bad = 0

    a = dcc_merge.merge(pristine, untouched, "/tmp/dcc_merge_untouched.usda")
    print("untouched    %s" % a)

    if a["moved"] or a["reshaped"] or a["missing"]:
        print("FAIL         an untouched DCC trip must merge to nothing")
        bad += 1

    b = dcc_merge.merge(pristine, edited, "/tmp/dcc_merge_edited.usda")
    print("one edit     %s" % b)

    if b["moved"] != 1 or b["missing"]:
        print("FAIL         expected exactly one move")
        bad += 1

    before, after = _survey(pristine), _survey("/tmp/dcc_merge_edited.usda")
    print("data         %s -> %s" % (before, after))

    if before != after:
        print("FAIL         the merge lost BF3 data")
        bad += 1

    print("RESULT       %s" % ("PASS" if bad == 0 else "FAIL"))

    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
