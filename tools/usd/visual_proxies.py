#!/usr/bin/env python3
"""Give BF3 concepts that USD has no type for something you can actually SEE and move.

Lights became UsdLux, physics UsdPhysics, audio UsdMedia, roads BasisCurves, decals real triangles.
Two things were left as bare attributes on an empty Xform, which means a DCC shows nothing at all:

  emitters    5,093 instances across 15 types in mp_001's closure. An artist opening the stage sees
              an empty transform and cannot tell a smoke plume from a spark burst, let alone aim one.
  scattering  what the ground GROWS. 26 typed fields with no indication of where the grass is.

Both get GUIDE geometry: visible and selectable, excluded from a render, and never authoritative --
the typed attributes remain the data. A proxy that rendered would be inventing geometry BF3 never
had, and a scattering proxy in particular is a PREVIEW: BF3 grows instances procedurally at run time
from a density and a mask, so any explicit points here are an illustration, not the data.
"""
import json
import math

from pxr import Gf, Sdf, Usd, UsdGeom, Vt

BF3 = "bf3"

# Types worth drawing. The value is the proxy's size in metres -- an emitter marker has to read at
# level scale without swamping the geometry around it.
EMITTER_TYPES = {
    "EmitterEntityData": 0.35,
    "EmitterDocument": 0.35,
    "EmitterTemplateData": 0.35,
    "EffectEntityData": 0.5,
    "EffectReferenceObjectData": 0.5,
    "SoundEffectEntityData": 0.4,
    "VisualEnvironmentEffectEntityData": 0.6,
    "BaseEmitterData": 0.3,
    "EmitterData": 0.3,
}


def _cone_points(size, segments=8):
    """A stubby cone: a direction you can see at a glance, unlike a sphere or a cube."""
    pts = [Gf.Vec3f(0.0, size, 0.0)]

    for i in range(segments):
        a = 2.0 * math.pi * i / segments
        pts.append(Gf.Vec3f(size * 0.4 * math.cos(a), 0.0, size * 0.4 * math.sin(a)))

    return pts


def _cone(stage, path, size):
    mesh = UsdGeom.Mesh.Define(stage, path)
    pts = _cone_points(size)
    n = len(pts) - 1
    counts, idx = [], []

    for i in range(n):
        counts.append(3)
        idx.extend([0, 1 + i, 1 + (i + 1) % n])

    mesh.CreatePointsAttr(Vt.Vec3fArray(pts))
    mesh.CreateFaceVertexCountsAttr(Vt.IntArray(counts))
    mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(idx))
    mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
    mesh.CreatePurposeAttr(UsdGeom.Tokens.guide)

    return mesh


def emitters(stage, root="/World"):
    """Draw a marker on every emitter and effect entity already authored. -> count.

    Walks what is in the stage rather than re-reading EBX: the entity prims already carry their
    type and their transform, so the marker inherits the placement instead of recomputing it and
    risking a different answer.
    """
    made = 0

    for prim in stage.Traverse():
        blob = prim.GetCustomDataByKey("bf3Entity")

        if not blob:
            continue

        try:
            kind = json.loads(blob).get("type")
        except Exception:                                            # noqa: BLE001
            continue

        size = EMITTER_TYPES.get(kind)

        if size is None or prim.GetChild("proxy").IsValid():
            continue

        _cone(stage, prim.GetPath().AppendChild("proxy"), size)
        made += 1

    return made


def scattering_preview(stage, terrain_json, scatter_scope="/World/TerrainScattering",
                       per_type=400, seed=1):
    """A PointInstancer per scattering type showing roughly WHERE it grows. -> count.

    Deliberately a preview, and marked guide. BF3 stores a density and a mask and grows instances at
    run time; it does not store positions. Authoring points as though they were the data would
    invent instances the game never had and nothing could write them back -- so these are seeded
    from the terrain's own bounds and the type's density, purely so an artist can see that a layer
    IS scattered and roughly how thickly.
    """
    import random

    scope = stage.GetPrimAtPath(scatter_scope)

    if not scope or not scope.IsValid():
        return 0

    doc = terrain_json

    if isinstance(doc, str):
        doc = json.load(open(doc))

    nodes = [n for n in (doc.get("nodes") or []) if n.get("data") and n.get("embedded")]

    if not nodes:
        return 0

    lo, hi = nodes[0]["min"], nodes[0]["max"]
    made = 0

    for prim in Usd.PrimRange(scope):
        dens = prim.GetAttribute(BF3 + ":Density")

        if not dens or not dens.IsValid() or dens.Get() is None:
            continue

        d = float(dens.Get())

        if d <= 0.0:
            continue

        rng = random.Random(seed + made)
        count = max(1, min(per_type, int(per_type * min(d, 1.0))))
        pos = [Gf.Vec3f(rng.uniform(lo[0], hi[0]), float(lo[1]),
                        rng.uniform(lo[2], hi[2])) for _ in range(count)]

        pi = UsdGeom.PointInstancer.Define(stage, prim.GetPath().AppendChild("preview"))
        pi.CreatePositionsAttr(Vt.Vec3fArray(pos))
        pi.CreateProtoIndicesAttr(Vt.IntArray([0] * len(pos)))
        pi.CreatePurposeAttr(UsdGeom.Tokens.guide)

        proto = UsdGeom.Cube.Define(stage, pi.GetPath().AppendChild("proto"))
        proto.CreateSizeAttr(0.25)
        proto.CreatePurposeAttr(UsdGeom.Tokens.guide)
        pi.CreatePrototypesRel().SetTargets([proto.GetPath()])
        pi.GetPrim().CreateAttribute(BF3 + ":previewOnly", Sdf.ValueTypeNames.Bool).Set(True)
        made += 1

    return made
