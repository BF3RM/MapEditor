#!/usr/bin/env python3
"""Export a whole BF3 level to USD: every mesh placement, as an instanced scene.

export_usd.py handles one MeshSet. A level is the other half: which meshes are placed, where, and
how many times. MP_001 is 562 distinct meshes over 6185 placements, so the naive approach -- one
copy of the geometry per placement -- would be gigabytes. USD already solves this: each mesh is
authored ONCE as a prototype in its own file, and every placement is a small Xform that references
it and is marked `instanceable`. The stage stays a few MB and DCCs draw it with hardware instancing.

    export_level_usd.py <placements.json> <out.usdc> [--meshes DIR] [--corpus DIR] [--chunks DIR]
                        [--textures <MAP>.textures.json]

<placements.json> is what mesh_server caches as <MAP>.placements.json:
    {"level": "levels/mp_001/mp_001", "meshes": {"<mesh name>": [[12 floats], ...]}}

The 12 floats are BF3's LinearTransform: right.xyz, up.xyz, forward.xyz, trans.xyz -- a 3x3 basis
followed by a translation, which maps onto a USD 4x4 by putting each vector in a row.

With --corpus/--chunks the referenced prototypes are generated from real MeshSet resources, so the
stage opens with actual geometry. Without them the placements are still exported and the references
resolve as soon as the prototype files exist -- the level graph does not depend on having every
mesh extracted.

With --ebx-dir the stage also gets BF3's own scene graph, at /World/Level: the LevelData at the
root, each world-part reference object owning the WorldPartData it points at, and that world part
owning its objects. A placement whose reference object is in the level's own EBX is authored as
that object's child rather than in the flat /World/<mesh> list, so the geometry and the record that
places it are one thing to select and one thing to move.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import base64
import math

import numpy as np

from pxr import Usd, UsdGeom, UsdShade, Gf, Sdf, Vt                                        # noqa: E402
import bf3_usd                                                              # noqa: E402
from meshset import MeshSet                                                 # noqa: E402

BF3 = "bf3"


def _safe(name):
    out = "".join(c if (c.isalnum() or c == "_") else "_" for c in name)
    return ("_" + out) if (not out or out[0].isdigit()) else out


def _matrix(t):
    """BF3 LinearTransform (right, up, forward, trans) -> USD row-major 4x4."""
    return Gf.Matrix4d(t[0], t[1], t[2], 0.0,
                       t[3], t[4], t[5], 0.0,
                       t[6], t[7], t[8], 0.0,
                       t[9], t[10], t[11], 1.0)


def _corpus_index(corpus):
    """mesh name (lowercased) -> resource path, so placements can be matched to real geometry."""
    index = {}

    if not corpus:
        return index

    for f in sorted(os.listdir(corpus)):
        path = os.path.join(corpus, f)

        try:
            ms = MeshSet.parse(open(path, "rb").read())
        except Exception:
            continue

        if ms.name:
            index[ms.name.lower()] = path

    return index


MISSING_TEXTURES = set()


def _stage_texture(resource):
    """Asset path for a texture used by a prim on the STAGE itself, not in a prototype.

    bf3_usd._texture_asset resolves relative to a prototype, which lives one directory below --
    so its "../textures/x.dds" is wrong here and silently resolves to nothing. Terrain, decals and
    roads are authored on the stage, which is why they came out grey while the props were textured.
    """
    flat = str(resource).replace("/", "__") + ".dds"

    if bf3_usd.TEXTURE_DIR and os.path.exists(os.path.join(bf3_usd.TEXTURE_DIR, flat)):
        return "./%s/%s" % (os.path.basename(bf3_usd.TEXTURE_DIR.rstrip("/")), flat)

    # NOT dumped. This used to return `resource + ".dds"`, a path that resolves to nothing, so a
    # material bound a phantom texture and the surface rendered grey with every check passing.
    # Measured on mp_001: 117 of 118 texture inputs in the stage pointed at files that do not
    # exist -- decal and road textures, which the mesh-texture dump never covered. Reported and
    # left unbound, because a material with no texture is honest and one bound to nothing is not.
    MISSING_TEXTURES.add(str(resource))

    return None


def _texture_material(stage, path, slots, label):
    """A UsdPreviewSurface for a terrain decal or road, from its shader's texture bindings."""
    mat = UsdShade.Material.Define(stage, path)
    shader = UsdShade.Shader.Define(stage, path + "/preview")
    shader.CreateIdAttr("UsdPreviewSurface")

    # Terrain, decals and roads need the same UV reader the prototypes do -- a UsdUVTexture with no
    # "st" connection samples a single texel and renders flat, which looks like a missing texture in
    # anything that evaluates the shader network.
    reader = UsdShade.Shader.Define(stage, path + "/stReader")
    reader.CreateIdAttr("UsdPrimvarReader_float2")
    # String, not Token. Both are legal in USD, but Blender's importer only resolves the varname
    # when it is a string -- as a token it silently fails to find the UV map and every texture
    # samples flat, which is indistinguishable from "the texture did not load".
    reader.CreateInput("varname", Sdf.ValueTypeNames.String).Set("st")
    st_out = reader.CreateOutput("result", Sdf.ValueTypeNames.Float2)

    for slot, resource in slots:
        if not resource:
            continue

        asset = _stage_texture(resource)

        if asset is None:
            # The texture was never dumped. Binding it anyway gives a shader reading from nothing,
            # which renders exactly like a shader with no texture -- so the resource name is kept in
            # customData and the slot is left unbound rather than faked.
            unbound = UsdShade.Shader.Define(stage, "%s/%s" % (path, slot))
            unbound.CreateIdAttr("UsdUVTexture")
            unbound.GetPrim().SetCustomDataByKey(BF3 + ":resource", resource)
            unbound.GetPrim().SetCustomDataByKey(BF3 + ":textureMissing", True)
            continue

        tex = UsdShade.Shader.Define(stage, "%s/%s" % (path, slot))
        tex.CreateIdAttr("UsdUVTexture")
        tex.CreateInput("file", Sdf.ValueTypeNames.Asset).Set(asset)
        tex.CreateInput("st", Sdf.ValueTypeNames.Float2).ConnectToSource(st_out)
        tex.GetPrim().SetCustomDataByKey(BF3 + ":resource", resource)
        out = tex.CreateOutput("rgb", Sdf.ValueTypeNames.Float3)

        if slot == "Diffuse":
            shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(out)
        elif slot == "Normal":
            shader.CreateInput("normal", Sdf.ValueTypeNames.Normal3f).ConnectToSource(out)

    mat.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), "surface")
    mat.GetPrim().SetCustomDataByKey(BF3 + ":shader", label)
    return mat


