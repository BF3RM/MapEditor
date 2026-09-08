#!/usr/bin/env python3
"""BF3 MeshSet <-> USD.

Geometry and materials go into USD where a DCC can see and edit them. The
Frostbite scaffolding that USD has no native home for — vertex element formats,
strides, subset offsets, LOD flags, chunk ids, the skinned/composite tail blobs
— rides along in `customData` on the prims, so the loop closes without a sidecar
file and a DCC that ignores customData still opens the asset correctly.

Round trip proven byte-exact for both the MeshSet resource and its geometry
chunk; see docs/usd-roundtrip.md for the commands.
"""

import base64
import hashlib
import json
import os
import re
import sys

import numpy as np
from pxr import Usd, UsdGeom, UsdShade, UsdSkel, Sdf, Gf, Vt

import meshset as MS
import skeleton as SK
from geom import decode_subset, rebuild_chunk

TEXTURE_DIR = None

BF3 = "bf3"


# ---------------------------------------------------------------- scaffolding

def _subset_scaffold(s):
    return {
        "geometry_declarations": s.geometry_declarations,
        "material_name": s.material_name,
        "material_index": s.material_index,
        "primitive_count": s.primitive_count,
        "start_index": s.start_index,
        "vertex_offset": s.vertex_offset,
        "vertex_count": s.vertex_count,
        "vertex_stride": s.vertex_stride,
        "primitive_type": s.primitive_type,
        "bones_per_vertex": s.bones_per_vertex,
        "bone_count": s.bone_count,
        "bone_indices": s.bone_indices,
        "has_bone_indices": s.has_bone_indices,
        "texcoord_ratios": s.texcoord_ratios,
        "gdd": {
            "elements": [[e.usage, e.fmt, e.offset, e.stream_index] for e in s.geom_decl.elements],
            "streams": [[st.stride, st.classification] for st in s.geom_decl.streams],
            "element_count": s.geom_decl.element_count,
            "stream_count": s.geom_decl.stream_count,
            "pad": base64.b64encode(s.geom_decl.pad).decode(),
        },
    }


def _lod_scaffold(l, chunk=None):
    # A chunk is padded to a 16-byte boundary past vertexDataSize+indexDataSize.
    # The pad is not always zero, so carry it rather than regenerate it.
    tail = b""
    if chunk is not None:
        tail = chunk[l.vertex_data_size + l.index_data_size:]
    return {
        "chunk_tail": base64.b64encode(tail).decode(),
        "type": l.type,
        "category_indices": l.category_indices,
        "category_present": l.category_present,
        "flags": l.flags,
        "index_buffer_format": l.index_buffer_format,
        "index_data_size": l.index_data_size,
        "vertex_data_size": l.vertex_data_size,
        "edge_partition_buffer_size": l.edge_partition_buffer_size,
        "data_chunk_id": base64.b64encode(l.data_chunk_id).decode(),
        "aux_vertex_index_data_offset": l.aux_vertex_index_data_offset,
        "embedded_edge_data_ptr": l.embedded_edge_data_ptr,
        "shader_debug_name": l.shader_debug_name,
        "name": l.name,
        "short_name": l.short_name,
        "name_hash": l.name_hash,
        "data": l.data,
        "part_count": l.part_count,
        "tail_blobs": [base64.b64encode(b).decode() for b in l.tail_blobs],
        "tail_present": l.tail_present,
        "subsets": [_subset_scaffold(s) for s in l.subsets],
    }


def _meshset_scaffold(ms, chunks):
    return {
        "mesh_type": ms.mesh_type,
        "flags": ms.flags,
        "total_subset_count": ms.total_subset_count,
        "bbox_min": list(ms.bbox_min), "bbox_min_pad": ms.bbox_min_pad,
        "bbox_max": list(ms.bbox_max), "bbox_max_pad": ms.bbox_max_pad,
        "name": ms.name, "short_name": ms.short_name,
        "name_hash": ms.name_hash, "padding": ms.padding,
        "inline_tail": base64.b64encode(ms.inline_tail).decode(),
        "lods": [_lod_scaffold(l, chunks.get(i)) for i, l in enumerate(ms.lods)],
    }


