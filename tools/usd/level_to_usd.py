#!/usr/bin/env python3
"""Author a level as USD: drawable geometry, its materials, and its collision hulls.

This is the interchange point. Everything upstream (a Source BSP today, a GTA map or a Blender
scene tomorrow) writes this stage; everything downstream (usd_to_bf3.py) reads it. Neither end has
to know about the other, which is the whole reason for having USD in the middle rather than a
private format.

The stage is authored in BF3's own space -- metres, Y-up, centred with the floor at Y=0 -- so it
opens correctly in usdview or Blender and the importer needs no hidden transform.

Write .usdc, not .usda: USD picks the format from the extension, and a level's worth of geometry is
about five times the size as text (MP_001's terrain alone is 107 MB ASCII against 21 MB binary).
The content is identical either way -- .usda is for reading by eye, not for shipping.

Collision is carried the way USD carries collision, not in a sidecar: each hull is a Mesh with
UsdPhysicsCollisionAPI and a convexHull approximation. A DCC that understands physics schemas will
show and edit them; one that does not still shows them as geometry.
"""
import os
import sys

import numpy as np
from pxr import Usd, UsdGeom, UsdPhysics, UsdShade, Sdf, Gf, Vt

sys.path.insert(0, __file__.rsplit('/', 3)[0] + '/tools/havok')

SRC_TO_BF3 = lambda v: np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)   # noqa: E731
INCH = 0.0254


def _safe(name):
    out = ''.join(c if c.isalnum() else '_' for c in name)
    return ('m_' + out) if not out[:1].isalpha() else out


def _bind_texture(stage, mat, shader, path, slot, channel):
    """Wire one UsdUVTexture into a slot of the preview surface."""
    tex = UsdShade.Shader.Define(stage, mat.GetPath().AppendChild(slot))
    tex.CreateIdAttr('UsdUVTexture')
    tex.CreateInput('file', Sdf.ValueTypeNames.Asset).Set(path)
    tex.CreateInput('st', Sdf.ValueTypeNames.Float2).Set(Gf.Vec2f(0, 0))
    out = tex.CreateOutput('rgb', Sdf.ValueTypeNames.Float3)
    shader.CreateInput(channel, Sdf.ValueTypeNames.Color3f if channel == 'diffuseColor'
                       else Sdf.ValueTypeNames.Normal3f).ConnectToSource(out)


def author_render(stage, root, pos, uv, groups, textures=None):
    """One Mesh, one GeomSubset per material -- the shape BF3's subsets already have.

    textures: material -> (colour dds, normal dds) as paths RELATIVE to the stage, so the stage
    plus its texture folder is a self-contained thing to hand to someone. Without this the
    materials are named but empty, and the stage opens as grey geometry anywhere but here.
    """
    tris = []
    order = sorted(groups)
    counts = []

    for name in order:
        counts.append(len(groups[name]))
        tris.extend(groups[name])

    # USD indexes points and texcoords together per face-vertex, so uvs go out as a faceVarying
    # primvar rather than a second index list.
    idx = [v[0] for t in tris for v in t]
    uvs = [uv[v[1]] if 0 <= v[1] < len(uv) else (0.0, 0.0) for t in tris for v in t]

    mesh = UsdGeom.Mesh.Define(stage, root.GetPath().AppendChild('Render'))
    mesh.CreatePointsAttr(Vt.Vec3fArray(
        [Gf.Vec3f(float(p[0]), float(p[1]), float(p[2])) for p in pos]))
    mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(idx))
    mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3] * len(tris)))
    mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)

    pv = UsdGeom.PrimvarsAPI(mesh).CreatePrimvar(
        'st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.faceVarying)
    pv.Set(Vt.Vec2fArray([Gf.Vec2f(float(u[0]), float(u[1])) for u in uvs]))

    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Materials'))
    at = 0

    for name, n in zip(order, counts):
        sub = UsdGeom.Subset.CreateGeomSubset(
            mesh, _safe(name), UsdGeom.Tokens.face,
            Vt.IntArray(list(range(at, at + n))), 'materialBind')
        # The sanitised prim name cannot round-trip a path like "DE_DUST/DOOR011", so the real
        # name rides along as metadata.
        sub.GetPrim().CreateAttribute('bf3:material', Sdf.ValueTypeNames.String).Set(name)

        mat = UsdShade.Material.Define(stage, scope.GetPath().AppendChild(_safe(name)))
        shader = UsdShade.Shader.Define(stage, mat.GetPath().AppendChild('Surface'))
        shader.CreateIdAttr('UsdPreviewSurface')

        colour, normal = (textures or {}).get(name, (None, None))

        if colour:
            _bind_texture(stage, mat, shader, colour, 'Colour', 'diffuseColor')

        if normal:
            _bind_texture(stage, mat, shader, normal, 'Normal', 'normal')

        mat.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), 'surface')
        UsdShade.MaterialBindingAPI(sub.GetPrim()).Bind(mat)
        at += n

    return mesh