def _export_decals(stage, path):
    """Terrain decals: road markings, crossings, tyre tracks. Already baked to triangles by the
    dump, in both a 2d (projected onto terrain) and a 3d (fitted to geometry) flavour."""
    doc = json.load(open(path))
    UsdGeom.Scope.Define(stage, "/World/Decals")
    n = 0

    for gi, geom in enumerate(doc.get("geometries", [])):
        pos = geom.get("positions") or []
        uvs = geom.get("uvs") or []
        kind = geom.get("kind", str(gi))

        for gj, group in enumerate(geom.get("groups", [])):
            idx = group.get("indices") or []

            if not idx:
                continue

            prim_path = "/World/Decals/%s_%d" % (_safe(kind), gj)
            mesh = UsdGeom.Mesh.Define(stage, prim_path)
            mesh.CreatePointsAttr(Vt.Vec3fArray([
                Gf.Vec3f(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) for i in range(len(pos) // 3)]))
            mesh.CreateFaceVertexIndicesAttr(Vt.IntArray([int(i) for i in idx]))
            mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3] * (len(idx) // 3)))
            mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)

            if uvs:
                pv = UsdGeom.PrimvarsAPI(mesh).CreatePrimvar(
                    "st", Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
                pv.Set(Vt.Vec2fArray([Gf.Vec2f(uvs[i * 2], uvs[i * 2 + 1])
                                      for i in range(len(uvs) // 2)]))

            mat = _texture_material(stage, prim_path + "/mat",
                                    [("Diffuse", group.get("texture")),
                                     ("Normal", group.get("normal"))],
                                    group.get("shader", ""))
            UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim())
            UsdShade.MaterialBindingAPI(mesh).Bind(mat)
            n += 1

    return n


def _export_roads(stage, path):
    """Roads are splines with a per-point half-width, not meshes -- so build the ribbon here.

    The dumped points already carry their world Y, so this does not need the terrain heightfield to
    drape them; that only matters for roads whose spline sits below the surface.

    WRITE-BACK (not implemented). The target is MEASURED, not guessed: a road is an EBX instance of
    type `RoadData`, and the fields this reads back out of it are

        Points          array of Vec3, the spline
        RibbonPoints    array of {Left, Right}, the half-widths, one per point
        UvTileFactor    float, metres of road per texture repeat
        StickToTerrain  bool
        DrawOrderIndex  int, which road wins where two overlap
        Shader2d        ref to the shader that carries the texture

    MP_001 has 109 of them. What is NOT yet measured is the instance that OWNS the RoadData -- the
    reader finds them by walking a partition for the type, which does not say what references them
    or how the level reaches them. That is the next thing to dump before authoring one.
    """
    doc = json.load(open(path))
    UsdGeom.Scope.Define(stage, "/World/Roads")
    n = 0

    for ri, road in enumerate(doc.get("roads", [])):
        pts = road.get("points") or []
        widths = road.get("widths") or []

        if len(pts) < 2:
            continue

        verts, faces, st = [], [], []
        tile = float(road.get("uvTile") or 1.0) or 1.0
        run = 0.0

        for i, p in enumerate(pts):
            nxt = pts[min(i + 1, len(pts) - 1)]
            prv = pts[max(i - 1, 0)]
            dx, dz = nxt[0] - prv[0], nxt[2] - prv[2]
            length = math.hypot(dx, dz) or 1.0
            # Perpendicular in the ground plane; roads are ribbons laid flat, not extruded.
            px, pz = -dz / length, dx / length
            w = widths[i] if i < len(widths) else (widths[-1] if widths else [1.0, -1.0])
            left, right = float(w[0]), float(w[1])
            verts.append(Gf.Vec3f(p[0] + px * left, p[1], p[2] + pz * left))
            verts.append(Gf.Vec3f(p[0] + px * right, p[1], p[2] + pz * right))

            if i:
                run += math.dist((prv[0], prv[2]), (p[0], p[2]))

            st.append(Gf.Vec2f(0.0, run / tile))
            st.append(Gf.Vec2f(1.0, run / tile))

        for i in range(len(pts) - 1):
            a = i * 2
            faces.extend([a, a + 2, a + 3, a, a + 3, a + 1])

        if not faces:
            continue

        # The road as a CURVE as well as a ribbon.
        #
        # A ribbon is what you look at; a curve is what you edit. Recovering a spline from
        # triangles is lossy, so the centre line and its per-point widths are authored as
        # BasisCurves -- USD's own type for exactly this -- and the emitter reads THAT back rather
        # than a JSON dump, which is what makes an edited road survive the trip.
        curve = UsdGeom.BasisCurves.Define(stage, "/World/Roads/curve_%d" % ri)
        curve.CreateTypeAttr(UsdGeom.Tokens.linear)
        curve.CreateCurveVertexCountsAttr(Vt.IntArray([len(pts)]))
        curve.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(float(p[0]), float(p[1]), float(p[2]))
                                              for p in pts]))
        curve.CreateWidthsAttr(Vt.FloatArray([
            float(abs((widths[i] if i < len(widths) else widths[-1])[0])
                  + abs((widths[i] if i < len(widths) else widths[-1])[1]))
            if widths else 1.0 for i in range(len(pts))]))
        curve.GetPrim().SetCustomDataByKey(BF3 + "Road", json.dumps(
            {k: road.get(k) for k in ("uvTile", "stick", "order", "texture", "widths")}))

        prim_path = "/World/Roads/road_%d" % ri
        mesh = UsdGeom.Mesh.Define(stage, prim_path)
        mesh.CreatePointsAttr(Vt.Vec3fArray(verts))
        mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(faces))
        mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3] * (len(faces) // 3)))
        mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        pv = UsdGeom.PrimvarsAPI(mesh).CreatePrimvar(
            "st", Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
        pv.Set(Vt.Vec2fArray(st))
        mat = _texture_material(stage, prim_path + "/mat",
                               [("Diffuse", road.get("texture"))], road.get("texture", ""))
        UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim())
        UsdShade.MaterialBindingAPI(mesh).Bind(mat)
        n += 1

    return n



def _export_terrain_nodes(stage, doc):
    """One mesh per quadtree node, at the node's OWN sample count, as the editable surface.

    The flattened composite cannot be edited losslessly. Going composite -> node grid needs a
    resample, and a resample changes samples that nobody touched: an untouched terrain would come
    back "edited" and rewrite trees the game already ships. Vanilla accuracy demands the opposite --
    edit nothing, emit nothing.

    So each node is authored at its own interior size (129x129 on BF3's 133 grid with a 2-sample
    skirt) over its own bounding box, with Y = sample * worldScaleY. That is a pure scale, so
    dividing it back recovers the stored integer exactly and the round trip is lossless by
    construction rather than by tolerance.

    Marked `guide`: the composite at /World/Terrain stays the surface you look at, since node meshes
    from different depths overlap in space and would z-fight. These are what terrain_write reads.
    """
    import terrain_lod

    side = int(doc["samplesPerSide"])
    skirt = int(doc.get("nodeBorderWidth", terrain_lod.SKIRT))
    scale_y = float(doc["worldScaleY"])
    inner = side - 2 * skirt
    nodes = [n for n in doc.get("nodes") or [] if n.get("data") and n.get("embedded")]

    if not nodes or inner < 2:
        return 0

    UsdGeom.Scope.Define(stage, "/World/TerrainNodes")

    # One topology for every node -- same sample count, so the indices never differ.
    faces = []

    for j in range(inner - 1):
        for i in range(inner - 1):
            a = j * inner + i
            faces.extend([a, a + inner, a + inner + 1, a, a + inner + 1, a + 1])

    counts = Vt.IntArray([3] * (len(faces) // 3))
    indices = Vt.IntArray(faces)
    made = 0

    for node in nodes:
        grid = terrain_lod._grid(node, side, skirt)

        if grid.shape != (inner, inner):
            continue

        nlo, nhi = node["min"], node["max"]
        xs = np.linspace(nlo[0], nhi[0], inner, dtype=np.float32)
        zs = np.linspace(nlo[2], nhi[2], inner, dtype=np.float32)
        heights = grid * scale_y
        pts = [Gf.Vec3f(float(xs[i]), float(heights[j, i]), float(zs[j]))
               for j in range(inner) for i in range(inner)]

        name = "node_%d_%d_%d" % (int(node.get("depth", 0)), int(node.get("indexX", 0)),
                                  int(node.get("indexY", 0)))
        mesh = UsdGeom.Mesh.Define(stage, "/World/TerrainNodes/" + name)
        mesh.CreatePointsAttr(Vt.Vec3fArray(pts))
        mesh.CreateFaceVertexIndicesAttr(indices)
        mesh.CreateFaceVertexCountsAttr(counts)
        mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        mesh.CreatePurposeAttr(UsdGeom.Tokens.guide)
        mesh.GetPrim().SetCustomDataByKey(BF3 + ":terrainNode", json.dumps(
            {"depth": int(node.get("depth", 0)), "indexX": int(node.get("indexX", 0)),
             "indexY": int(node.get("indexY", 0)), "samples": inner, "skirt": skirt,
             "worldScaleY": scale_y}))
        made += 1

    return made


def _export_terrain(stage, path, layers_path=None):
    """The terrain heightfield, at the detail the quadtree actually holds.

    This used to emit node 0 alone -- complete coverage, but the coarsest grid in the file, with 29
    finer ones discarded. terrain_lod flattens the tree instead: every node carries a 133x133 grid
    over its own bbox, so a depth-3 node is 8x the root's density, and the deepest node available
    wins at each point. On MP_001 that is 1025x1025 at exactly 1.00 m per sample.

    The raw nodes ride along in customData, so the stage can reconstruct BF3's own quadtree rather
    than only the flattened mesh.
    """
    import terrain_lod

    doc = json.load(open(path))
    grid, lo, hi, tstats = terrain_lod.composite(doc)

    if grid is None:
        return 0

    side = int(doc["samplesPerSide"])
    scale_y = float(doc["worldScaleY"])
    n = grid.shape[0]

    xs = np.linspace(lo[0], hi[0], n, dtype=np.float32)
    zs = np.linspace(lo[2], hi[2], n, dtype=np.float32)
    pts, st = [], []

    for j in range(n):
        for i in range(n):
            pts.append(Gf.Vec3f(float(xs[i]), float(grid[j, i]), float(zs[j])))
            st.append(Gf.Vec2f(i / (n - 1.0), j / (n - 1.0)))

    faces = []

    for j in range(n - 1):
        for i in range(n - 1):
            a = j * n + i
            faces.extend([a, a + n, a + n + 1, a, a + n + 1, a + 1])

    mesh = UsdGeom.Mesh.Define(stage, "/World/Terrain")
    mesh.CreatePointsAttr(Vt.Vec3fArray(pts))
    mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(faces))
    mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3] * (len(faces) // 3)))
    mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
    UsdGeom.PrimvarsAPI(mesh).CreatePrimvar(
        "st", Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex).Set(Vt.Vec2fArray(st))

    # The layer mask, sampled onto the terrain's own vertices. This is what decides where the
    # ground is sand and where it is gravel; without it the whole surface takes one layer and
    # reads as a single flat material. Carried as a primvar so a viewer or a shader can blend on
    # it directly rather than re-reading the quadtree.
    mask, mstats = terrain_lod.mask_composite(doc)

    if mask is not None:
        mj = (np.linspace(0, mask.shape[0] - 1, n)).astype(np.int32)
        mi = (np.linspace(0, mask.shape[1] - 1, n)).astype(np.int32)
        weights = (mask[np.ix_(mj, mi)].astype(np.float32) / 255.0).reshape(-1)
        UsdGeom.PrimvarsAPI(mesh).CreatePrimvar(
            "bf3:layerMask", Sdf.ValueTypeNames.FloatArray,
            UsdGeom.Tokens.vertex).Set(Vt.FloatArray(weights.tolist()))
        tstats["mask"] = mstats
    # Everything needed to rebuild BF3's quadtree, not just the mesh: the flattened grid is a
    # view, the nodes are the source.
    mesh.GetPrim().SetCustomDataByKey(BF3 + ":terrain", json.dumps(
        {"samplesPerSide": side, "worldScaleY": scale_y, "min": lo, "max": hi,
         "skirt": tstats.get("skirt"), "composite": tstats,
         "nodes": [{k: v for k, v in nd.items()} for nd in doc.get("nodes") or []]}))

    # The layer palette: BF3 blends up to 7 splat layers over the ground. USD has no splat shader,
    # so bind layer 0 as the visible surface and record the whole palette in customData rather than
    # silently dropping six of them.
    if layers_path and os.path.exists(layers_path):
        lay = json.load(open(layers_path))

        # `detail` holds {resource, kind, channels} dicts (noise/perlin overlays), not the layer
        # colour maps -- `diffuse` is the per-layer palette. Take the first real colour map.
        palette = [x for x in (lay.get("diffuse") or []) if isinstance(x, str)]
        diffuse = palette[0] if palette else None
        mat = _texture_material(stage, "/World/Terrain/mat",
                                [("Diffuse", diffuse)], lay.get("surfaceShader", ""))
        UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim())
        UsdShade.MaterialBindingAPI(mesh).Bind(mat)
        mesh.GetPrim().SetCustomDataByKey(BF3 + ":terrainLayers", json.dumps(
            {k: lay.get(k) for k in ("layerCount", "samplesPerMeter", "splat", "detail",
                                     "normalMaps", "normalByLayer", "wetness", "surfaceShader")}))

    return len(faces) // 3


def _material_ebx_index(path):
    """mesh name -> its MeshMaterial records, in material_index order.

    Dumped straight out of each mesh's EBX partition. Without it every material is authored from
    one hardcoded template; MP_001 alone uses 252 distinct ShaderGraph instances.
    """
    import glob

    if not path:
        return {}

    names_file = os.path.join(path, 'names.txt')

    if not os.path.exists(names_file):
        return {}

    names = [l.strip() for l in open(names_file) if l.strip()]
    index = {}

    for i, name in enumerate(names):
        f = os.path.join(path, '%05d.json' % i)

        if not os.path.exists(f):
            continue

        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        insts = doc.get('Instances', {}) or {}

        # ORDER AND COUNT come from the mesh asset's own Materials array, not from whatever order
        # the instances happen to sit in the json. That array IS material-index order, and it lists
        # every slot the MeshSet has -- including a slot no subset in any LOD references.
        #
        # Taking Instances.values() instead got both wrong: the count came up short (5 of 470
        # meshes on MP_001), and a short material list makes the CLIENT index past the end of it
        # while building the render mesh and exit with no crash dump, taking the level down for
        # everyone. The dedicated server never builds a render mesh and never notices.
        ordered = None

        for v in insts.values():
            if v.get('$type') in ('RigidMeshAsset', 'MeshAsset', 'CompositeMeshAsset',
                                  'SkinnedMeshAsset') and isinstance(v.get('Materials'), list):
                picked = [insts.get(e.get('InstanceGuid')) for e in v['Materials']
                          if isinstance(e, dict)]

                if picked and all(m and m.get('$type') == 'MeshMaterial' for m in picked):
                    ordered = picked

                break

        mats = ordered or [v for v in insts.values() if v.get('$type') == 'MeshMaterial']

        if mats:
            index[name.lower()] = mats

    return index


def main(placements_path, out_path, mesh_dir=None, corpus=None, chunks=None, textures=None,
         decals=None, roads=None, terrain=None, layers=None, texture_dir=None, material_dir=None,
         scattering_path=None,
         ebx_dir=None, parts_list=None, enlighten_path=None, registry_dir=None):
    doc = json.load(open(placements_path))

    # The merged, shader-filled material bindings, keyed by mesh name. Without these the level
    # exports as untextured white geometry -- which is exactly what the standalone renderer looked
    # like before the same dump was wired into it.
    bindings = {}

    if textures:
        bindings = json.load(open(textures)).get("meshes", {})
    level = doc.get("level", "level")
    meshes = doc["meshes"]

    mesh_dir = mesh_dir or os.path.join(os.path.dirname(os.path.abspath(out_path)), "meshes")
    os.makedirs(mesh_dir, exist_ok=True)

    # Where the dumped DDS files live. Set it before any prototype is authored, so every material
    # writes an asset path that actually resolves; a stage whose textures do not resolve imports as
    # untextured geometry, which is what Blender showed.
    if texture_dir:
        # COPY them beside the stage rather than pointing at wherever they were dumped. A prototype
        # references its textures relative to itself, so they have to live in a fixed place next to
        # the stage or the asset paths resolve to nothing -- which imports as untextured geometry.
        import shutil

        beside = os.path.join(os.path.dirname(os.path.abspath(out_path)),
                              os.path.splitext(os.path.basename(out_path))[0] + '_textures')
        os.makedirs(beside, exist_ok=True)
        copied = 0

        for f in sorted(os.listdir(texture_dir)):
            if not f.endswith('.dds'):
                continue

            dst = os.path.join(beside, f)

            if not os.path.exists(dst):
                shutil.copy2(os.path.join(texture_dir, f), dst)

            copied += 1

        bf3_usd.TEXTURE_DIR = beside
        print('textures  %d dds copied beside the stage' % copied)

    material_ebx = _material_ebx_index(material_dir)

    if material_ebx:
        print('shaders   %d meshes carry real MeshMaterial records' % len(material_ebx))

    index = _corpus_index(corpus)

    if os.path.exists(out_path):
        os.remove(out_path)

    stage = Usd.Stage.CreateNew(out_path)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)

    world = UsdGeom.Xform.Define(stage, "/World")
    stage.SetDefaultPrim(world.GetPrim())
    world.GetPrim().SetCustomDataByKey(BF3 + ":level", level)

    # Meshes a level reaches through an ASSET NAME rather than a placement. Without this the
    # water surface never appears in the stage at all: the asset names its mesh, nothing places it.
    if ebx_dir:
        import glob as _g

        _asset_meshes = {}

        for _f in _g.glob(os.path.join(ebx_dir, os.path.dirname(level).lower(), '**', '*.json'),
                          recursive=True):
            try:
                _d = json.load(open(_f))
            except Exception:                                # noqa: BLE001
                continue

            for _i in (_d.get('Instances') or {}).values():
                _t, _n = _i.get('$type', ''), _i.get('Name')

                if not isinstance(_n, str) or '/' not in _n:
                    continue

                if _t in ('WaterAsset',) and _n.lower() in index and _n not in meshes:
                    _asset_meshes[_n] = [{'right': {'x': 1.0, 'y': 0.0, 'z': 0.0},
                                          'up': {'x': 0.0, 'y': 1.0, 'z': 0.0},
                                          'forward': {'x': 0.0, 'y': 0.0, 'z': 1.0},
                                          'trans': {'x': 0.0, 'y': 0.0, 'z': 0.0}}]

        if _asset_meshes:
            meshes = dict(meshes)
            meshes.update(_asset_meshes)
            print('assets    %d mesh(es) authored from asset names (water surfaces)'
                  % len(_asset_meshes))

    # ANIMATION. Every Ant bank the level reaches, authored as UsdSkelAnimation so clips are
    # editable and scrubable rather than merely decodable. Values round-trip exactly, and the
    # joints carry the rig's own bone names wherever the clip's ChannelToDofAsset picks out one
    # DOF set -- `antrig` refuses to name a channel when it does not, and those keep dof037.
    _bankdir = os.environ.get('USD_ANT_BANKS', '/tmp/antbanks')

    if os.path.isdir(_bankdir):
        import antanim as _antanim
        import antrig as _antrig
        import glob as _bg

        _clips = _named = 0
        _rig = _antrig.find(os.environ.get('USD_ANT_RIG') or _bankdir)

        for _bf in sorted(_bg.glob(os.path.join(_bankdir, '*.json'))):
            try:
                _bank = json.load(open(_bf))
            except Exception:                                # noqa: BLE001
                continue

            _c, _n = _antanim.author(stage, world, _bank, _rig)
            _clips += _c
            _named += _n

        if _clips:
            print('animation   %d clip(s) authored from %d bank(s), %d with named joints'
                  % (_clips, len(_bg.glob(os.path.join(_bankdir, '*.json'))), _named))

    # Every EBX instance the level's partitions hold. The ones with a Transform -- spawns, effect
    # placements, decals, probes, volumes -- become Xforms a DCC can move; the rest are carried as
    # records so an edit to any field of any instance survives. Without these a level can be
    # REBUILT but not AUTHORED: you could not move a spawn.
    #
    # This runs BEFORE the meshes now, because it is what says where a mesh belongs: it returns the
    # prim path of the reference object that places each mesh, so the geometry can be authored as
    # that object's child instead of in a flat list beside the level.
    anchors = {}

    if ebx_dir:
        import level_entities

        if parts_list:
            parts = [ln.strip() for ln in open(parts_list) if ln.strip()]
        else:
            # DERIVE it. This used to require a hand-written file, and passing --ebx-dir without
            # --parts-list silently authored ZERO entities -- a level exported with all its
            # geometry and none of its lights, decals, sounds or probes, which still loads and
            # still looks like a pass. Only MP_001 ever had such a file, so every other level was
            # geometry-only without saying so.
            #
            # Recursive, not one directory deep: MP_001's own list is 490 partitions while its top
            # level holds 9.
            import glob as _glob

            base = os.path.join(ebx_dir, os.path.dirname(level).lower())
            parts = sorted(
                os.path.relpath(f, ebx_dir)[:-5]
                for f in _glob.glob(os.path.join(base, '**', '*.json'), recursive=True))
            print('entities     %d partition(s) derived from %s' % (len(parts), base))
        counts, entity_placed, graph = level_entities.author(
            stage, world, ebx_dir, parts, level=level, placements=meshes)
        anchors = graph["anchors"]

        if counts:
            short = lambda k: k.replace("EntityData", "").replace("Data", "")   # noqa: E731
            print("entities     %d instances carried, %d of them placed (%s)"
                  % (sum(counts.values()), sum(entity_placed.values()),
                     ", ".join("%s %d" % (short(k), v)
                               for k, v in sorted(entity_placed.items(),
                                                  key=lambda kv: -kv[1])[:5])))
            print("level graph  %d instance(s) under /World/Level, %d level(s) deep; "
                  "%d nothing owns, carried by partition path"
                  % (graph["nodes"], graph["depth"], graph["loose"]))

    # The REGISTRY's assets, under /World/Registry.
    #
    # A level's RegistryContainer names the gameplay content it expects at runtime and nothing
    # else: on MP_001 that is 2762 partitions -- 1544 weapons, 693 persistence, 493 characters --
    # and none of it is level-graph content, so none of it was on the stage. The bundle carried
    # those partitions raw, which makes them RESOLVE in the engine but leaves them invisible and
    # uneditable in a DCC: a weapon's firing data, its unlocks and its soldier's appearance were
    # shipped as opaque bytes.
    #
    # Authored the same way as everything the level graph does not reach, so nothing downstream is
    # special-cased: each record carries its bf3Entity blob, level_entities.read() picks it up from
    # anywhere on the stage, and the emitter rewrites the partition only where a record CHANGED.
    if registry_dir and os.path.isdir(registry_dir):
        import glob as _rg
        import level_entities as _le

        reg_parts = sorted(
            os.path.relpath(f, registry_dir)[:-5].replace(os.sep, '/')
            for f in _rg.glob(os.path.join(registry_dir, '**', '*.json'), recursive=True))

        if reg_parts:
            reg_root = UsdGeom.Xform.Define(stage, "/World/Registry")
            reg_counts, _reg_placed, _reg_graph = _le.author(
                stage, reg_root, registry_dir, reg_parts)
            namespaces = {}

            for part in reg_parts:
                namespaces[part.split('/')[0]] = namespaces.get(part.split('/')[0], 0) + 1

            print("registry     %d instance(s) from %d partition(s) under /World/Registry (%s)"
                  % (sum(reg_counts.values()), len(reg_parts),
                     ", ".join("%s %d" % kv for kv in
                               sorted(namespaces.items(), key=lambda kv: -kv[1]))))

    built = missing = 0
    placed = anchored = 0

    for name in sorted(meshes):
        transforms = meshes[name]

        if not transforms:
            continue

        proto = os.path.join(mesh_dir, _safe(name) + ".usdc")

        # Author the prototype once, from a real resource where we have one.
        if not os.path.exists(proto):
            res = index.get(name.lower())

            if res is None:
                missing += 1
            else:
                try:
                    ms = MeshSet.parse(open(res, "rb").read())
                    ch = {}

                    if chunks:
                        import uuid as _uuid

                        for i, lod in enumerate(ms.lods):
                            cid = getattr(lod, "data_chunk_id", None)

                            if not cid:
                                continue

                            p = os.path.join(chunks, "%s.chunk" % _uuid.UUID(bytes_le=cid))

                            if os.path.exists(p):
                                ch[i] = open(p, "rb").read()

                    bf3_usd.export(ms, ch, proto,
                                   variations=bindings.get(name.lower()),
                                   material_ebx=(material_ebx or {}).get(name.lower()))
                    built += 1
                except Exception as exc:
                    print("  prototype failed for %s: %s" % (name, exc))
                    missing += 1

        # The flat per-mesh group is now only for the placements the level does NOT own -- the
        # ones that live inside an object blueprint, which is a level below the level graph. It is
        # authored lazily so a mesh whose every placement found its owner leaves no empty Scope.
        group = None
        owned = anchors.get(name, {})

        for i, t in enumerate(transforms):
            if len(t) < 12:
                continue

            owner = owned.get(i)

            if owner:
                # Inside the hierarchy. The reference object that places this mesh already carries
                # the transform, so the geometry is its child at IDENTITY -- authoring the matrix
                # again would place it twice. Composing identity in double precision is exact, so
                # the placement's local-to-world is still the original 12 floats bit for bit.
                xf = UsdGeom.Xform.Define(stage, owner + "/mesh")
                anchored += 1
            else:
                if group is None:
                    group = UsdGeom.Scope.Define(stage, "/World/%s" % _safe(name))
                    group.GetPrim().SetCustomDataByKey(BF3 + ":mesh", name)

                xf = UsdGeom.Xform.Define(stage, "/World/%s/inst_%d" % (_safe(name), i))
                xf.AddTransformOp().Set(_matrix(t))

            # The mesh name and the placement's INDEX go on the placement prim itself. The group
            # used to be the only thing that named the mesh, which stopped working the moment a
            # placement could live somewhere else; the index is what lets a reader hand the
            # placements back in the order they were dumped in rather than in traversal order.
            xf.GetPrim().SetCustomDataByKey(BF3 + ":mesh", name)
            xf.GetPrim().SetCustomDataByKey(BF3 + ":placement", i)

            # Reference the prototype and mark it instanceable: 6185 placements share a handful of
            # prototypes, so the stage stays small and renderers can hardware-instance it.
            if os.path.exists(proto):
                xf.GetPrim().GetReferences().AddReference(
                    Sdf.Reference(os.path.relpath(proto, os.path.dirname(os.path.abspath(out_path)))))
                xf.GetPrim().SetInstanceable(True)

            placed += 1

    if MISSING_TEXTURES:
        print("textures  %d resource(s) referenced by materials were never dumped -- "
              "those slots are unbound, not faked" % len(MISSING_TEXTURES))

    if terrain:
        print("terrain      %d triangles" % _export_terrain(stage, terrain, layers))
        print("terrain nodes %d editable node mesh(es)"
              % _export_terrain_nodes(stage, json.load(open(terrain))))

        # The painted rasters beside the heights: which layer shows where, which material a bullet
        # finds, how deep the ground can be dug.
        import terrain_trees

        made = terrain_trees.author(stage, json.load(open(terrain)))
        print("terrain trees %s" % ", ".join("%s %d" % (k, v) for k, v in sorted(made.items())))

    # What the ground GROWS. EBX carries none of it, so a level exported without this comes back
    # with its grass and rubble gone while every other check still passes.
    if scattering_path:
        import scattering
        import terrain_layers

        nl, nd = terrain_layers.author(stage, scattering_path)
        print("terrain layers %d layer(s), %d combination draw(s)" % (nl, nd))
        print("scattering   %d type(s)" % scattering.author(stage, scattering_path))

    # The level's global illumination. It is a BAKE -- computed against the geometry that was
    # there when it ran -- so it is carried as the shipped bytes rather than regenerated, and a
    # level exported without this says "lighting: referenced" and leaves it in the game's bundles.
    if enlighten_path:
        import enlighten

        made = enlighten.author(stage, json.load(open(enlighten_path)))
        print("enlighten    %s" % ", ".join("%s %d" % (k, v)
                                            for k, v in sorted(made.items()) if v))

    if decals:
        print("decals       %d group(s)" % _export_decals(stage, decals))

    if roads:
        print("roads        %d ribbon(s)" % _export_roads(stage, roads))

    stage.GetRootLayer().Save()

    print("level        %s" % level)
    print("meshes       %d distinct" % len(meshes))
    print("placements   %d instances, %d of them owned by the reference object that places them"
          % (placed, anchored))
    # "without a resource" is not the same as "lost". A level places blueprints, and most but not
    # all of them are meshes: MP_001 names 562 placement targets of which 35 have no MeshSet in the
    # game AT ALL -- 33 are FX effect blueprints and 2 are object blueprints whose real meshes are
    # separate <name>_Mesh resources. Those are carried by the ENTITY layer, which authors every
    # EBX instance including their ReferenceObjectData and EffectReferenceObjectData, so nothing is
    # dropped. Reporting them next to the prototypes as a bare count read like a coverage hole.
    print("prototypes   %d built, %d placement target(s) with no MeshSet "
          "(effects/blueprints -- carried as entities)" % (built, missing))

    if bindings:
        bound = sum(1 for n in meshes if n.lower() in bindings)
        print("materials    %d of %d meshes have texture bindings" % (bound, len(meshes)))
    print("wrote        %s (%d bytes)" % (out_path, os.path.getsize(out_path)))
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)

    argv = sys.argv[1:]
    opts = {}

    for flag in ("--meshes", "--corpus", "--chunks", "--textures", "--decals", "--roads",
                 "--terrain", "--layers", "--texture-dir", "--material-dir",
                 "--ebx-dir", "--parts-list", "--scattering", "--enlighten",
                 "--registry-dir"):
        if flag in argv:
            i = argv.index(flag)
            opts[flag.lstrip("-")] = argv[i + 1]
            del argv[i:i + 2]

    # By KEYWORD. Positionally, --ebx-dir landed on `scattering_path` and --scattering on
    # `parts_list`, so running this from the command line handed the EBX directory to the terrain
    # layer reader ("IsADirectoryError") and, before that reader existed, silently exported a level
    # with no entities at all while reporting nothing wrong.
    main(argv[0], argv[1], mesh_dir=opts.get("meshes"), corpus=opts.get("corpus"),
         chunks=opts.get("chunks"), textures=opts.get("textures"), decals=opts.get("decals"),
         roads=opts.get("roads"), terrain=opts.get("terrain"), layers=opts.get("layers"),
         texture_dir=opts.get("texture-dir"), material_dir=opts.get("material-dir"),
         scattering_path=opts.get("scattering"), ebx_dir=opts.get("ebx-dir"),
         parts_list=opts.get("parts-list"), enlighten_path=opts.get("enlighten"),
         registry_dir=opts.get("registry-dir"))