def _rebuild_meshset(d):
    ms = MS.MeshSet()
    ms.mesh_type = d["mesh_type"]; ms.flags = d["flags"]
    ms.total_subset_count = d["total_subset_count"]
    ms.bbox_min = tuple(d["bbox_min"]); ms.bbox_min_pad = d["bbox_min_pad"]
    ms.bbox_max = tuple(d["bbox_max"]); ms.bbox_max_pad = d["bbox_max_pad"]
    ms.name = d["name"]; ms.short_name = d["short_name"]
    ms.name_hash = d["name_hash"]; ms.padding = d["padding"]
    ms.inline_tail = base64.b64decode(d["inline_tail"])
    for ld in d["lods"]:
        l = MS.MeshLayout()
        l.type = ld["type"]
        l.category_indices = [list(x) for x in ld["category_indices"]]
        l.category_present = list(ld["category_present"])
        l.flags = ld["flags"]; l.index_buffer_format = ld["index_buffer_format"]
        l.index_data_size = ld["index_data_size"]; l.vertex_data_size = ld["vertex_data_size"]
        l.edge_partition_buffer_size = ld["edge_partition_buffer_size"]
        l.data_chunk_id = base64.b64decode(ld["data_chunk_id"])
        l.aux_vertex_index_data_offset = ld["aux_vertex_index_data_offset"]
        l.embedded_edge_data_ptr = ld["embedded_edge_data_ptr"]
        l.shader_debug_name = ld["shader_debug_name"]; l.name = ld["name"]
        l.short_name = ld["short_name"]; l.name_hash = ld["name_hash"]
        l.data = ld["data"]; l.part_count = ld["part_count"]
        l.tail_blobs = [base64.b64decode(b) for b in ld["tail_blobs"]]
        l.tail_present = list(ld["tail_present"])
        l._chunk_tail = base64.b64decode(ld.get("chunk_tail", ""))
        for sd in ld["subsets"]:
            s = MS.Subset()
            for k in ("geometry_declarations", "material_name", "material_index",
                      "primitive_count", "start_index", "vertex_offset", "vertex_count",
                      "vertex_stride", "primitive_type", "bones_per_vertex", "bone_count",
                      "bone_indices", "has_bone_indices", "texcoord_ratios"):
                setattr(s, k, sd[k])
            g = MS.GeomDecl()
            g.elements = [MS.Element(*e) for e in sd["gdd"]["elements"]]
            g.streams = [MS.Stream(*st) for st in sd["gdd"]["streams"]]
            g.element_count = sd["gdd"]["element_count"]
            g.stream_count = sd["gdd"]["stream_count"]
            g.pad = base64.b64decode(sd["gdd"]["pad"])
            s.geom_decl = g
            l.subsets.append(s)
        ms.lods.append(l)
    return ms


# ---------------------------------------------------------------------- write

def _safe(name):
    """A USD prim name: alphanumerics and underscore, never leading with a digit."""
    out = re.sub(r"[^A-Za-z0-9_]", "_", str(name))
    return ("_" + out) if (not out or out[0].isdigit()) else out


def _texture_asset(resource):
    """A BF3 texture resource path -> a USD asset path.

    BF3 names textures by resource path with no extension ("objects/x/y_d"). The exact
    resource name is also written to customData, so nothing depends on this guess: if the
    textures are extracted as DDS alongside, these resolve; if not, the name is still there.
    """
    # With TEXTURE_DIR set, point at the file that is actually there, relative to the prototype
    # (which lives one directory below the stage). Without it the bare game path is kept: it names
    # the resource correctly but resolves to nothing, which is why a DCC shows an untextured level.
    flat = str(resource).replace("/", "__") + ".dds"

    if TEXTURE_DIR and os.path.exists(os.path.join(TEXTURE_DIR, flat)):
        return "../%s/%s" % (os.path.basename(TEXTURE_DIR.rstrip("/")), flat)

    return resource + ".dds"


# The slot names BF3 materials actually use for each channel. Listed in preference order, so a
# material carrying both Diffuse and TileDiffuse binds the one that is its real base colour.
DIFFUSE_SLOTS = ("Diffuse", "MainDiffuse", "Color", "BaseColor", "TileDiffuse", "Albedo")
NORMAL_SLOTS = ("Normal", "MainNormal", "Normalmap", "NormalMap", "TileNormal")
SPECULAR_SLOTS = ("Specular", "SpecAndColormask", "SpecularColor", "Gloss")

def _author_bf3_shader(stage, mat, path, material_ebx):
    """The material's REAL BF3 shader, as a USD shader network in its own render context.

    UsdPreviewSurface is a portable approximation and always will be -- USD cannot carry compiled
    DXBC and no DCC would run it. What USD CAN carry is the graph's identity and its parameters,
    which is what makes the trip lossless: MP_001 uses 252 distinct ShaderGraph instances across 889
    materials, where the old path substituted ONE hardcoded template with FresnelExponent and
    SpecularScale both 0.5. Measured against the real data, tires_stack alone wants 0.7 and 1.1.

    Authored as a second output on the Material, in the "bf3" render context. A DCC reads the
    preview surface and ignores this; the emitter reads this and ignores the preview surface.
    """
    if not material_ebx:
        return

    shader = UsdShade.Shader.Define(stage, path + "/bf3Shader")
    shader.CreateIdAttr("bf3:ShaderGraph")
    ref = (material_ebx.get("Shader") or {}).get("Shader") or {}

    if ref:
        shader.CreateInput("shaderPartition", Sdf.ValueTypeNames.String).Set(
            str(ref.get("PartitionGuid", "")))
        shader.CreateInput("shaderInstance", Sdf.ValueTypeNames.String).Set(
            str(ref.get("InstanceGuid", "")))

    block = material_ebx.get("Shader") or {}

    for vp in block.get("VectorParameters") or []:
        name = vp.get("ParameterName")
        v = vp.get("Value") or {}

        if not name:
            continue

        shader.CreateInput(_safe(name), Sdf.ValueTypeNames.Float4).Set(
            Gf.Vec4f(float(v.get("x", 0.0)), float(v.get("y", 0.0)),
                     float(v.get("z", 0.0)), float(v.get("w", 0.0))))

    for bp in block.get("BoolParameters") or []:
        name = bp.get("ParameterName")

        if name:
            shader.CreateInput(_safe(name), Sdf.ValueTypeNames.Bool).Set(bool(bp.get("Value")))

    # The whole record too, so a parameter type this does not model still survives the trip.
    mat.GetPrim().SetCustomDataByKey(BF3 + "Material", json.dumps(material_ebx))
    mat.CreateOutput("bf3:surface", Sdf.ValueTypeNames.Token).ConnectToSource(
        shader.ConnectableAPI(), "surface")
    shader.CreateOutput("surface", Sdf.ValueTypeNames.Token)


