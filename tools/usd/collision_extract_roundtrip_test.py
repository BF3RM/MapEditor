#!/usr/bin/env python3
"""Prove the game's OWN collision survives extraction into USD and back out.

    tools/usd/collision_extract_roundtrip_test.py /tmp/shapes-radiotower.json

Authoring collision already worked; what was missing was reading the game's existing shapes, so
collision could be added but never edited. This closes that loop: Rime's dump_collision_shapes ->
USD prims -> descriptors that build_collision.build() consumes.
"""
import json
import os
import sys

from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import collision


def _descriptors(dump):
    """Rime's shape JSON -> the descriptor shape collision.author consumes."""
    out = []

    for s in dump.get("Shapes") or []:
        d = {"kind": s["Kind"], "centre": tuple(s["Centre"]), "radius": float(s.get("Radius", 0.0))}

        if s["Kind"] == "box":
            d["half"] = tuple(s["HalfExtents"])
        else:
            d["verts"] = [tuple(v) for v in s.get("Vertices") or []]
            d["planes"] = [tuple(p) for p in s.get("Planes") or []]

        out.append(d)

    return out


def main(path):
    dump = json.load(open(path))
    src = _descriptors(dump)
    boxes = [d for d in src if d["kind"] == "box"]
    hulls = [d for d in src if d["kind"] == "convex"]
    print("extracted    %d shape(s): %d box, %d convex  (%s)"
          % (len(src), len(boxes), len(hulls), os.path.basename(path)))

    if not src:
        print("FAIL         nothing extracted")
        return 1

    stage = Usd.Stage.CreateInMemory()
    root = UsdGeom.Xform.Define(stage, "/World")
    n = collision.author(stage, root, src)
    print("authored     %s prim(s)" % n)

    tmp = "/tmp/collision_extract_rt.usda"
    stage.GetRootLayer().Export(tmp)
    back = collision.read(tmp)
    print("read back    %d descriptor(s)" % len(back))

    if len(back) != len(src):
        print("FAIL         %d -> %d" % (len(src), len(back)))
        return 1

    def close(a, b, tol=1e-4):
        return abs(float(a) - float(b)) <= tol

    bad = 0
    checked = 0

    for i, (a, b) in enumerate(zip(src, back)):
        if a["kind"] != b.get("kind"):
            print("FAIL         shape %d kind %s -> %s" % (i, a["kind"], b.get("kind")))
            bad += 1
            continue

        for k in range(3):
            checked += 1

            if not close(a["centre"][k], b["centre"][k]):
                print("FAIL         shape %d centre[%d] %r -> %r" % (i, k, a["centre"][k], b["centre"][k]))
                bad += 1

        if a["kind"] == "box":
            for k in range(3):
                checked += 1

                if not close(a["half"][k], b["half"][k]):
                    print("FAIL         shape %d half[%d] %r -> %r" % (i, k, a["half"][k], b["half"][k]))
                    bad += 1
        else:
            if len(a["verts"]) != len(b.get("verts") or []):
                print("FAIL         shape %d verts %d -> %d" % (i, len(a["verts"]), len(b.get("verts") or [])))
                bad += 1
                continue

            checked += 1

            if len(a["planes"]) != len(b.get("planes") or []):
                print("FAIL         shape %d planes %d -> %d"
                      % (i, len(a["planes"]), len(b.get("planes") or [])))
                bad += 1

            for vi, (va, vb) in enumerate(zip(a["verts"], b["verts"])):
                for k in range(3):
                    checked += 1

                    if not close(va[k], vb[k]):
                        print("FAIL         shape %d vert %d[%d] %r -> %r" % (i, vi, k, va[k], vb[k]))
                        bad += 1

    print("values       %d compared, %d changed  -> %s"
          % (checked, bad, "PASS" if bad == 0 else "FAIL"))

    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/shapes-radiotower.json"))