def author_collision(stage, root, hulls):
    """hulls: (centre, vertices relative to centre, faces as index lists, plane equations).

    The planes ride along as bf3:planes. A convex hull's planes CAN be recomputed from its faces,
    but not bit-for-bit -- a Newell normal off the triangulated face is not the plane the source
    data had -- so carrying them keeps the stage a lossless carrier rather than a good likeness.
    A consumer that ignores the attribute still gets a correct hull from the geometry.
    """
    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Collision'))

    for i, (centre, verts, faces, planes) in enumerate(hulls):
        path = scope.GetPath().AppendChild('hull_%04d' % i)
        m = UsdGeom.Mesh.Define(stage, path)
        m.CreatePointsAttr(Vt.Vec3fArray(
            [Gf.Vec3f(float(v[0]), float(v[1]), float(v[2])) for v in verts]))
        m.CreateFaceVertexCountsAttr(Vt.IntArray([len(f) for f in faces]))
        m.CreateFaceVertexIndicesAttr(Vt.IntArray([i for f in faces for i in f]))
        m.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        UsdGeom.Xformable(m).AddTranslateOp().Set(
            Gf.Vec3d(float(centre[0]), float(centre[1]), float(centre[2])))
        m.CreatePurposeAttr(UsdGeom.Tokens.guide)          # collision is not drawable geometry

        m.GetPrim().CreateAttribute('bf3:planes', Sdf.ValueTypeNames.Float4Array).Set(
            Vt.Vec4fArray([Gf.Vec4f(*[float(c) for c in p]) for p in planes]))

        UsdPhysics.CollisionAPI.Apply(m.GetPrim())
        api = UsdPhysics.MeshCollisionAPI.Apply(m.GetPrim())
        api.CreateApproximationAttr(UsdPhysics.Tokens.convexHull)

    return scope


