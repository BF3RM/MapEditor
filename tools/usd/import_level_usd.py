#!/usr/bin/env python3
"""Read a level USD back out to BF3 placements -- the return leg of export_level_usd.py.

The exporter turns a level into /World/<mesh>/inst_N Xforms, each referencing a prototype and
carrying a 4x4. This walks that back: every placement Xform becomes a BF3 LinearTransform again
(right.xyz, up.xyz, forward.xyz, trans.xyz), grouped by mesh name, in the same shape mesh_server
caches as <MAP>.placements.json.

    import_level_usd.py <level.usda> <out-placements.json> [--verify <original.json>]

That means a level can go BF3 -> USD -> edit in a DCC -> BF3: move a building in Blender, save,
import, and the new transform comes back. --verify checks a round trip against the original dump
and reports the largest disagreement, so "it round-trips" is a measurement rather than a claim.

Terrain, Decals and Roads are emitted geometry, not placements; they are reported and skipped.
"""
import json
import os
import sys

from pxr import Usd, UsdGeom                                                # noqa: E402

BF3 = "bf3"
SKIP = ("Terrain", "Decals", "Roads")


def main(usd_path, out_path, verify=None):
    stage = Usd.Stage.Open(usd_path)
    world = stage.GetPrimAtPath("/World")

    if not world:
        print("no /World prim in %s" % usd_path)
        return 2

    level = world.GetCustomDataByKey(BF3 + ":level") or "unknown"
    cache = UsdGeom.XformCache()
    meshes = {}
    skipped = []

    for group in world.GetChildren():
        if group.GetName() in SKIP:
            skipped.append(group.GetName())
            continue

        # The mesh's real BF3 path is in customData; the prim name is a sanitised version of it.
        name = group.GetCustomDataByKey(BF3 + ":mesh")

        if not name:
            continue

        rows = []

        for inst in group.GetChildren():
            m = cache.GetLocalToWorldTransform(inst)
            # USD rows are BF3's basis vectors: right, up, forward, then translation.
            rows.append([float(m[r][c]) for r in range(4) for c in range(3)])

        if rows:
            meshes[name] = rows

    doc = {"level": level, "meshes": meshes}
    json.dump(doc, open(out_path, "w"))

    total = sum(len(v) for v in meshes.values())
    print("level        %s" % level)
    print("meshes       %d distinct" % len(meshes))
    print("placements   %d instances" % total)
    print("skipped      %s (emitted geometry, not placements)" % (", ".join(skipped) or "none"))
    print("wrote        %s" % out_path)

    if verify:
        orig = json.load(open(verify))["meshes"]
        missing = [k for k in orig if k not in meshes]
        extra = [k for k in meshes if k not in orig]
        worst = 0.0
        compared = 0

        for name, rows in orig.items():
            got = meshes.get(name)

            if not got or len(got) != len(rows):
                continue

            for a, b in zip(rows, got):
                for x, y in zip(a, b):
                    worst = max(worst, abs(float(x) - float(y)))
                    compared += 1

        print("\nverify against %s" % os.path.basename(verify))
        print("  meshes missing / extra : %d / %d" % (len(missing), len(extra)))
        print("  floats compared        : %d" % compared)
        print("  largest disagreement   : %.9f" % worst)
        print("  ROUND TRIP: %s" % ("EXACT" if worst == 0.0 else
                                    ("within float32 (%.2e)" % worst if worst < 1e-3 else "MISMATCH")))

    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)

    argv = sys.argv[1:]
    ver = None

    if "--verify" in argv:
        i = argv.index("--verify")
        ver = argv[i + 1]
        del argv[i:i + 2]

    sys.exit(main(argv[0], argv[1], ver))
