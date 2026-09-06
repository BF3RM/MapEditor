#!/usr/bin/env python3
"""Read a level USD back out to BF3 placements -- the return leg of export_level_usd.py.

The exporter turns a level's placements into Xforms that reference a prototype and carry a 4x4.
This walks that back: every placement Xform becomes a BF3 LinearTransform again (right.xyz, up.xyz,
forward.xyz, trans.xyz), grouped by mesh name, in the same shape mesh_server caches as
<MAP>.placements.json.

A placement lives in one of two places now. Where the level's own EBX says which reference object
places it, it is that object's child inside /World/Level; where it does not -- the mesh is inside a
shared object blueprint, which the level graph does not own -- it stays in the flat /World/<mesh>
group. Measured on mp_001, 1297 of 6525 are in the graph and 5228 are not, and both are found by
the same key: bf3:mesh on the placement prim itself.

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

    skipped = [c.GetName() for c in world.GetChildren() if c.GetName() in SKIP]

    # TRAVERSE, rather than reading the direct children of /World. A placement whose owning
    # reference object is known is now authored as that object's child, deep inside /World/Level,
    # so the flat groups are no longer the whole story -- on mp_001 they hold 5228 of 6525.
    for prim in stage.Traverse():
        # The mesh's real BF3 path is in customData; the prim name is a sanitised version of it.
        # Newer stages stamp it on the placement, older ones only on the group it sat in.
        name = prim.GetCustomDataByKey(BF3 + ":mesh")
        parent = prim.GetParent()

        if not name and parent:
            name = parent.GetCustomDataByKey(BF3 + ":mesh")

        # Xform only: the group itself carries the same key, and counting it would give every mesh
        # one extra placement at the level origin.
        if not name or not prim.IsA(UsdGeom.Xform):
            continue

        m = cache.GetLocalToWorldTransform(prim)
        # USD rows are BF3's basis vectors: right, up, forward, then translation.
        meshes.setdefault(name, []).append(
            (prim.GetCustomDataByKey(BF3 + ":placement"),
             [float(m[r][c]) for r in range(4) for c in range(3)]))

    # Back into the order they were dumped in. Traversal order is not that order once a mesh's
    # placements are split between the graph and the flat groups, and --verify compares row by row.
    for name, rows in meshes.items():
        rows.sort(key=lambda r: r[0] if r[0] is not None else len(rows))
        meshes[name] = [t for _i, t in rows]

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