def author_props(stage, root, bsp_path, shift, model_dir='/tmp/dust2/models'):
    """Static props: one prototype per model, one instanceable Xform per placement."""
    import mdl
    import props as props_mod

    names, placed = props_mod.placements(bsp_path)
    protos = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Prototypes'))
    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Props'))
    built, missing, instanced = {}, set(), 0

    for idx, position, rotation in placed:
        model = names[idx] if idx < len(names) else None

        if model is None:
            continue

        base = model.lower().replace('.mdl', '').replace('/', '__')
        path = os.path.join(model_dir, base)

        if base not in built:
            if not os.path.exists(path + '.mdl'):
                missing.add(model)
                built[base] = None
            else:
                try:
                    pos, uv, groups = mdl.load(path)
                except Exception:                                    # noqa: BLE001
                    missing.add(model)
                    built[base] = None
                else:
                    # Prototype geometry is local to the model's own origin: only the axis map and
                    # the unit change apply here, never the world shift.
                    pts = [tuple(props_mod.BASIS @ (np.array(v) * props_mod.INCH)) for v in pos]
                    proto = UsdGeom.Mesh.Define(stage, protos.GetPath().AppendChild(_safe(base)))
                    tris = [t for g in groups.values() for t in g]
                    proto.CreatePointsAttr(Vt.Vec3fArray(
                        [Gf.Vec3f(float(a), float(b), float(c)) for a, b, c in pts]))
                    proto.CreateFaceVertexIndicesAttr(
                        Vt.IntArray([v[0] for t in tris for v in t]))
                    proto.CreateFaceVertexCountsAttr(Vt.IntArray([3] * len(tris)))
                    proto.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
                    pv = UsdGeom.PrimvarsAPI(proto).CreatePrimvar(
                        'st', Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.faceVarying)
                    pv.Set(Vt.Vec2fArray([Gf.Vec2f(float(uv[v[1]][0]), float(1.0 - uv[v[1]][1]))
                                          for t in tris for v in t]))
                    proto.GetPrim().CreateAttribute(
                        'bf3:sourceModel', Sdf.ValueTypeNames.String).Set(model)

                    # A model names its materials bare and lists search paths separately, so the
                    # full path only exists once the two are combined. Resolve it here and carry
                    # it, rather than making every consumer redo the join.
                    try:
                        mats, cds, _meshes = mdl.read_mdl(path + '.mdl')
                        resolved = []

                        for mat in mats:
                            leaf = mat.replace('\\', '/').strip('/').lower()

                            for cd in cds:
                                head = cd.replace('\\', '/').strip('/').lower()
                                full = ('%s/%s' % (head, leaf)) if head else leaf

                                if os.path.exists(os.path.join(
                                        '/tmp/dust2/mat', full.replace('/', '__') + '.vmt')):
                                    resolved.append(full)
                                    break
                            else:
                                resolved.append(leaf)

                        proto.GetPrim().CreateAttribute(
                            'bf3:materials', Sdf.ValueTypeNames.StringArray).Set(resolved)
                    except Exception:                                    # noqa: BLE001
                        pass

                    # Its collision, where the model ships any. Source keeps this in a .phy as
                    # convex ledges, which is already the shape hkpConvexVerticesShape wants, so it
                    # travels as collision geometry rather than being rebuilt from the render mesh.
                    if os.path.exists(path + '.phy'):
                        import phy as phy_mod

                        for hi, (hv, ht) in enumerate(phy_mod.hulls(path + '.phy',
                                                                    with_faces=True)):
                            pts = [tuple(props_mod.BASIS @ (np.array(v) * props_mod.INCH))
                                   for v in hv]
                            hull = UsdGeom.Mesh.Define(
                                stage, proto.GetPath().AppendChild('collision_%d' % hi))
                            hull.CreatePointsAttr(Vt.Vec3fArray(
                                [Gf.Vec3f(float(a), float(b), float(c)) for a, b, c in pts]))
                            hull.CreateFaceVertexCountsAttr(Vt.IntArray([3] * len(ht)))
                            hull.CreateFaceVertexIndicesAttr(
                                Vt.IntArray([int(i) for t in ht for i in t]))
                            hull.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
                            hull.CreatePurposeAttr(UsdGeom.Tokens.guide)

                            pl = phy_mod.planes(hv, ht)
                            moved = []

                            for nx, ny, nz, dd in pl:
                                nb = props_mod.BASIS @ np.array([nx, ny, nz])
                                moved.append(Gf.Vec4f(float(nb[0]), float(nb[1]), float(nb[2]),
                                                      float(dd * props_mod.INCH)))

                            hull.GetPrim().CreateAttribute(
                                'bf3:planes', Sdf.ValueTypeNames.Float4Array).Set(
                                    Vt.Vec4fArray(moved))
                            UsdPhysics.CollisionAPI.Apply(hull.GetPrim())
                            api = UsdPhysics.MeshCollisionAPI.Apply(hull.GetPrim())
                            api.CreateApproximationAttr(UsdPhysics.Tokens.convexHull)

                    built[base] = proto.GetPath()

        target = built.get(base)

        if target is None:
            continue

        p_bf3, r_bf3 = props_mod.to_bf3(position, rotation, shift)
        xf = UsdGeom.Xform.Define(stage, scope.GetPath().AppendChild('prop_%04d' % instanced))
        m = Gf.Matrix4d(
            float(r_bf3[0][0]), float(r_bf3[1][0]), float(r_bf3[2][0]), 0.0,
            float(r_bf3[0][1]), float(r_bf3[1][1]), float(r_bf3[2][1]), 0.0,
            float(r_bf3[0][2]), float(r_bf3[1][2]), float(r_bf3[2][2]), 0.0,
            float(p_bf3[0]), float(p_bf3[1]), float(p_bf3[2]), 1.0)
        xf.AddTransformOp().Set(m)
        xf.GetPrim().GetReferences().AddInternalReference(target)
        xf.GetPrim().SetInstanceable(True)
        instanced += 1

    print('props     %d placements of %d models (%d models unavailable)'
          % (instanced, sum(1 for v in built.values() if v), len(missing)))
    return instanced