def _has_texcoord(lod, subset):
    """Whether a subset declares any texture coordinates at all.

    The attribute is `geom_decl` (meshset.Subset.geom_decl, a GeomDecl with .elements). This read
    `subset.gdd`, which does not exist on any subset, so getattr returned None, the element loop
    never ran, and the function answered False for EVERY subset -- marking all of them `guide`.

    That is not cosmetic. `guide` means "helper geometry, do not render", so the exported stage
    opened in a DCC as thousands of empties and zero visible meshes -- the whole level invisible.
    MEASURED after the typo: 722 of 722 subsets across 120 prototypes were guide, against the ~30%
    (434 of 1470) this test is meant to select.
    """
    gdd = getattr(subset, "geom_decl", None)

    if gdd is None:                                          # older dumps / dict-shaped records
        gdd = getattr(subset, "gdd", None)

    if isinstance(gdd, dict):
        elements = gdd.get("elements") or []
    else:
        elements = getattr(gdd, "elements", None) or []

    for e in elements:
        usage = e[0] if isinstance(e, (list, tuple)) else getattr(e, "usage", 0)

        if usage in (33, 34, 35, 36, 37):                    # TexCoord0..4
            return True

    return False


def _define_material(stage, path, slots, label, material_ebx=None):
    """One UsdPreviewSurface fed by whatever texture slots the binding actually carries."""
    mat = UsdShade.Material.Define(stage, path)
    shader = UsdShade.Shader.Define(stage, path + "/preview")
    shader.CreateIdAttr("UsdPreviewSurface")

    # The UV source, and it has to be a real node.
    #
    # Setting a texture's "st" to a constant Vec2f is accepted by USD and silently samples ONE
    # texel for every pixel, which renders as a flat colour and reads as "the texture did not
    # load". It survives a Workbench/textured-solid view -- that maps the image onto UVs directly
    # and never evaluates the network -- so it only shows up in Material Preview or a render.
    reader = UsdShade.Shader.Define(stage, path + "/stReader")
    reader.CreateIdAttr("UsdPrimvarReader_float2")
    # String, not Token. Both are legal in USD, but Blender's importer only resolves the varname
    # when it is a string -- as a token it silently fails to find the UV map and every texture
    # samples flat, which is indistinguishable from "the texture did not load".
    reader.CreateInput("varname", Sdf.ValueTypeNames.String).Set("st")
    st_out = reader.CreateOutput("result", Sdf.ValueTypeNames.Float2)

    def _rank(item):
        """Preferred channel slots first, so Diffuse wins over TileDiffuse for base colour."""
        name = item[0]

        for table in (DIFFUSE_SLOTS, NORMAL_SLOTS, SPECULAR_SLOTS):
            if name in table:
                return (0, table.index(name), name)

        return (1, 0, name)

    bound_channels = set()

    for slot, resource in sorted(slots.items(), key=_rank):
        if slot.startswith("$"):
            continue

        tex = UsdShade.Shader.Define(stage, "%s/%s" % (path, _safe(slot)))
        tex.CreateIdAttr("UsdUVTexture")
        # "external:Foo" is a shader input bound elsewhere, not a resource -- record it, but
        # do not pretend it is a file.
        if not str(resource).startswith("external:"):
            tex.CreateInput("file", Sdf.ValueTypeNames.Asset).Set(_texture_asset(resource))
        tex.GetPrim().SetCustomDataByKey(BF3 + ":resource", str(resource))
        tex.CreateInput("st", Sdf.ValueTypeNames.Float2).ConnectToSource(st_out)
        out = tex.CreateOutput("rgb", Sdf.ValueTypeNames.Float3)

        # Connect whatever this material calls its base colour, normal and specular.
        #
        # "Diffuse" is the common name but far from the only one: 412 of MP_001's material entries
        # use MainDiffuse, Color or TileDiffuse instead. Authoring a texture node and connecting
        # nothing to it makes it invisible in a DCC -- Blender imports the surface NETWORK, so a
        # node outside it is dropped and the material arrives with no image at all. That is 382
        # materials on this level, every one of them in use by geometry.
        channel = ("diffuse" if slot in DIFFUSE_SLOTS else
                   "normal" if slot in NORMAL_SLOTS else
                   "specular" if slot in SPECULAR_SLOTS else None)

        if channel in bound_channels:
            channel = None

        if channel:
            bound_channels.add(channel)

        if channel == "diffuse":
            shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(out)
        elif channel == "normal":
            shader.CreateInput("normal", Sdf.ValueTypeNames.Normal3f).ConnectToSource(out)
        elif channel == "specular":
            shader.CreateInput("specularColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(out)

    mat.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), "surface")
    mat.GetPrim().SetCustomDataByKey(BF3 + ":material", json.dumps(label))
    _author_bf3_shader(stage, mat, path, material_ebx)
    return mat


