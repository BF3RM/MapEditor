#!/usr/bin/env python3
"""Prove the terrain round trip is byte-exact against BF3's own samples.

Two things have to be true, and only the first is obvious:

  1. An EDITED node comes back with exactly the bytes the edit implies.
  2. An UNTOUCHED terrain emits NOTHING. This is the one that matters for vanilla accuracy -- if
     export/import perturbs even one sample, every bundle rewrites trees the game already ships,
     and the level stops being the level.

    tools/usd/terrain_roundtrip_test.py /tmp/mp001-terrain-rt.json
"""
import base64
import json
import os
import sys

import numpy as np
from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import export_level_usd
import terrain_lod
import terrain_write


def _nodes(doc):
    return [n for n in doc.get("nodes") or [] if n.get("data") and n.get("embedded")]


def main(terrain_json):
    doc = json.load(open(terrain_json))
    side = int(doc["samplesPerSide"])
    skirt = int(doc.get("nodeBorderWidth", terrain_lod.SKIRT))
    scale_y = float(doc["worldScaleY"])
    inner = side - 2 * skirt
    nodes = _nodes(doc)
    print("terrain      %d embedded node(s), %dx%d interior, scaleY %.9f"
          % (len(nodes), inner, inner, scale_y))

    stage = Usd.Stage.CreateInMemory()
    made = export_level_usd._export_terrain_nodes(stage, doc)
    print("export       %d node mesh(es) authored" % made)

    if made != len(nodes):
        print("FAIL         authored %d of %d nodes" % (made, len(nodes)))
        return 1

    tmp = "/tmp/terrain_rt_stage.usda"
    stage.GetRootLayer().Export(tmp)

    # 1. Untouched: nothing may be emitted.
    out = "/tmp/terrain_rt_edits.json"
    changed, path = terrain_write.edits_from_stage(tmp, terrain_json, out)
    print("untouched    %d changed node(s)  -> %s" % (changed, "PASS" if changed == 0 else "FAIL"))

    if changed != 0:
        return 1

    # 2. Per-sample equality, read straight back off the authored meshes.
    stage2 = Usd.Stage.Open(tmp)
    worst = 0
    checked = 0

    for node in nodes:
        was = terrain_lod._grid(node, side, skirt)
        now = terrain_write._node_prim_grid(stage2, node, side, skirt)

        if now is None:
            print("FAIL         node %s missing from the stage" % node.get("depth"))
            return 1

        back = np.rint(now / scale_y).astype("<u2")
        worst = max(worst, int(np.abs(back.astype(np.int64) - was.astype(np.int64)).max()))
        checked += back.size

    print("samples      %d checked, worst deviation %d  -> %s"
          % (checked, worst, "PASS" if worst == 0 else "FAIL"))

    if worst != 0:
        return 1

    # 3. An edit must survive exactly, and only its own node may move.
    target = max(nodes, key=lambda n: int(n.get("depth", 0)))
    name = "node_%d_%d_%d" % (int(target.get("depth", 0)), int(target.get("indexX", 0)),
                              int(target.get("indexY", 0)))
    prim = None

    for p in stage2.Traverse():
        if p.GetName() == name and p.IsA(UsdGeom.Mesh):
            prim = p
            break

    mesh = UsdGeom.Mesh(prim)
    pts = list(mesh.GetPointsAttr().Get())
    bump = 100.0 * scale_y                      # exactly 100 stored units
    pts[0] = (pts[0][0], pts[0][1] + bump, pts[0][2])
    mesh.GetPointsAttr().Set(pts)
    stage2.GetRootLayer().Export(tmp)

    changed, path = terrain_write.edits_from_stage(tmp, terrain_json, out)
    print("one edit     %d changed node(s)  -> %s" % (changed, "PASS" if changed == 1 else "FAIL"))

    if changed != 1 or path is None:
        return 1

    # The emitted bytes must equal the shipped node with exactly that one sample raised by 100.
    emitted = json.load(open(path))["nodes"][0]
    got = np.frombuffer(base64.b64decode(emitted["data"])[:side * side * 2], dtype="<u2")
    want = np.frombuffer(base64.b64decode(target["data"])[:side * side * 2], dtype="<u2").copy()
    want[skirt * side + skirt] += 100
    same = np.array_equal(got, want)
    diffs = int((got != want).sum())
    print("edited bytes %s (%d sample(s) differ from expectation)"
          % ("PASS" if same else "FAIL", diffs))

    return 0 if same else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mp001-terrain-rt.json"))
