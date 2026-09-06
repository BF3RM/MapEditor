#!/usr/bin/env python3
"""Terrain mesh scattering: what the ground grows, and how thickly.

This is what puts grass, bushes and rubble across a level without a single hand-placed object.
EBX does not carry it -- `TerrainMeshScatteringType` there is a bare DataContainer with NO fields
(490 of them across BF3) -- so a level could export, round trip, and come back with every blade of
grass gone while every check still passed. The data lives in the VisualTerrain resource, per layer.

Scattering is PROCEDURAL: BF3 stores a density and a mask, and grows instances from them at run
time. It is not a list of placements, so a UsdGeom.PointInstancer would be a lie -- it would invent
explicit instances the game never stored, and they could not be written back. Each scattering type
is authored instead as its own prim carrying every field as a typed `bf3:` attribute, which is the
same shape the 440 entity types already use here.
"""
import json

from pxr import Sdf, Usd, UsdGeom

BF3 = "bf3"
SCOPE = "/World/TerrainScattering"

# name -> USD type. The order is the resource's own field order, which is also the order
# MeshScatteringType.Serialize writes them back in.
FIELDS = [
    ("MeshName", Sdf.ValueTypeNames.String),
    ("VariationAssetNameHash", Sdf.ValueTypeNames.UInt),
    ("Density", Sdf.ValueTypeNames.Float),
    ("LockDensity", Sdf.ValueTypeNames.Bool),
    ("RandomPositionOffset", Sdf.ValueTypeNames.Float),
    ("MinMask", Sdf.ValueTypeNames.Float),
    ("MaxMask", Sdf.ValueTypeNames.Float),
    ("MinScaleX", Sdf.ValueTypeNames.Float),
    ("MinScaleY", Sdf.ValueTypeNames.Float),
    ("MaxScaleX", Sdf.ValueTypeNames.Float),
    ("MaxScaleY", Sdf.ValueTypeNames.Float),
    ("MinMaskScaleFactorX", Sdf.ValueTypeNames.Float),
    ("MinMaskScaleFactorY", Sdf.ValueTypeNames.Float),
    ("ScaleRandomess", Sdf.ValueTypeNames.Float),
    ("WindScale", Sdf.ValueTypeNames.Float),
    ("FirstSpawnLevel", Sdf.ValueTypeNames.Int),
    ("SpawnLevelCount", Sdf.ValueTypeNames.Int),
    ("RotationMode", Sdf.ValueTypeNames.Int),
    ("OrientationMode", Sdf.ValueTypeNames.Int),
    ("RotateTowardSlopeWeight", Sdf.ValueTypeNames.Float),
    ("CastShadowsEnable", Sdf.ValueTypeNames.Bool),
    ("ShadowViewDistance", Sdf.ValueTypeNames.Float),
    ("BillboardingEnable", Sdf.ValueTypeNames.Bool),
    ("BillboardingGpuAccelleration", Sdf.ValueTypeNames.Bool),
    ("InstanceType", Sdf.ValueTypeNames.Int),
    ("GroundClampBoundingBoxEnable", Sdf.ValueTypeNames.Bool),
]

_INT = {Sdf.ValueTypeNames.Int, Sdf.ValueTypeNames.UInt}


def _safe(name):
    """A USD prim name from a mesh path: only alphanumerics and underscore, never leading digit."""
    out = "".join(c if c.isalnum() else "_" for c in (name or "unnamed"))

    return ("s_" + out) if (not out or out[0].isdigit()) else out


def author(stage, visual_terrain_json):
    """Author every scattering type in a dump_visual_terrain JSON. -> count authored."""
    doc = visual_terrain_json

    if isinstance(doc, str):
        doc = json.load(open(doc))

    types = doc.get("Scattering") or doc.get("scattering") or []

    if not types:
        return 0

    UsdGeom.Scope.Define(stage, SCOPE)
    seen = {}
    made = 0

    for entry in types:
        layer = int(entry.get("Layer", entry.get("layer", 0)))
        layer_path = "%s/layer_%d" % (SCOPE, layer)
        UsdGeom.Scope.Define(stage, layer_path)

        base = _safe(entry.get("MeshName") or entry.get("meshName"))
        # A layer can grow the same mesh twice at different densities, so names must not collide.
        n = seen.get((layer, base), 0)
        seen[(layer, base)] = n + 1
        path = "%s/%s%s" % (layer_path, base, "" if n == 0 else "_%d" % n)

        prim = stage.DefinePrim(path, "Scope")
        prim.CreateAttribute(BF3 + ":scatterLayer", Sdf.ValueTypeNames.Int).Set(layer)
        # (layer, index) is the record's address in the resource, and the writeback needs it.
        # Prim ORDER cannot stand in for it: USD traverses children by name, so layer_10 sorts
        # before layer_2 and two grass types on one layer come back in alphabetical order. Matching
        # on MeshName is no better -- a layer may grow the same mesh twice (MP_007 does), and the
        # mesh name may itself be what was edited.
        prim.CreateAttribute(BF3 + ":scatterIndex", Sdf.ValueTypeNames.Int).Set(
            int(entry.get("Index", entry.get("index", n))))

        for field, vtype in FIELDS:
            value = entry.get(field, entry.get(field[0].lower() + field[1:]))

            if value is None:
                continue

            attr = prim.CreateAttribute("%s:%s" % (BF3, field), vtype)
            attr.Set(int(value) if vtype in _INT else
                     (bool(value) if vtype == Sdf.ValueTypeNames.Bool else
                      (str(value) if vtype == Sdf.ValueTypeNames.String else float(value))))

        made += 1

    return made


def read_back(stage):
    """Every authored scattering type, in the shape `author` consumed. -> list of dicts."""
    scope = stage.GetPrimAtPath(SCOPE)

    if not scope or not scope.IsValid():
        return []

    out = []

    for prim in Usd.PrimRange(scope):
        attr = prim.GetAttribute(BF3 + ":scatterLayer")

        if not attr or not attr.IsValid():
            continue

        entry = {"Layer": int(attr.Get())}

        index = prim.GetAttribute(BF3 + ":scatterIndex")

        if index and index.IsValid() and index.Get() is not None:
            entry["Index"] = int(index.Get())

        for field, _ in FIELDS:
            a = prim.GetAttribute("%s:%s" % (BF3, field))

            if a and a.IsValid() and a.Get() is not None:
                entry[field] = a.Get()

        out.append(entry)

    return out