# -------------------------------------------------------------------- UsdSkel

def _author_skeleton(stage, root, dump):
    """Write the SkeletonAsset as a UsdSkel.Skeleton under the mesh root.

    joints        the full BF3 bone list, in BF3 order, so a joint's USD index IS its BF3
                  skeleton index and `Subset.bone_indices` needs no remapping.
    bindTransforms  ModelPose. USD skins with jointWorld * inverse(bind), which at rest is the
                  identity for every joint, so an unposed mesh sits exactly where its vertices
                  say -- which is what BF3 does too, and why the shared WeaponSke01 rig works for
                  weapons whose parts are nowhere near its generic bone positions.
    restTransforms  LocalPose (parent-relative), the pose an animation overrides joint by joint.
    """
    bones = dump["bones"]
    skel = UsdSkel.Skeleton.Define(stage, root.GetPath().AppendChild("Skeleton"))
    skel.CreateJointsAttr(Vt.TokenArray(SK.joint_paths(bones)))
    skel.CreateJointNamesAttr(Vt.TokenArray([b["name"] for b in bones]))
    skel.CreateBindTransformsAttr(
        Vt.Matrix4dArray([Gf.Matrix4d(*b["modelPose"]) for b in bones]))
    skel.CreateRestTransformsAttr(
        Vt.Matrix4dArray([Gf.Matrix4d(*b["localPose"]) for b in bones]))
    skel.GetPrim().SetCustomDataByKey(BF3 + "Skeleton", json.dumps(dump))
    return skel


def _bind_skin(mesh_prim, skel, lod, sub, attrs):
    """Give one subset its UsdSkel binding.

    The vertex BoneIndices element is a palette index; the palette is the subset's own
    `bone_indices`, holding SKELETON indices. USD wants skeleton indices directly, so the palette
    is applied here and undone on the way back in.

    elementSize is always 4 -- the packed element is UByte4 whatever BonesPerVertex says, and the
    unused slots carry weight 0, so writing all four is exact and needs no per-subset special
    case. (Measured: weights sum to exactly 1.0 on every subset of every skinned mesh read here,
    both the bones_per_vertex==1 weapons and the ==4 characters.)
    """
    if "BoneIndices" not in attrs or "BoneWeights" not in attrs or not sub.bone_indices:
        return
    palette = np.asarray(sub.bone_indices, dtype=np.int32)
    local = attrs["BoneIndices"].astype(np.int32)
    if local.max(initial=0) >= len(palette):
        raise ValueError("bone index %d runs past the %d-entry palette"
                         % (local.max(), len(palette)))
    binding = UsdSkel.BindingAPI.Apply(mesh_prim)
    binding.CreateJointIndicesPrimvar(False, 4).Set(
        Vt.IntArray.FromNumpy(palette[local].reshape(-1)))
    binding.CreateJointWeightsPrimvar(False, 4).Set(
        Vt.FloatArray.FromNumpy(attrs["BoneWeights"].astype(np.float32).reshape(-1)))
    # Vertices are already in the skeleton's model space; nothing to correct.
    binding.CreateGeomBindTransformAttr(Gf.Matrix4d(1))
    binding.CreateSkeletonRel().SetTargets([skel.GetPath()])


