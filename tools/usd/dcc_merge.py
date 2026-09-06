#!/usr/bin/env python3
"""Merge a DCC's edits back onto the pristine stage, because Blender's USD export cannot be trusted.

MEASURED, on a 40-partition slice round-tripped through Blender 5.2:

    bf3Entity records   1,208 -> 0        all lost
    typed attributes   10,407 -> 27       99.7% lost
    relationships         436 -> 0        all lost
    prims               2,862 -> 445

Blender drops customData, custom attributes and relationships wholesale. Taking its export as the
new stage would silently destroy every field, every reference and the very records the writeback
reads -- while LOOKING correct, because the geometry survives and a level still builds.

So the DCC's output is treated as what it actually is: a source of transforms and geometry, nothing
else. Everything BF3-specific is read from the stage that was exported, which never left this
toolchain. An artist moves, rotates and reshapes in Blender; the field edits they cannot do there
anyway stay untouched rather than being wiped.

Prims are matched by path BELOW THE ROOT, because Blender re-roots what it imports: `/World/...`
comes back as `/root/...`. A prim the DCC deleted is left alone rather than removed -- deleting is a
destructive intent that a lossy round trip cannot be trusted to express.
"""
import json

from pxr import Gf, Usd, UsdGeom


_UNIQUIFIER = __import__("re").compile(r"_\d{3}$")


def _rel_path(path):
    """A prim path without its root component, and without Blender's uniquifier suffix.

    Two things Blender does to paths, both measured rather than assumed:

      * It re-roots the stage: `/World/Library/...` comes back as `/root/Library/...`. Matching on
        the full path found 82 of 82 prims "missing" while the stage was intact.
      * Blender objects share ONE flat namespace, so a leaf name that repeats under different
        parents is uniquified: `e00000` becomes `e00000_005`, `e00000_006`. Parent paths survive
        exactly, and within a parent our names are already unique, so the suffix is pure noise --
        it accounted for the other 51 "missing".

    Our own prims are named `e%05d`, which cannot end in `_NNN`, so stripping it is unambiguous.
    """
    parts = str(path).lstrip("/").split("/")

    if len(parts) < 2:
        return ""

    # Every component, not just the leaf: a secondary transform authored as a CHILD sits under a
    # parent that was itself uniquified, so stripping only the last segment left it unmatched.
    return "/".join(_UNIQUIFIER.sub("", x) for x in parts[1:])


def _local(prim):
    return UsdGeom.Xformable(prim).GetLocalTransformation(Usd.TimeCode.Default())


def _world(prim):
    """World transform, which is the only frame the two stages agree in.

    Blender applies its Y-up/Z-up conversion on the ROOT prim and leaves children in its own space,
    so a child's LOCAL transform comes back rotated even when nothing was touched -- measured, 31 of
    82 prims reported as moved on an untouched round trip, each one (x, y, z) -> (x, -z, y).
    Comparing worlds cancels the root correction; the new local is then derived back out of it.
    """
    return UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default())


def merge(pristine_path, dcc_path, out_path, tolerance=1e-6):
    """-> {'moved': n, 'reshaped': n, 'missing': n, 'checked': n}. Writes the merged stage."""
    base = Usd.Stage.Open(pristine_path)
    dcc = Usd.Stage.Open(dcc_path)
    stats = {"moved": 0, "reshaped": 0, "missing": 0, "checked": 0}

    by_rel = {}

    for p in dcc.Traverse():
        by_rel[_rel_path(p.GetPath())] = p

    for prim in base.Traverse():
        if not prim.IsA(UsdGeom.Xformable):
            continue

        other = by_rel.get(_rel_path(prim.GetPath()))
        stats["checked"] += 1

        if not other or not other.IsValid():
            stats["missing"] += 1
            continue

        # Transform: only when it actually differs, so an untouched stage merges to a no-op.
        a, b = _world(prim), _world(other)

        if not Gf.IsClose(a, b, tolerance):
            # Put the world change back as a LOCAL transform in the pristine hierarchy, or the
            # parent's placement would be folded into the child on every trip.
            parent = prim.GetParent()
            pw = _world(parent) if parent and parent.IsA(UsdGeom.Xformable) else Gf.Matrix4d(1.0)
            xf = UsdGeom.Xformable(prim)
            xf.ClearXformOpOrder()
            xf.AddTransformOp().Set(b * pw.GetInverse())
            stats["moved"] += 1

        # Geometry, when both are meshes and the points moved.
        if prim.IsA(UsdGeom.Mesh) and other.IsA(UsdGeom.Mesh):
            pa = UsdGeom.Mesh(prim).GetPointsAttr().Get()
            pb = UsdGeom.Mesh(other).GetPointsAttr().Get()

            if pb is not None and (pa is None or len(pa) != len(pb)
                                   or any(not Gf.IsClose(x, y, tolerance)
                                          for x, y in zip(pa, pb))):
                UsdGeom.Mesh(prim).GetPointsAttr().Set(pb)
                stats["reshaped"] += 1

    base.GetRootLayer().Export(out_path)

    return stats
