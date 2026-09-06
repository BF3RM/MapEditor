#!/usr/bin/env python3
"""The only test that earns "1:1 with BF3": rebuild the resource and diff the BYTES.

    tools/usd/collision_byte_roundtrip_test.py <original.bin> <shapes.json>

Every other collision check so far proves the representation loses nothing between BF3 and USD. It
does NOT prove BF3 would bake the same file, and those are different claims. This one goes
    original bytes -> shapes -> USD -> descriptors -> rebuilt resource -> diff
and reports where the first difference is, so a mismatch says what is missing rather than just
"not equal".
"""
import json
import os
import sys

from pxr import Usd, UsdGeom

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "havok"))

import collision                                                        # noqa: E402
import build_collision                                                  # noqa: E402
import dump_collision                                                   # noqa: E402


def _descriptors(dump):
    out = []

    for s in dump.get("Shapes") or []:
        d = {"kind": s["Kind"], "centre": tuple(s["Centre"]),
             "radius": float(s.get("Radius", 0.0))}

        if s["Kind"] == "box":
            d["half"] = tuple(s["HalfExtents"])
        else:
            d["verts"] = [tuple(v) for v in s.get("Vertices") or []]
            d["planes"] = [tuple(p) for p in s.get("Planes") or []]

        out.append(d)

    return out


def main(orig_path, shapes_path):
    orig = open(orig_path, "rb").read()
    dump = json.load(open(shapes_path))
    src = _descriptors(dump)
    print("original     %d bytes  (%s)" % (len(orig), os.path.basename(orig_path)))
    print("extracted    %d shape(s)" % len(src))

    stage = Usd.Stage.CreateInMemory()
    root = UsdGeom.Xform.Define(stage, "/World")
    collision.author(stage, root, src)
    tmp = "/tmp/collision_byte_rt.usda"
    stage.GetRootLayer().Export(tmp)
    back = collision.read(tmp)
    print("via USD      %d descriptor(s)" % len(back))

    try:
        rebuilt = build_collision.build(back, wrapper_spec=dump.get("Wrapper"))
    except Exception as e:                                              # noqa: BLE001
        print("rebuild      FAILED: %s: %s" % (type(e).__name__, e))
        return 1

    if isinstance(rebuilt, tuple):
        rebuilt = rebuilt[0]

    print("rebuilt      %d bytes" % len(rebuilt))

    if rebuilt == orig:
        print("BYTES        identical  -> PASS")
        return 0

    # Say WHERE, so a mismatch is actionable rather than a verdict.
    n = min(len(orig), len(rebuilt))
    first = next((i for i in range(n) if orig[i] != rebuilt[i]), n)
    diff = sum(1 for i in range(n) if orig[i] != rebuilt[i]) + abs(len(orig) - len(rebuilt))
    print("BYTES        DIFFER: %d of %d differ; first at 0x%x (%d)"
          % (diff, max(len(orig), len(rebuilt)), first, first))
    print("             orig  %s" % orig[first:first + 24].hex(" "))
    print("             built %s" % rebuilt[first:first + 24].hex(" "))

    try:
        a = dump_collision.read(orig)
        b = dump_collision.read(rebuilt)
        print("             packfiles %d -> %d; objects %s -> %s"
              % (len(a), len(b), [len(p["objects"]) for p in a], [len(p["objects"]) for p in b]))
    except Exception as e:                                              # noqa: BLE001
        print("             (could not decode both for comparison: %s)" % e)

    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
