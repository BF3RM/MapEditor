#!/usr/bin/env python3
"""The terrain's painted rasters: mask, material and destruction-depth trees.

These are what make ground look painted rather than tiled -- which layer shows where, which material
a footstep or a bullet finds, and how deep it can be dug. EBX carries none of it: `TerrainMaskTree`,
`TerrainMaterialTree`, `TerrainColorTree` and `DestructionDepthTree` are bare markers (33 instances
each), and the rasters live in the heightfield resource beside the heights.

They are carried as base64 sample blocks rather than images. That is deliberate: a mask node is a
quadtree cell at its own resolution (66 samples/side here, against 256 for material and 133 for
destruction), and flattening those into one picture is the same lossy trap the heightfield hit --
the composite cannot be resampled back without changing cells nobody touched. Bytes preserved
exactly is worth more than bytes that look editable and are not; making them paintable needs the
per-node story heights now have, and is called out as open rather than pretended.
"""
import base64
import json

from pxr import Gf, Sdf, Usd, UsdGeom, Vt

BF3 = "bf3"
SCOPE = "/World/TerrainTrees"

# dump key -> the scope it is authored under
TREES = [
    ("maskNodes", "mask"),
    ("materialNodes", "material"),
    ("destructionNodes", "destruction"),
]

# Carried per node, with the USD type to author it as.
META = [
    ("level", Sdf.ValueTypeNames.Int),
    ("indexX", Sdf.ValueTypeNames.Int),
    ("indexY", Sdf.ValueTypeNames.Int),
    ("samplesPerSide", Sdf.ValueTypeNames.Int),
    ("reencodesExactly", Sdf.ValueTypeNames.Bool),
]

# Whole-tree fields that are not per node.
DOC_META = ["maskSamplesPerSide", "materialSamplesPerSide", "destructionSamplesPerSide",
            "backgroundMaterialIndex", "hasMaterialTree", "materialPairIndices", "rasterTrees",
            "maskRawLength", "maskConsumed", "maskRawHead", "nodeBorderWidth", "samplesPerSide",
            "worldScaleY", "worldSizeY", "resource"]


def author(stage, terrain_json):
    """Author every raster tree node. -> {tree: count}."""
    doc = terrain_json

    if isinstance(doc, str):
        doc = json.load(open(doc))

    root = UsdGeom.Scope.Define(stage, SCOPE)
    made = {}

    # Provenance and the tree-wide numbers, so the stage can rebuild the resource header and not
    # merely its nodes.
    root.GetPrim().SetCustomDataByKey(BF3 + ":terrainTrees", json.dumps(
        {k: doc.get(k) for k in DOC_META if doc.get(k) is not None}))

    for key, short in TREES:
        nodes = doc.get(key) or []

        if not nodes:
            made[short] = 0
            continue

        UsdGeom.Scope.Define(stage, "%s/%s" % (SCOPE, short))
        n = 0

        for ordinal, node in enumerate(nodes):
            if not node.get("samples"):
                continue

            # ORDINAL, not (level, x, y): the mask tree holds many nodes per cell -- 307 nodes over
            # 6 distinct cells here, up to 88 sharing one -- so the triple is not an identity and
            # naming by it silently collapses 307 nodes into 6.
            path = "%s/%s/node_%05d" % (SCOPE, short, ordinal)
            prim = stage.DefinePrim(path, "Scope")
            prim.CreateAttribute(BF3 + ":tree", Sdf.ValueTypeNames.String).Set(short)
            prim.CreateAttribute(BF3 + ":samples", Sdf.ValueTypeNames.String).Set(node["samples"])

            for field, vtype in META:
                if node.get(field) is None:
                    continue

                v = node[field]
                prim.CreateAttribute("%s:%s" % (BF3, field), vtype).Set(
                    bool(v) if vtype == Sdf.ValueTypeNames.Bool else int(v))

            for field in ("min", "max"):
                if node.get(field) is not None:
                    # A float ARRAY, not a Vec3: the raster trees carry 2D bounds ([x, z]) while
                    # the heightfield carries 3D, and a fixed arity silently drops or invents a
                    # component.
                    prim.CreateAttribute("%s:%s" % (BF3, field),
                                         Sdf.ValueTypeNames.FloatArray).Set(
                        Vt.FloatArray([float(x) for x in node[field]]))

            n += 1

        made[short] = n

    return made


def read_back(stage):
    """Every authored node, in the dump's own shape. -> {dumpKey: [node, ...]}."""
    out = {key: [] for key, _ in TREES}
    short_to_key = {short: key for key, short in TREES}
    scope = stage.GetPrimAtPath(SCOPE)

    if not scope or not scope.IsValid():
        return out

    # Zero-padded ordinals, so traversal order is dump order.
    for prim in Usd.PrimRange(scope):
        tree = prim.GetAttribute(BF3 + ":tree")

        if not tree or not tree.IsValid():
            continue

        node = {"samples": prim.GetAttribute(BF3 + ":samples").Get()}

        for field, _ in META:
            a = prim.GetAttribute("%s:%s" % (BF3, field))

            if a and a.IsValid() and a.Get() is not None:
                node[field] = a.Get()

        for field in ("min", "max"):
            a = prim.GetAttribute("%s:%s" % (BF3, field))

            if a and a.IsValid() and a.Get() is not None:
                node[field] = [float(x) for x in a.Get()]

        out[short_to_key[tree.Get()]].append(node)

    return out


def sample_bytes(node):
    """The node's raster payload, decoded."""
    return base64.b64decode(node["samples"])