def _read_skin(mesh_prim, sub):
    """Inverse of _bind_skin: (BoneIndices, BoneWeights) in the subset's palette space, or None.

    A joint the palette does not list cannot be expressed by this subset, so it is reported rather
    than silently snapped to slot 0 -- a DCC that reweights a vertex onto a new bone has changed
    something the MeshSet layout cannot carry, and the caller has to know.
    """
    binding = UsdSkel.BindingAPI(mesh_prim)
    ip = binding.GetJointIndicesPrimvar()
    wp = binding.GetJointWeightsPrimvar()
    if not ip or not ip.HasValue() or not wp or not wp.HasValue():
        return None
    n = sub.vertex_count
    idx = np.array(ip.Get(), dtype=np.int32).reshape(len(ip.Get()) // 4, 4)
    wts = np.array(wp.Get(), dtype=np.float32).reshape(len(wp.Get()) // 4, 4)
    slot = {int(g): i for i, g in enumerate(sub.bone_indices)}
    out = np.zeros(idx.shape, dtype=np.float32)
    for r in range(idx.shape[0]):
        for c in range(4):
            g = int(idx[r, c])
            if g not in slot:
                raise ValueError("vertex %d is weighted to skeleton bone %d, which is not in this "
                                 "subset's palette %s. Reweighting onto a new bone needs the "
                                 "MeshSet's bone arrays rebuilt." % (r, g, list(sub.bone_indices)))
            out[r, c] = slot[g]
    return out, wts



def export(ms, chunks, out_path, textures=None, variations=None, material_ebx=None,
           skeleton=None):
    """Write a MeshSet to USD.

    textures   -- flat {material_name: {slot: resource}}; the single-variation shorthand.
    variations -- the mesh's own MeshVariationDatabase entry,
                  {variation_hash: [ {"$material": ..., "Diffuse": ...}, ... ]}.
                  The list is indexed by `subset.material_index` (verified against the MP_001
                  MVDB: every subset's material_index falls inside its variation's list).

    Variations become a USD variantSet, which is the same idea in both formats: one mesh, several
    material bindings, one selected at a time. Geometry is authored once, outside the variants --
    only the bindings differ, exactly as in BF3.
    """
    stage = Usd.Stage.CreateNew(out_path)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)          # BF3 is metric

    # A skinned MeshSet needs a UsdSkel.Root, not a plain Xform: UsdSkel only binds a mesh whose
    # ancestor is a SkelRoot, and a DCC silently imports the geometry with no rig otherwise.
    # SkelRoot IS-A Xformable, so everything that already treats "/Mesh" as a transformable
    # prototype -- level placements reference it -- keeps working unchanged.
    skinned = any(l.type == 1 for l in ms.lods)
    if skinned:
        root = UsdSkel.Root.Define(stage, "/Mesh")
    else:
        root = UsdGeom.Xform.Define(stage, "/Mesh")
    stage.SetDefaultPrim(root.GetPrim())
    root.GetPrim().SetCustomDataByKey(BF3, json.dumps(_meshset_scaffold(ms, chunks)))

    skel_prim = None
    if skinned:
        if skeleton is None:
            skeleton = SK.synthesise(ms)
        if skeleton is not None:
            skel_prim = _author_skeleton(stage, root, skeleton)

    # ---- geometry, authored once and shared by every variant
    subset_paths = {}                                   # (lod, subset) -> prim path
    for li, lod in enumerate(ms.lods):
        lod_scope = UsdGeom.Scope.Define(stage, "/Mesh/LOD%d" % li)

        # Every LOD but the first is authored INVISIBLE. They are all still here -- the round trip
        # reads them regardless, since visibility does not affect traversal -- but a DCC otherwise
        # draws LOD0 through LOD4 on top of each other: five copies of the same object, z-fighting,
        # and on a 6185-placement level several times the geometry it should be. BF3 picks a LOD by
        # distance at runtime; USD has no equivalent, so the nearest honest thing is to show the
        # highest detail and keep the rest as data.
        if li > 0:
            lod_scope.CreateVisibilityAttr(UsdGeom.Tokens.invisible)
        chunk = chunks.get(li)

        # The fingerprint of the geometry as it left BF3, so the emitter can tell an edited mesh
        # from an untouched one WITHOUT holding the game's bytes.
        #
        # It is needed because the MeshSet resource does not describe the geometry: positions,
        # normals, UVs and tangents all live in the chunk. Deciding "edited" on the resource bytes
        # alone -- which is what the emitter did -- calls a mesh untouched whenever the edit did not
        # move the bounding box or change a count, so a retextured or re-normalled mesh was
        # REFERENCED from the player's install and the edit was silently dropped. (Measured on
        # weapons/pecheneg/pecheneg_ironsight_1p_Mesh: a one-vertex UV nudge and a flipped normal
        # each left the 1,140-byte payload byte-identical while the 67,776-byte chunk differed.)
        #
        # Same shape as collision.py's `bf3:originalDigest`: a digest, not the bytes, because
        # carrying 67 KB per LOD would multiply a 527-mesh stage by its own geometry for data the
        # game already ships.
        if chunk is not None:
            lod_scope.GetPrim().SetCustomDataByKey("bf3:chunkDigest",
                                                   hashlib.sha256(chunk).hexdigest())
        for si, sub in enumerate(lod.subsets):
            p = "/Mesh/LOD%d/subset%d" % (li, si)
            subset_paths[(li, si)] = p
            m = UsdGeom.Mesh.Define(stage, p)

            # A subset with no TexCoord0 is a SHADOW/z-only subset: BF3 draws it into the depth and
            # shadow passes and never shades it, which is why it carries position and bone data at a
            # 16-byte stride instead of the 48 a shaded subset needs. Marked "guide" so a DCC keeps
            # it as data but does not render it -- otherwise it draws as untextured grey geometry
            # over the real surface. 434 of MP_001's 1470 LOD0 meshes are these.
            if not _has_texcoord(lod, sub):
                UsdGeom.Imageable(m).CreatePurposeAttr(UsdGeom.Tokens.guide)
            m.GetPrim().SetCustomDataByKey(BF3 + ":materialIndex", int(sub.material_index))
            if sub.material_name:
                m.GetPrim().SetCustomDataByKey(BF3 + ":materialName", sub.material_name)
            if chunk is None:
                continue
            a = decode_subset(chunk, lod, sub)
            pos = a["Pos"][:, :3]
            m.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(pos.astype(np.float32)))
            idx = a["indices"].reshape(-1)
            m.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(idx.astype(np.int32)))
            m.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(
                np.full(len(idx) // 3, 3, dtype=np.int32)))
            m.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
            if "Normal" in a:
                m.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(a["Normal"][:, :3].astype(np.float32)))
                m.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
            api = UsdGeom.PrimvarsAPI(m)
            for usage, name in (("TexCoord0", "st"), ("TexCoord1", "st1")):
                if usage in a:
                    pv = api.CreatePrimvar(name, Sdf.ValueTypeNames.TexCoord2fArray,
                                           UsdGeom.Tokens.vertex)
                    pv.Set(Vt.Vec2fArray.FromNumpy(a[usage][:, :2].astype(np.float32)))
            if "Tangent" in a:
                pv = api.CreatePrimvar("tangents", Sdf.ValueTypeNames.Float4Array,
                                       UsdGeom.Tokens.vertex)
                pv.Set(Vt.Vec4fArray.FromNumpy(a["Tangent"][:, :4].astype(np.float32)))
            # Everything the packed layout declares, at full component width,
            # under a bf3_ prefix. The standard points/normals/st above are what
            # a DCC edits; these are what guarantees the trip is lossless, since
            # usages like BinormalSign have no USD equivalent and would
            # otherwise be silently zeroed on the way back.
            for usage, vals in a.items():
                if usage == "indices":
                    continue
                pv = api.CreatePrimvar("bf3_" + usage, Sdf.ValueTypeNames.FloatArray,
                                       UsdGeom.Tokens.vertex)
                pv.Set(Vt.FloatArray.FromNumpy(vals.astype(np.float32).reshape(-1)))
                pv.SetElementSize(vals.shape[1])

            # The skinning, in the form a DCC can actually pose. The bf3_ primvars above already
            # carry the same numbers losslessly; these are the AUTHORABLE copy, and load() prefers
            # them for exactly the reason points/st are preferred over bf3_Pos.
            if skel_prim is not None:
                _bind_skin(m.GetPrim(), skel_prim, lod, sub, a)

    if variations:
        _author_variations(stage, ms, subset_paths, variations, material_ebx)
    elif textures:
        # Under /Mesh for the same reason the variation path is: a placement REFERENCES the
        # prototype's default prim, so a material authored beside it never travels with it.
        UsdGeom.Scope.Define(stage, "/Mesh/Materials")
        mat_prims = {}
        for i, (mname, slots) in enumerate(sorted(textures.items())):
            ebx = (material_ebx or [])
            mat_prims[mname] = _define_material(stage, "/Mesh/Materials/mat%d" % i, slots, mname,
                                                ebx[i] if i < len(ebx) else None)
            mat_prims[mname].GetPrim().SetCustomDataByKey(BF3 + "MaterialIndex", i)
        for (li, si), path in sorted(subset_paths.items()):
            sub = ms.lods[li].subsets[si]
            if sub.material_name in mat_prims:
                prim = stage.GetPrimAtPath(path)
                UsdShade.MaterialBindingAPI.Apply(prim)
                UsdShade.MaterialBindingAPI(prim).Bind(mat_prims[sub.material_name])

    stage.GetRootLayer().Save()
    return out_path


def _author_variations(stage, ms, subset_paths, variations, material_ebx=None):
    """One USD variant per BF3 mesh variation, each binding its own materials."""
    # UNDER /Mesh, not beside it. A variant may only author relationships that target paths inside
    # its own scope: bindings written in a variant on /Mesh but pointing at /Materials are dropped
    # by USD with "refers to a path outside the scope of the variant", and the mesh arrives in a DCC
    # with no materials at all. Nothing in this repo noticed, because our own reader takes the
    # bf3:material attribute rather than the binding -- Blender is what surfaced it.
    UsdGeom.Scope.Define(stage, "/Mesh/Materials")

    # Materials are authored once outside the variants and only the BINDING is switched, so a
    # material shared by two variations is not duplicated.
    mats = {}
    bound = {}                                     # vhash -> [material prim per material_index]
    for vhash in sorted(variations):
        row = []
        for entry in variations[vhash]:
            slots = {k: v for k, v in entry.items() if not k.startswith("$")}
            key = json.dumps([entry.get("$material"), sorted(slots.items())], sort_keys=True)
            if key not in mats:
                path = "/Mesh/Materials/mat%d" % len(mats)
                # material_ebx is indexed the way BF3 indexes it: by material_index.
                ebx = (material_ebx or [])
                mi = len(row)
                mats[key] = _define_material(stage, path, slots, entry.get("$material"),
                                             ebx[mi] if mi < len(ebx) else None)
                mats[key].GetPrim().SetCustomDataByKey(BF3 + "MaterialIndex", mi)
            row.append(mats[key])
        bound[vhash] = row

    # Materials the VARIATION does not cover but the mesh still indexes.
    #
    # A variation row lists the materials that variation binds; a subset whose material_index runs
    # past it is skipped as a shadow subset. That leaves a HOLE in the index space, and the emitter
    # -- which reads materials back by index -- finds nothing there and falls back to the template.
    # The MeshMaterial record exists, so author a prim for it even though no variant binds it.
    if material_ebx:
        widest = max((len(r) for r in bound.values()), default=0)

        for mi in range(widest, len(material_ebx)):
            if not material_ebx[mi]:
                continue

            extra = _define_material(stage, "/Mesh/Materials/mat%d" % len(mats), {}, None,
                                     material_ebx[mi])
            extra.GetPrim().SetCustomDataByKey(BF3 + "MaterialIndex", mi)
            mats["__index%d" % mi] = extra

    root = stage.GetPrimAtPath("/Mesh")
    # NOT "bf3:variations". USD reads the colon as a nested path, so writing it on this prim turns
    # the "bf3" key -- which holds the MeshSet scaffold -- from a string into a dict, and the
    # scaffold is gone. Every mesh with variations then fails to load with "the JSON object must be
    # str, bytes or bytearray, not dict", which is every mesh in a level export. The corpus
    # round-trip never caught it because that path passes textures=, never variations=.
    root.SetCustomDataByKey(BF3 + "Variations", json.dumps(sorted(variations)))
    vset = root.GetVariantSets().AddVariantSet("meshVariation")

    for vhash in sorted(variations):
        name = _safe("var_" + str(vhash))
        vset.AddVariant(name)
        vset.SetVariantSelection(name)
        with vset.GetVariantEditContext():
            row = bound[vhash]
            for (li, si), path in sorted(subset_paths.items()):
                mi = ms.lods[li].subsets[si].material_index
                if mi >= len(row):
                    continue                       # shadow subset past the material list
                prim = stage.GetPrimAtPath(path)
                UsdShade.MaterialBindingAPI.Apply(prim)
                UsdShade.MaterialBindingAPI(prim).Bind(row[mi])

    # Default to variation "0" where the mesh has one; otherwise the lowest hash.
    default = "0" if "0" in variations else sorted(variations)[0]
    vset.SetVariantSelection(_safe("var_" + str(default)))

# ----------------------------------------------------------------------- read

def load(path):
    """USD -> (MeshSet, {lod_index: chunk bytes})."""
    stage = Usd.Stage.Open(path)
    root = stage.GetPrimAtPath("/Mesh")
    ms = _rebuild_meshset(json.loads(root.GetCustomDataByKey(BF3)))
    chunks = {}
    edited = []
    changed = False
    moved = set()
    for li, lod in enumerate(ms.lods):
        if not stage.GetPrimAtPath("/Mesh/LOD%d/subset0" % li).GetAttribute("points").HasValue():
            continue          # LOD exported without its chunk; nothing to rebuild
        per = []
        for si, sub in enumerate(lod.subsets):
            m = UsdGeom.Mesh(stage.GetPrimAtPath("/Mesh/LOD%d/subset%d" % (li, si)))
            a = {}
            pts = np.array(m.GetPointsAttr().Get(), dtype=np.float32)
            # Pos may be Half3 in a 4-wide slot; pad to the declared component count.
            a["Pos"] = pts
            idx = np.array(m.GetFaceVertexIndicesAttr().Get(), dtype=np.uint32)
            a["indices"] = idx.reshape(-1, 3)
            n = m.GetNormalsAttr().Get()
            if n:
                a["Normal"] = np.array(n, dtype=np.float32)
            api = UsdGeom.PrimvarsAPI(m)
            for usage, name in (("TexCoord0", "st"), ("TexCoord1", "st1")):
                pv = api.GetPrimvar(name)
                if pv and pv.HasValue():
                    a[usage] = np.array(pv.Get(), dtype=np.float32)
            pv = api.GetPrimvar("tangents")
            if pv and pv.HasValue():
                a["Tangent"] = np.array(pv.Get(), dtype=np.float32)
            # UsdSkel weights, converted back out of skeleton index space into the subset's
            # palette. Read here, alongside points/st/normals, so the bf3_ merge below treats them
            # as the authored values and keeps only the components USD cannot express.
            skin = _read_skin(m.GetPrim(), sub)
            if skin is not None:
                a["BoneIndices"], a["BoneWeights"] = skin
            # bf3_ primvars SUPPLEMENT the standard attributes; they do not override them.
            #
            # They used to be authoritative, which quietly broke the entire point of the format: a
            # DCC writes `points`/`st`/`normals` and knows nothing about bf3_Pos, so every edit made
            # outside this codec was thrown away on the way back and the resource still reported a
            # clean round trip. (Measured: moving all 1347 vertices 5 cm changed 0 bytes.)
            #
            # So take the components USD actually carries from the standard attribute, and keep the
            # bf3_ value only for the components it cannot express -- the 4th slot of a half4 Pos,
            # BinormalSign, BoneIndices and friends. Byte-identity is preserved for an unedited
            # file, because half -> float32 -> half is exact.
            for p2 in api.GetPrimvars():
                nm = p2.GetPrimvarName()
                if not nm.startswith("bf3_") or not p2.HasValue():
                    continue

                usage = nm[4:]
                w = p2.GetElementSize()
                wide = np.array(p2.Get(), dtype=np.float32).reshape(-1, w)
                std = a.get(usage)

                if std is None:
                    a[usage] = wide
                    continue

                if len(std) != len(wide):
                    raise ValueError(
                        "LOD%d/subset%d: %s has %d rows but bf3_%s has %d. Changing topology is "
                        "not supported: edit positions in place, or rebuild the MeshSet."
                        % (li, si, usage, len(std), usage, len(wide)))

                keep = min(std.shape[1], w)

                # A moved vertex is an edit too. The bbox used to follow only a TOPOLOGY change, so
                # nudging geometry in a DCC produced a mesh whose bounding box still described where
                # it used to be -- and the engine culls against that box, so an edited mesh could
                # vanish at certain angles while looking perfectly correct in the file. Comparing
                # against bf3_Pos catches it exactly: no DCC writes that primvar, so it still holds
                # the values this codec exported.
                if not np.array_equal(wide[:, :keep], std[:, :keep]):
                    moved.add(usage)

                wide[:, :keep] = std[:, :keep]
                a[usage] = wide
            per.append(_widen(a, sub))

        # Only when the geometry actually changed. Recomputing the bbox or the subset count on an
        # UNTOUCHED file rewrites values the resource already carries -- the stored bbox is not
        # necessarily the exact min/max of the float32 positions -- and that silently breaks the
        # byte-identical round trip. (It did: 1199/1199 fell over the moment this ran unconditionally.)
        if _relayout(lod, per) or "Pos" in moved:
            changed = True
            edited.extend(a["Pos"][:, :3] for a in per)

        chunks[li] = rebuild_chunk(lod, per) + getattr(lod, "_chunk_tail", b"")

    if changed:
        _rebound(ms, edited)
        ms.total_subset_count = sum(len(l.subsets) for l in ms.lods)

    return ms, chunks


def unedited_geometry(path, chunks):
    """Did the geometry come back exactly as it went out?

    The resource payload cannot answer this. Geometry lives in the CHUNK, and a MeshSet that
    describes it changes only when a count or the bounding box changes -- so a UV or normal edit
    leaves the payload byte-identical. Comparing the rebuilt chunk against the digest `export`
    authored is the check that actually covers the geometry.

    -> True   every LOD that was exported with a chunk rebuilt to the same bytes
       False  at least one differs, or a LOD that had geometry came back without it: it must ship
       None   the stage carries no digests at all (exported before they existed), so nothing can
              be proven and the caller has to say so rather than assume untouched
    """
    stage = Usd.Stage.Open(path)
    seen = False

    for li in range(len(_rebuild_meshset(
            json.loads(stage.GetPrimAtPath("/Mesh").GetCustomDataByKey(BF3))).lods)):
        prim = stage.GetPrimAtPath("/Mesh/LOD%d" % li)

        if not prim:
            continue

        want = prim.GetCustomDataByKey("bf3:chunkDigest")

        if not want:
            continue

        seen = True
        got = chunks.get(li)

        if got is None or hashlib.sha256(got).hexdigest() != want:
            return False

    return True if seen else None


def _relayout(lod, per_subset_attrs):
    """Recompute a LOD's byte layout when the geometry that came back changed size.

    BF3 packs subsets end to end with NO padding: every subset's vertex_offset is the running sum
    of vertex_count * vertex_stride, and start_index the running sum of primitive_count * 3, with
    vertex_data_size / index_data_size the totals. Measured across the dump corpus: 2754 of 2755
    LODs obey this exactly.

    So a mesh whose vertex or triangle count changed in a DCC does not need to be refused -- it
    needs its offsets recomputed, which is all this does. That is what makes
    BF3 -> USD -> edit -> BF3 work for real edits (adding, deleting or replacing geometry) rather
    than only for nudging existing vertices.

    Only runs when something actually changed. An untouched file keeps its original offsets
    verbatim, so byte-identical round-tripping is unaffected -- including the one corpus mesh whose
    subsets share vertex data and would not survive a blind recompute.
    """
    changed = any(len(a["Pos"]) != sub.vertex_count or len(a["indices"]) != sub.primitive_count
                  for sub, a in zip(lod.subsets, per_subset_attrs))

    if not changed:
        return False

    voff, istart = 0, 0

    for sub, attrs in zip(lod.subsets, per_subset_attrs):
        sub.vertex_count = len(attrs["Pos"])
        sub.primitive_count = len(attrs["indices"])
        sub.vertex_offset = voff
        sub.start_index = istart
        voff += sub.vertex_count * sub.vertex_stride
        istart += sub.primitive_count * 3

    lod.vertex_data_size = voff
    lod.index_data_size = istart * 2
    return True


def _rebound(ms, position_arrays):
    """The MeshSet's bounding box has to follow the geometry, or the engine culls the mesh against
    a box that no longer contains it."""
    allp = np.vstack([p for p in position_arrays if len(p)])

    if not len(allp):
        return

    ms.bbox_min = tuple(float(v) for v in allp.min(axis=0))
    ms.bbox_max = tuple(float(v) for v in allp.max(axis=0))


def _widen(a, sub):
    """USD stores 3-vectors; the packed layout may declare 4 components (with a
    separate usage packed into the 4th slot, e.g. BinormalSign). Restore width
    by zero-padding — any component USD did not carry is re-derived from the
    scaffolding, never invented."""
    from geom import FORMAT, USAGE
    for e in sub.geom_decl.elements[:sub.geom_decl.element_count]:
        name = USAGE.get(e.usage, "usage%d" % e.usage)
        if name not in a:
            continue
        want = FORMAT[e.fmt][1]
        v = a[name]
        if v.shape[1] < want:
            a[name] = np.hstack([v, np.zeros((v.shape[0], want - v.shape[1]), np.float32)])
        elif v.shape[1] > want:
            a[name] = v[:, :want]
    return a
