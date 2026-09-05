#!/usr/bin/env python3
"""Read a USD stage and emit the BF3 resources for it: a MeshSet and a HavokPhysicsData.

The other half of level_to_usd.py, and the reason the pipeline is worth having: this reads any
stage that follows the conventions, not just one this repo wrote. Drawable Meshes become the
MeshSet's subsets, prims carrying UsdPhysicsCollisionAPI become Havok convex shapes. A level
modelled in Blender and a level converted from another game arrive here identically.

Materials come from each GeomSubset -- its bf3:material attribute if it has one, otherwise its
bound UsdShade material, otherwise the prim name.
"""
import os
import sys

import numpy as np
from pxr import Usd, UsdGeom, UsdPhysics, UsdShade

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'havok'))


def _material_name(subset):
    a = subset.GetPrim().GetAttribute('bf3:material')

    if a and a.Get():
        return a.Get()

    b = UsdShade.MaterialBindingAPI(subset.GetPrim()).ComputeBoundMaterial()[0]

    if b:
        return b.GetPrim().GetName()

    return subset.GetPrim().GetName()


def read_render(stage):
    """-> (positions, uvs, {material: [triangle, ...]}) in the shape build_dust2 expects."""
    pos, uv, groups = None, [], {}

    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh) or prim.HasAPI(UsdPhysics.CollisionAPI):
            continue

        mesh = UsdGeom.Mesh(prim)
        pos = np.array(mesh.GetPointsAttr().Get(), np.float64)
        counts = list(mesh.GetFaceVertexCountsAttr().Get())
        idx = list(mesh.GetFaceVertexIndicesAttr().Get())

        st = UsdGeom.PrimvarsAPI(prim).GetPrimvar('st')
        uv = np.array(st.Get(), np.float64) if st and st.Get() is not None else np.zeros((1, 2))

        # Corner c of face f indexes the faceVarying uv array directly, so a triangle carries its
        # own uv slots and no second index list is needed.
        starts, at = [], 0

        for c in counts:
            starts.append(at)
            at += c

        subsets = UsdGeom.Subset.GetGeomSubsets(mesh)

        if not subsets:
            subsets = [None]

        for sub in subsets:
            faces = (list(sub.GetIndicesAttr().Get()) if sub is not None
                     else list(range(len(counts))))
            name = _material_name(sub) if sub is not None else 'default'
            tris = groups.setdefault(name, [])

            for f in faces:
                s, n = starts[f], counts[f]

                for k in range(1, n - 1):
                    tris.append(((idx[s], s), (idx[s + k], s + k), (idx[s + k + 1], s + k + 1)))

        break                                   # one drawable mesh per level, as authored

    return pos, uv, groups


def _plane(points):
    """Newell's normal for a face, and its distance, so n.p = d for points on it."""
    n = np.zeros(3)

    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        n += np.cross(a, b)

    ln = np.linalg.norm(n)

    if ln < 1e-12:
        return None

    n = n / ln
    return (float(n[0]), float(n[1]), float(n[2]), float(np.dot(n, points[0])))


def read_decals(stage):
    """The stage's /Decals, as (material name, points, uvs, triangles).

    Their points are already in BF3 world space -- the stage authored them through the same
    transform as the render mesh -- so a builder appends them as-is. Reading them here rather than
    from the BSP is the point: the stage describes the level, and a decal that only exists in the
    source map is a piece of the level the round trip does not carry.
    """
    out = []

    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue

        if 'Decals' not in str(prim.GetPath()):
            continue

        mesh = UsdGeom.Mesh(prim)
        pts = [tuple(v) for v in mesh.GetPointsAttr().Get() or []]
        idx = list(mesh.GetFaceVertexIndicesAttr().Get() or [])
        uvs = UsdGeom.PrimvarsAPI(prim).GetPrimvar('st').Get()
        uvs = [tuple(v) for v in (uvs or [])]
        name = prim.GetCustomDataByKey('bf3:material')

        if not (name and pts and idx):
            continue

        tris = [(idx[i], idx[i + 1], idx[i + 2]) for i in range(0, len(idx) - 2, 3)]
        out.append((name, pts, uvs, tris))

    return out


