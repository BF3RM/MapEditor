#!/usr/bin/env python3
"""Build a BF3 MeshSet for an OBJ, as its own object, with one subset per material.

This replaces obj_to_meshset.py, which parsed an existing mesh and overwrote its fields. That was a
probe -- it answered "will the engine load bytes we wrote" (it will) -- but it made dust2 into a
loading pallet: MP_001 places that pallet TEN times, at whatever angle each one happens to lean, so
the map drew ten times, tipped, and every surface inherited the pallet's single material because a
MeshVariationDatabase entry binds materials BY NAME.

Here the MeshSet is constructed. One subset per OBJ material group, each carrying its own material
name, so a MVDB entry can bind a texture per material instead of one for the whole map.

The vertex DECLARATION is still read from a shipped mesh, and that is deliberate: it describes the
element layout the engine expects (usage/format/offset per stream), which is a format fact, not
someone else's object. Nothing else is taken -- not the blueprint, not the placements, not the
materials.

    obj_to_dust2_meshset.py <in.obj> <format-reference.meshset> <out.meshset> <out.chunk> [tx,ty,tz]
"""
import sys
import struct
import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from meshset import MeshSet, Subset                      # noqa: E402

# Source is Z-up right-handed; Frostbite is Y-up. A rotation (determinant +1), not an axis swap.
SRC_TO_BF3 = lambda v: np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)

MAX_VERTS_PER_SUBSET = 65535        # 16-bit indices


def load_obj_grouped(path):
    """Positions, uvs, and triangles grouped by material name, in file order."""
    pos, uv = [], []
    groups, current = [], None

    for line in open(path, 'r', errors='ignore'):
        if line.startswith('v '):
            pos.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            uv.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('usemtl'):
            name = line.split(None, 1)[1].strip() if len(line.split(None, 1)) > 1 else 'default'
            current = (name, [])
            groups.append(current)
        elif line.startswith('f '):
            if current is None:
                current = ('default', [])
                groups.append(current)

            idx = []

            for tok in line.split()[1:]:
                p = tok.split('/')
                vi = int(p[0]) - 1
                ti = int(p[1]) - 1 if len(p) > 1 and p[1] else -1
                idx.append((vi, ti))

            for k in range(1, len(idx) - 1):          # fan-triangulate
                current[1].append((idx[0], idx[k], idx[k + 1]))

    merged = {}

    for name, tris in groups:
        merged.setdefault(name, []).extend(tris)

    return (np.array(pos, np.float64),
            np.array(uv, np.float64) if uv else np.zeros((1, 2)),
            merged)


def build(obj_path, reference, out_resource, out_chunk, translate=(0, 0, 0)):
    pos, uv, groups = load_obj_grouped(obj_path)
    pos = SRC_TO_BF3(pos) + np.asarray(translate, np.float64)

    ref = MeshSet.parse(open(reference, 'rb').read())
    template = ref.lods[0].subsets[0]
    stride = template.vertex_stride

    ms = MeshSet()
    ms.mesh_type = ref.mesh_type
    ms.flags = ref.flags
    ms.name = 'levels/dust2/dust2_mesh'
    ms.short_name = 'dust2_mesh'
    ms.name_hash = ref.name_hash

    lod = type(ref.lods[0])()
    lod.type = ref.lods[0].type
    lod.category_present = list(ref.lods[0].category_present)

    vblocks, iblocks = [], []
    vbase = ibase = 0
    lo = np.array([1e30] * 3)
    hi = np.array([-1e30] * 3)

    for name, tris in groups.items():
        if not tris:
            continue

        n = len(tris) * 3

        if n > MAX_VERTS_PER_SUBSET:
            raise SystemExit('material %r needs %d vertices; 16-bit indices cap a subset at %d'
                             % (name, n, MAX_VERTS_PER_SUBSET))

        P = np.empty((n, 3), np.float32)
        T = np.empty((n, 2), np.float32)

        # Winding reversed: Source and Frostbite disagree on which order faces front. Left alone,
        # every surface is backfacing and a floor is only visible from underneath it.
        for i, tri in enumerate(tris):
            for k, (vi, ti) in enumerate((tri[0], tri[2], tri[1])):
                P[i * 3 + k] = pos[vi]
                T[i * 3 + k] = uv[ti] if 0 <= ti < len(uv) else (0.0, 0.0)

        lo = np.minimum(lo, P.min(axis=0))
        hi = np.maximum(hi, P.max(axis=0))

        e1, e2 = P[1::3] - P[0::3], P[2::3] - P[0::3]
        fn = np.cross(e1, e2)
        ln = np.linalg.norm(fn, axis=1, keepdims=True)
        N = np.repeat(np.divide(fn, np.where(ln == 0, 1, ln)), 3, axis=0).astype(np.float32)

        s = Subset()
        s.material_name = name
        s.material_index = len(lod.subsets)
        s.primitive_count = len(tris)
        s.start_index = ibase
        s.vertex_offset = vbase
        s.vertex_count = n
        s.vertex_stride = stride
        s.primitive_type = template.primitive_type
        s.geom_decl = template.geom_decl
        s.texcoord_ratios = list(template.texcoord_ratios)
        lod.subsets.append(s)

        vb = np.zeros((n, stride), np.uint8)
        vb[:, 0:12] = P.view(np.uint8).reshape(n, 12)

        if stride >= 20:
            vb[:, 12:20] = np.zeros((n, 8), np.uint8)

        vblocks.append(vb.tobytes())
        iblocks.append(np.arange(vbase, vbase + n, dtype='<u2').tobytes())
        vbase += n
        ibase += n

    lod.subsets and None
    ms.total_subset_count = len(lod.subsets)
    ms.lods = [lod]
    ms.bbox_min = tuple(float(x) for x in lo)
    ms.bbox_max = tuple(float(x) for x in hi)

    payload, meta = ms.serialize()
    open(out_resource, 'wb').write(payload)
    chunk = b''.join(vblocks) + b''.join(iblocks)
    open(out_chunk, 'wb').write(chunk)

    print('subsets   %d (one per material)' % len(lod.subsets))
    print('triangles %d  vertices %d' % (ibase // 3, vbase))
    print('bbox m    min %s  max %s' % (np.round(lo, 2), np.round(hi, 2)))
    print('resource  %d bytes' % len(payload))
    print('chunk     %d bytes' % len(chunk))
    print('META_HEX  %s' % (meta.hex().upper() if isinstance(meta, (bytes, bytearray)) else meta))


if __name__ == '__main__':
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(2)

    build(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4],
          translate=tuple(float(x) for x in sys.argv[5].split(',')) if len(sys.argv) > 5 else (0, 0, 0))