def author_decals(stage, root, bsp_path, shift, textures=None):
    """dust2's info_overlay decals, as their own meshes under /Decals.

    They belong in the stage for the same reason the collision hulls do: the level is not fully
    described without them, and a builder that reads the stage should not have to go back to the
    BSP for a piece of it. Each carries its material name in `bf3:material`, so the binding survives
    the round trip even where the material itself was not shipped.

    54 of the 55 overlays are FACE-PAINTED -- their texinfo has zero texture axes, so there is no
    basis to build a quad along and they are the BSP faces they name instead.
    """
    import overlays

    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Decals'))
    n = 0

    for name, points, uvs, tris in overlays.load_painted(bsp_path):
        world = np.array([[p[0] * INCH, p[2] * INCH, -p[1] * INCH] for p in points]) - shift
        prim = UsdGeom.Mesh.Define(
            stage, scope.GetPath().AppendChild('decal_%04d' % n))
        prim.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*map(float, v)) for v in world]))
        prim.CreateFaceVertexIndicesAttr(
            Vt.IntArray([int(i) for t in tris for i in t]))
        prim.CreateFaceVertexCountsAttr(Vt.IntArray([3] * len(tris)))
        prim.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        UsdGeom.PrimvarsAPI(prim).CreatePrimvar(
            'st', Sdf.ValueTypeNames.TexCoord2fArray,
            UsdGeom.Tokens.vertex).Set(Vt.Vec2fArray([Gf.Vec2f(*map(float, t)) for t in uvs]))
        prim.GetPrim().SetCustomDataByKey('bf3:material', name)
        n += 1

    print('decals    %d authored into the stage' % n)
    return n


def build(obj_path, bsp_path, out_path, name='dust2', mat_dir=None):
    import build_dust2                                                       # noqa: F401
    import brush_hulls
    import convex_layout
    import build_dust2_convex as conv

    pos, uv, groups = build_dust2.load_obj_grouped(obj_path)
    pos = SRC_TO_BF3(pos)
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    shift = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    pos = pos - shift

    stage = Usd.Stage.CreateNew(out_path)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    root = UsdGeom.Xform.Define(stage, '/' + name)
    stage.SetDefaultPrim(root.GetPrim())

    textures = None

    if mat_dir:
        out_root = os.path.dirname(os.path.abspath(out_path))
        dds_dir = os.path.join(out_root, name + '_textures')
        build_dust2.configure('mp001')
        binding, normals, _missing = build_dust2.collect_textures(
            sorted(groups), mat_dir, os.path.join(mat_dir, 'pak'))
        written, _failed, flat = build_dust2.write_dds(binding, mat_dir, dds_dir, normals)
        rel = lambda base: './%s_textures/%s.dds' % (name, base.replace('/', '__'))  # noqa: E731
        textures = {m: (rel(binding[m]) if binding.get(m) in written else None,
                        rel(normals[m]) if normals.get(m) in written else None)
                    for m in groups}
        print('textures  %d colour + %d normal maps written beside the stage'
              % (len(binding), sum(1 for v in textures.values() if v[1])))

    author_render(stage, root, pos, uv, groups, textures)
    author_decals(stage, root, bsp_path, shift, textures)

    hulls, outside = [], 0
    margin = 2.0

    for planes, pts in brush_hulls.brushes(bsp_path):
        if len(pts) < 4:
            continue

        world = np.array([[p[0] * INCH, p[2] * INCH, -p[1] * INCH] for p in pts]) - shift

        if (world.min(axis=0) > hi - shift + margin).any() or \
           (world.max(axis=0) < lo - shift - margin).any():
            outside += 1
            continue

        centre = world.mean(axis=0)
        local = [tuple(v) for v in (world - centre)]
        moved = []

        for nx, ny, nz, d in planes:
            n = (nx, nz, -ny)
            moved.append((n[0], n[1], n[2], d * INCH - float(np.dot(n, shift + centre))))

        faces, kept = convex_layout.faces(local, moved)

        if len(faces) < 4:
            continue

        hulls.append((tuple(float(c) for c in centre), local, faces,
                      [moved[k] for k in kept]))

    author_collision(stage, root, hulls)
    author_props(stage, root, bsp_path, shift)
    stage.GetRootLayer().Save()

    print('%s: %d materials, %d points, %d collision hulls (%d outside the map)'
          % (out_path, len(groups), len(pos), len(hulls), outside))
    return out_path


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else '/tmp/dust2/de_dust2.obj',
          sys.argv[2] if len(sys.argv) > 2 else '/tmp/dust2/de_dust2.bsp',
          sys.argv[3] if len(sys.argv) > 3 else '/tmp/dust2/dust2.usdc',
          mat_dir=sys.argv[4] if len(sys.argv) > 4 else None)