def read_collision(stage):
    """-> build_collision.convex descriptors for every prim with a collision API."""
    import build_collision

    out, skipped = [], 0

    for prim in stage.Traverse():
        if not prim.HasAPI(UsdPhysics.CollisionAPI) or not prim.IsA(UsdGeom.Mesh):
            continue

        mesh = UsdGeom.Mesh(prim)
        verts = [tuple(float(c) for c in p) for p in mesh.GetPointsAttr().Get()]
        counts = list(mesh.GetFaceVertexCountsAttr().Get())
        idx = list(mesh.GetFaceVertexIndicesAttr().Get())

        # Prefer the authored planes: recomputing them from the faces is correct but not exact.
        carried = prim.GetAttribute('bf3:planes')

        if carried and carried.Get():
            planes = [tuple(float(c) for c in p) for p in carried.Get()]
        else:
            planes, at = [], 0

            for c in counts:
                face = [np.array(verts[i]) for i in idx[at:at + c]]
                at += c
                p = _plane(face)

                if p is not None:
                    planes.append(p)

        xf = UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default())
        t = xf.ExtractTranslation()
        shape = build_collision.convex((float(t[0]), float(t[1]), float(t[2])), verts, planes)

        if shape is None:
            skipped += 1
            continue

        out.append(shape)

    return out, skipped


def main(usd_path, reference, out_dir, mat_dir=None, host='mp001'):
    """With mat_dir, runs the FULL build off the stage -- textures, EBX partitions, MVDB, world
    and the Rime command list -- so a USD is enough to produce a loadable level. Without it, just
    the two geometry resources."""
    import build_collision
    import build_dust2

    os.makedirs(out_dir, exist_ok=True)
    stage = Usd.Stage.Open(usd_path)

    pos, uv, groups = read_render(stage)
    print('render    : %d points, %d materials' % (len(pos), len(groups)))

    shapes, skipped = read_collision(stage)
    print('collision : %d hulls (%d not solid)' % (len(shapes), skipped))

    # DUST2_PHYSICS_SIMPLE replaces the level's hulls with a single box under the spawn. It exists
    # to separate "the engine rejects this HavokPhysicsData" from "the engine rejects 1739 shapes
    # in one container" -- the two look identical from outside, which is a silent exit.
    # DUST2_PHYSICS_ONE_HULL keeps a single CONVEX shape, where DUST2_PHYSICS_SIMPLE swaps in a
    # box. The level loads with 1751 convex hulls and with one box; one convex hull is the
    # combination neither of those covers.
    if os.environ.get('DUST2_PHYSICS_ONE_HULL'):
        keep = int(os.environ['DUST2_PHYSICS_ONE_HULL'])
        # A negative count takes them from the END, to tell "these particular hulls" apart from
        # "this many hulls".
        shapes = shapes[keep:] if keep < 0 else shapes[:keep]
        print('collision : REDUCED to %d convex hull(s) (DUST2_PHYSICS_ONE_HULL)' % keep)
    elif os.environ.get('DUST2_PHYSICS_SIMPLE'):
        shapes = [build_collision.box((0.0, -0.5, 0.0), (60.0, 0.5, 60.0))]
        print('collision : REPLACED with a single %s box (DUST2_PHYSICS_SIMPLE)'
              % '120x1x120 m')

    physics = os.path.join(out_dir, 'dust2_physics.bin')
    open(physics, 'wb').write(build_collision.build(shapes))

    if mat_dir:
        build_dust2.main(None, reference, mat_dir, out_dir,
                         os.environ.get('BF3_PATH', os.path.expanduser(
                             '~/.local/share/Steam/steamapps/common/Battlefield 3')),
                         host=host, loaded=(pos, uv, groups), transform=False,
                         physics=physics)
    else:
        build_dust2.configure(host)
        build_dust2.build_mesh(None, reference,
                               os.path.join(out_dir, 'dust2.meshset'),
                               os.path.join(out_dir, 'dust2.chunk'),
                               loaded=(pos, uv, groups), transform=False)

    print('physics   : %s' % physics)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/dust2/dust2.usdc',
         sys.argv[2] if len(sys.argv) > 2 else '/tmp/dust2/refs/tires.meshset',
         sys.argv[3] if len(sys.argv) > 3 else '/tmp/dust2/usd_out',
         mat_dir=sys.argv[4] if len(sys.argv) > 4 else None)
