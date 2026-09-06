#!/usr/bin/env python3
"""Prove the terrain raster trees survive USD byte for byte.

    tools/usd/terrain_trees_roundtrip_test.py [terrain.json]

Compares DECODED bytes, not the base64 text, so a re-encoding that changed padding or line breaks
would still be caught.
"""
import base64
import json
import os
import sys

from pxr import Usd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import terrain_trees


def main(path="/tmp/mp001-terrain-rt.json"):
    doc = json.load(open(path))
    stage = Usd.Stage.CreateInMemory()
    made = terrain_trees.author(stage, doc)
    src_counts = {k: len([n for n in (doc.get(k) or []) if n.get("samples")])
                  for k, _ in terrain_trees.TREES}
    print("source       %s" % {k: src_counts[k] for k, _ in terrain_trees.TREES})
    print("authored     %s" % made)

    for key, short in terrain_trees.TREES:
        if made[short] != src_counts[key]:
            print("FAIL         %s authored %d of %d" % (short, made[short], src_counts[key]))
            return 1

    tmp = "/tmp/terrain_trees_rt.usda"
    stage.GetRootLayer().Export(tmp)
    # Hold the reopened stage: a temporary would expire and take its prims with it.
    reopened = Usd.Stage.Open(tmp)
    back = terrain_trees.read_back(reopened)

    total_bytes = 0
    bad = 0
    checked = 0

    for key, short in terrain_trees.TREES:
        src = [n for n in (doc.get(key) or []) if n.get("samples")]
        got = back[key]                      # ordinal order, which is these nodes' identity

        if len(back[key]) != len(src):
            print("FAIL         %s read back %d of %d" % (short, len(back[key]), len(src)))
            return 1

        for i, node in enumerate(src):
            k = i
            mine = got[i] if i < len(got) else None
            checked += 1

            if mine is None:
                print("FAIL         %s node %s missing" % (short, k))
                bad += 1
                continue

            a = base64.b64decode(node["samples"])
            b = base64.b64decode(mine["samples"])
            total_bytes += len(a)

            if a != b:
                print("FAIL         %s node %s: %d bytes -> %d, %d differ"
                      % (short, k, len(a), len(b),
                         sum(1 for x, y in zip(a, b) if x != y) + abs(len(a) - len(b))))
                bad += 1
                continue

            for field in ("samplesPerSide", "level", "indexX", "indexY"):
                if node.get(field) is not None and int(node[field]) != int(mine.get(field, -1)):
                    print("FAIL         %s node %s .%s %r -> %r"
                          % (short, k, field, node[field], mine.get(field)))
                    bad += 1

    print("nodes        %d checked, %s of raster, %d changed  -> %s"
          % (checked, "%.1f MB" % (total_bytes / 1048576.0), bad, "PASS" if bad == 0 else "FAIL"))

    # The tree-wide header has to survive too, or the nodes cannot be put back in a resource.
    meta = json.loads(reopened.GetPrimAtPath(terrain_trees.SCOPE)
                      .GetCustomDataByKey("bf3:terrainTrees"))
    missing = [k for k in terrain_trees.DOC_META
               if doc.get(k) is not None and meta.get(k) != doc.get(k)]
    print("tree header  %d field(s) carried, %d changed  -> %s"
          % (len(meta), len(missing), "PASS" if not missing else "FAIL " + str(missing)))

    return 0 if (bad == 0 and not missing) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mp001-terrain-rt.json"))
