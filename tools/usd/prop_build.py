#!/usr/bin/env python3
"""Turn the USD's prop prototypes and placements into BF3 resources.

Each prototype becomes a MeshSet and an ObjectBlueprint -- the same shape build_dust2 gives the
level mesh, because a prop IS just a small static model. Each placement becomes a
ReferenceObjectData in the sub-level's world partition, which is how BF3 puts the same blueprint
down 30 times without 30 copies of the geometry.

The transform comes off the USD prim rather than being recomputed from the BSP: the stage already
holds it in BF3's own space, and reading it back is what makes the USD the source of truth rather
than a by-product.
"""
import os
import sys

import numpy as np
from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_dust2                                                          # noqa: E402


def _identity():
    return {'right': {'x': 1.0, 'y': 0.0, 'z': 0.0},
            'up': {'x': 0.0, 'y': 1.0, 'z': 0.0},
            'forward': {'x': 0.0, 'y': 0.0, 'z': 1.0},
            'trans': {'x': 0.0, 'y': 0.0, 'z': 0.0}}


def _transform(matrix):
    """USD 4x4 -> BF3's LinearTransform: three basis rows then the translation."""
    m = np.array([[matrix[r][c] for c in range(4)] for r in range(4)])
    return {'right': {'x': float(m[0][0]), 'y': float(m[0][1]), 'z': float(m[0][2])},
            'up': {'x': float(m[1][0]), 'y': float(m[1][1]), 'z': float(m[1][2])},
            'forward': {'x': float(m[2][0]), 'y': float(m[2][1]), 'z': float(m[2][2])},
            'trans': {'x': float(m[3][0]), 'y': float(m[3][1]), 'z': float(m[3][2])}}


def read(stage_path):
    """-> ({prototype path: (positions, uvs, groups, materials)}, [(prototype path, transform)])."""
    stage = Usd.Stage.Open(stage_path)
    protos, placements = {}, []

    for prim in stage.Traverse():
        path = prim.GetPath().pathString

        if '/Prototypes/' in path and prim.IsA(UsdGeom.Mesh) and path.count('/') == 3:
            mesh = UsdGeom.Mesh(prim)
            pos = [tuple(float(c) for c in p) for p in mesh.GetPointsAttr().Get()]
            idx = list(mesh.GetFaceVertexIndicesAttr().Get())
            counts = list(mesh.GetFaceVertexCountsAttr().Get())
            st = UsdGeom.PrimvarsAPI(prim).GetPrimvar('st')
            uv = [tuple(float(c) for c in v) for v in (st.Get() or [])] or [(0.0, 0.0)]
            name = prim.GetName()
            tris, at = [], 0

            for c in counts:
                for k in range(1, c - 1):
                    tris.append(((idx[at], at), (idx[at + k], at + k),
                                 (idx[at + k + 1], at + k + 1)))
                at += c

            # bf3:materials is the model's own material list, already joined with its search
            # paths -- keyed by the group name so the mesh's single subset binds to the first.
            attr = prim.GetAttribute('bf3:materials')
            mats = list(attr.Get()) if attr and attr.Get() else []
            protos[path] = (np.array(pos, np.float64), np.array(uv, np.float64),
                            {(mats[0] if mats else name): tris}, mats)

    for prim in stage.Traverse():
        path = prim.GetPath().pathString

        if '/Props/prop_' not in path:
            continue

        refs = prim.GetMetadata('references')
        target = None

        if refs:
            for item in getattr(refs, 'GetAddedOrExplicitItems', lambda: [])():
                target = item.primPath.pathString

        if target is None:
            continue

        m = UsdGeom.Xformable(prim).GetLocalTransformation()
        placements.append((target, _transform(m)))

    return protos, placements


def main(stage_path, reference, out_dir):
    protos, placements = read(stage_path)
    print('prototypes %d   placements %d' % (len(protos), len(placements)))
    os.makedirs(os.path.join(out_dir, 'props'), exist_ok=True)
    build_dust2.configure('mp001')
    built = {}
    tris = 0

    for path, (pos, uv, groups, mats) in sorted(protos.items()):
        name = path.rsplit('/', 1)[-1]
        base = os.path.join(out_dir, 'props', name)
        saved = (build_dust2.MESH_NAME, build_dust2.BLUEPRINT_NAME)
        build_dust2.MESH_NAME = 'dust2/props/%s_mesh' % name
        build_dust2.BLUEPRINT_NAME = 'dust2/props/%s' % name

        try:
            info = build_dust2.build_mesh(None, reference, base + '.meshset', base + '.chunk',
                                          loaded=(pos, uv, groups), transform=False)
            binding, normals, missing = build_dust2.collect_textures(
                list(groups), '/tmp/dust2/mat', '/tmp/dust2/mat/pak')
            built[path] = (build_dust2.MESH_NAME, build_dust2.BLUEPRINT_NAME, info,
                           binding, normals)
            tris += info['tris']
        except Exception as ex:                                              # noqa: BLE001
            print('   %-28s FAILED %s' % (name, str(ex)[:60]))
        finally:
            build_dust2.MESH_NAME, build_dust2.BLUEPRINT_NAME = saved

    bound = sum(1 for v in built.values() if v[3])
    with_n = sum(1 for v in built.values() if v[4])
    print('prop meshes built: %d of %d  (%d subset triangles)' % (len(built), len(protos), tris))
    print('prop meshes with a bound colour map: %d   with a real normal: %d' % (bound, with_n))
    placed = sum(1 for t, _x in placements if t in built)
    print('placements resolving to a built mesh: %d of %d' % (placed, len(placements)))
    return built, placements


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/dust2/dust2.usdc',
         sys.argv[2] if len(sys.argv) > 2 else '/tmp/dust2/refs/tires.meshset',
         sys.argv[3] if len(sys.argv) > 3 else '/tmp/dust2/prop_out')
