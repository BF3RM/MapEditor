#!/usr/bin/env python3
"""Build a BF3 MeshSet from an OBJ, by borrowing a stock mesh's shape.

Authoring a MeshSet from nothing also needs a MeshAsset EBX partition and a
MeshVariationDatabase entry, or the mesh binds no material and renders invisible.
Synthesising an MVDB entry is still unbuilt, so this takes the cheap route: keep
a stock mesh's EBX, its MVDB entry and its blueprint, and swap only the geometry.

That constrains the output, and the constraints are the interesting part:
  * the vertex declaration must stay byte-identical to the donor's, because the
    donor's compiled shader reads it. Position is Half3, so coordinates quantise
    to about 6 cm at dust2's 68 m extent.
  * subset material names must match the donor's, or the MVDB entry binds nothing.
  * 16-bit indices cap a subset at 65535 vertices.

Axes: Source is Z-up right-handed, BF3 is Y-up. (x, y, z) -> (x, z, -y).
"""
import sys
import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from meshset import MeshSet          # noqa: E402
import struct                        # noqa: E402

SRC_TO_BF3 = lambda v: np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)


def load_obj(path):
    pos, uv, tris = [], [], []
    for line in open(path, 'r', errors='ignore'):
        if line.startswith('v '):
            pos.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            uv.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            idx = []
            for tok in line.split()[1:]:
                p = tok.split('/')
                vi = int(p[0]) - 1
                ti = int(p[1]) - 1 if len(p) > 1 and p[1] else -1
                idx.append((vi, ti))
            for k in range(1, len(idx) - 1):          # fan-triangulate
                tris.append((idx[0], idx[k], idx[k + 1]))
    return (np.array(pos, np.float64),
            np.array(uv, np.float64) if uv else np.zeros((1, 2)),
            tris)


