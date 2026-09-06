#!/usr/bin/env python3
"""The terrain's layer palette: what the ground can be painted with, and which shader blends it.

`SingleTerrainLayerData` in EBX (268 instances) is another bare marker -- the layers themselves live
in the VisualTerrain resource, alongside the combination draws that say which shader runs for which
set of layers at which LOD. Without these a level keeps its heights and its scattering but forgets
what the ground is MADE of, and every surface falls back to one material.

Scattering lives in scattering.py; this is everything else the resource carries.
"""
import json

from pxr import Sdf, Usd, UsdGeom

BF3 = "bf3"
SCOPE = "/World/TerrainLayers"

# Whole-resource fields, authored as customData on the scope.
DOC_META = ["SurfaceShader", "StreamingTree", "Decals", "LayerCount", "TextureAtlasWidth",
            "TextureAtlasHeight", "TextureSamplesPerMeterMax"]


def author(stage, visual_terrain_json):
    """-> (layer count, draw count)."""
    doc = visual_terrain_json

    if isinstance(doc, str):
        doc = json.load(open(doc))

    root = UsdGeom.Scope.Define(stage, SCOPE)
    root.GetPrim().SetCustomDataByKey(BF3 + ":visualTerrain", json.dumps(
        {k: doc.get(k) for k in DOC_META if doc.get(k) is not None}))

    virtual = doc.get("LayerVirtualTexture") or []

    for i, vt in enumerate(virtual):
        prim = stage.DefinePrim("%s/layer_%02d" % (SCOPE, i), "Scope")
        prim.CreateAttribute(BF3 + ":layerIndex", Sdf.ValueTypeNames.Int).Set(i)
        prim.CreateAttribute(BF3 + ":virtualTextureEnable", Sdf.ValueTypeNames.Bool).Set(bool(vt))

    # One prim per combination draw. Ordinal identity: several draws share a shader and a layer
    # set, differing only in kind and level, so nothing else is unique.
    draws = doc.get("Draws") or []
    UsdGeom.Scope.Define(stage, SCOPE + "/draws")

    for i, draw in enumerate(draws):
        prim = stage.DefinePrim("%s/draws/draw_%04d" % (SCOPE, i), "Scope")
        prim.CreateAttribute(BF3 + ":drawShader", Sdf.ValueTypeNames.String).Set(
            draw.get("Shader") or "")
        prim.CreateAttribute(BF3 + ":drawKind", Sdf.ValueTypeNames.String).Set(
            draw.get("Kind") or "")
        prim.CreateAttribute(BF3 + ":drawLevel", Sdf.ValueTypeNames.Int).Set(
            int(draw.get("Level", 0)))
        prim.CreateAttribute(BF3 + ":drawLayers", Sdf.ValueTypeNames.IntArray).Set(
            [int(x) for x in (draw.get("Layers") or [])])

    return len(virtual), len(draws)


def read_back(stage):
    """-> a dict in the dump's own shape."""
    scope = stage.GetPrimAtPath(SCOPE)

    if not scope or not scope.IsValid():
        return {}

    out = json.loads(scope.GetCustomDataByKey(BF3 + ":visualTerrain") or "{}")
    layers, draws = [], []

    for prim in Usd.PrimRange(scope):
        a = prim.GetAttribute(BF3 + ":virtualTextureEnable")

        if a and a.IsValid() and a.Get() is not None:
            layers.append((int(prim.GetAttribute(BF3 + ":layerIndex").Get()), bool(a.Get())))
            continue

        sh = prim.GetAttribute(BF3 + ":drawShader")

        if sh and sh.IsValid() and sh.Get() is not None:
            draws.append({
                "Shader": sh.Get(),
                "Kind": prim.GetAttribute(BF3 + ":drawKind").Get(),
                "Level": int(prim.GetAttribute(BF3 + ":drawLevel").Get()),
                "Layers": [int(x) for x in (prim.GetAttribute(BF3 + ":drawLayers").Get() or [])],
            })

    out["LayerVirtualTexture"] = [v for _i, v in sorted(layers)]
    out["Draws"] = draws

    return out