def build(obj_path, donor_resource, out_resource, out_chunk, translate=(0, 0, 0)):
    pos, uv, tris = load_obj(obj_path)
    pos = SRC_TO_BF3(pos) + np.asarray(translate, np.float64)

    n = len(tris) * 3
    if n > 65535:
        raise SystemExit('%d vertices exceeds the 16-bit index limit' % n)

    P = np.empty((n, 3), np.float32)
    T = np.empty((n, 2), np.float32)
    # Reverse each triangle's winding.
    #
    # SRC_TO_BF3 is a rotation (determinant +1), so it does NOT flip winding -- the flip is a
    # CONVENTION difference: Source treats one face order as front, Frostbite the other. Left
    # as-is, every surface is backfacing, and a floor is then only visible from beneath it, which
    # is exactly how dust2 first rendered in game. The normals below are computed AFTER this, so
    # they follow the corrected winding rather than pointing into the ground.
    for i, tri in enumerate(tris):
        for k, (vi, ti) in enumerate((tri[0], tri[2], tri[1])):
            P[i * 3 + k] = pos[vi]
            T[i * 3 + k] = uv[ti] if 0 <= ti < len(uv) else (0.0, 0.0)

    # Flat normals per triangle; enough to light the surface correctly.
    e1 = P[1::3] - P[0::3]
    e2 = P[2::3] - P[0::3]
    fn = np.cross(e1, e2)
    ln = np.linalg.norm(fn, axis=1, keepdims=True)
    fn = np.divide(fn, np.where(ln == 0, 1, ln))
    N = np.repeat(fn, 3, axis=0).astype(np.float32)

    ms = MeshSet.parse(open(donor_resource, 'rb').read())
    lod = ms.lods[0]
    opaque, zonly = lod.subsets[0], lod.subsets[1]

    vbytes_o = opaque.vertex_stride * n
    vbytes_z = zonly.vertex_stride * n
    idx = np.arange(n, dtype='<u2')

    # Pack straight into the donor's declared element slots.
    vo = np.zeros((n, opaque.vertex_stride), np.uint8)
    for e in opaque.geom_decl.elements[:opaque.geom_decl.element_count]:
        if e.usage == 1:                                     # Pos, Half3
            vo[:, e.offset:e.offset + 6] = P.astype('<f2').view(np.uint8)
        elif e.usage == 6:                                   # Normal, Half4
            v4 = np.hstack([N, np.zeros((n, 1), np.float32)])
            vo[:, e.offset:e.offset + 8] = v4.astype('<f2').view(np.uint8)
        elif e.usage == 7:                                   # Tangent, Half4
            t = np.cross(N, np.array([0, 1, 0], np.float32))
            tl = np.linalg.norm(t, axis=1, keepdims=True)
            t = np.divide(t, np.where(tl == 0, 1, tl)).astype(np.float32)
            v4 = np.hstack([t, np.ones((n, 1), np.float32)])
            vo[:, e.offset:e.offset + 8] = v4.astype('<f2').view(np.uint8)
        elif e.usage == 33:                                  # TexCoord0, Half2
            vo[:, e.offset:e.offset + 4] = T.astype('<f2').view(np.uint8)
        elif e.usage == 9:                                   # BinormalSign, Half
            vo[:, e.offset:e.offset + 2] = np.ones((n, 1), np.float32).astype('<f2').view(np.uint8)

    vz = np.zeros((n, zonly.vertex_stride), np.uint8)
    P4 = np.hstack([P, np.ones((n, 1), np.float32)])
    vz[:, 0:8] = P4.astype('<f2').view(np.uint8)

    # DROP the ZOnly subset. Two subsets sharing one index block is the only thing
    # here that the donor mesh cannot disambiguate: if Frostbite reads StartIndex as
    # absolute into the LOD's whole vertex block rather than relative to VertexOffset,
    # subset 1 addresses vertices that do not exist. One subset cannot be ambiguous.
    lod.subsets = [opaque]
    lod.category_indices = [[0], [], [], []]

    # Both subsets keep their own vertex block, then one shared index block.
    opaque.vertex_offset, opaque.vertex_count = 0, n
    opaque.primitive_count, opaque.start_index = len(tris), 0
    lod.vertex_data_size = vbytes_o
    lod.index_data_size = len(tris) * 3 * 2
    chunk = (vo.tobytes() + idx.tobytes())
    pad = (-len(chunk)) % 16
    chunk += b'\0' * pad

    lo, hi = P.min(0), P.max(0)
    ms.bbox_min, ms.bbox_max = tuple(map(float, lo)), tuple(map(float, hi))

    # Keep the donor's LOD COUNT. Dropping its second LOD hung the client on level
    # load -- the MeshAsset EBX still declares two, and the mismatch is not survivable.
    # Give every LOD the same dust2 geometry instead; each keeps its own chunk id.
    import copy as _copy
    for i in range(1, len(ms.lods)):
        keep_chunk = ms.lods[i].data_chunk_id
        keep_name = (ms.lods[i].name, ms.lods[i].short_name, ms.lods[i].shader_debug_name,
                     ms.lods[i].name_hash, ms.lods[i].flags)
        ms.lods[i] = _copy.deepcopy(lod)
        ms.lods[i].data_chunk_id = keep_chunk
        (ms.lods[i].name, ms.lods[i].short_name, ms.lods[i].shader_debug_name,
         ms.lods[i].name_hash, ms.lods[i].flags) = keep_name
    ms.total_subset_count = len(ms.lods)

    payload, meta = ms.serialize()
    open(out_resource, 'wb').write(payload)
    open(out_chunk, 'wb').write(chunk)
    print('triangles %d  vertices %d' % (len(tris), n))
    print('bbox m    min %s  max %s' % (np.round(lo, 2), np.round(hi, 2)))
    print('extent m  %s' % np.round(hi - lo, 2))
    print('resource  %d bytes  meta %s' % (len(payload), struct.unpack('<IIII', meta)))
    print('chunk     %d bytes (v %d + i %d + pad %d)' % (len(chunk), lod.vertex_data_size,
                                                         lod.index_data_size, pad))
    print('META_HEX  %s' % meta.hex().upper())
    return meta


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4],
          translate=tuple(float(x) for x in sys.argv[5].split(',')) if len(sys.argv) > 5 else (0, 0, 0))
