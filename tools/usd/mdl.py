#!/usr/bin/env python3
"""Read a Source model: geometry, materials and collision.

A Source model is three files that only make sense together.

  .mdl  the structure -- body parts, models, meshes -- plus the material names. It holds no
        geometry at all.
  .vvd  the vertices: position, normal, uv, bone weights. Ordered for the highest LOD, with a
        fixup table that says how to reorder them for the others.
  .vtx  the indices, as hardware-friendly strip groups. Its vertices are not the .vvd's: each
        carries an origMeshVertID that indexes its MESH's slice of the .vvd, so the .mdl's
        per-mesh vertexoffset is needed to resolve one to the other.

Getting that last part wrong is the classic failure: the model loads, the triangle count is right,
and the geometry is scrambled because every index is relative to the wrong base.
"""
import os
import struct

VVD_MAGIC = b'IDSV'
VTX_VERSION = 7
VERTEX_SIZE = 48                      # boneweights 16, position 12, normal 12, uv 8


def _cstr(buf, off):
    end = buf.find(b'\0', off)
    return buf[off:end].decode('latin1', 'replace') if end >= 0 else ''


def read_vvd(path, lod=0):
    """-> (positions, normals, uvs) for one LOD, fixups applied."""
    d = open(path, 'rb').read()

    if d[:4] != VVD_MAGIC:
        raise ValueError('%s is not a VVD' % path)

    _ver, _checksum, num_lods = struct.unpack_from('<3i', d, 4)
    lod_counts = struct.unpack_from('<8i', d, 16)
    num_fixups, fixup_start, vertex_start, _tangent_start = struct.unpack_from('<4i', d, 48)

    total = lod_counts[0]
    pos, nrm, uv = [], [], []

    def vert(i):
        o = vertex_start + i * VERTEX_SIZE
        return (struct.unpack_from('<3f', d, o + 16),
                struct.unpack_from('<3f', d, o + 28),
                struct.unpack_from('<2f', d, o + 40))

    if num_fixups == 0:
        order = range(min(total, lod_counts[lod] if lod < num_lods else total))
    else:
        # Fixups rebuild the vertex order for a given LOD: each names a run of source vertices
        # that belongs to LODs at least as detailed as its own.
        order = []

        for f in range(num_fixups):
            f_lod, src, n = struct.unpack_from('<3i', d, fixup_start + f * 12)

            if f_lod >= lod:
                order.extend(range(src, src + n))

    for i in order:
        p, n, t = vert(i)
        pos.append(p)
        nrm.append(n)
        uv.append(t)

    return pos, nrm, uv


def read_mdl(path):
    """-> (materials, search paths, [(mesh material index, vertex offset, vertex count)])."""
    d = open(path, 'rb').read()
    num_textures, texture_index = struct.unpack_from('<2i', d, 204)
    num_cd, cd_index = struct.unpack_from('<2i', d, 212)
    num_bodyparts, bodypart_index = struct.unpack_from('<2i', d, 232)

    materials = []

    for i in range(num_textures):
        o = texture_index + i * 64
        materials.append(_cstr(d, o + struct.unpack_from('<i', d, o)[0]))

    paths = []

    for i in range(num_cd):
        o = struct.unpack_from('<i', d, cd_index + i * 4)[0]
        paths.append(_cstr(d, o))

    meshes = []

    for b in range(num_bodyparts):
        bo = bodypart_index + b * 16
        _name, num_models, _base, model_index = struct.unpack_from('<4i', d, bo)

        for m in range(num_models):
            mo = bo + model_index + m * 148
            num_meshes, mesh_index = struct.unpack_from('<2i', d, mo + 72)

            for k in range(num_meshes):
                ko = mo + mesh_index + k * 116
                material, _modelindex, num_verts, vertex_offset = struct.unpack_from('<4i', d, ko)
                meshes.append((material, vertex_offset, num_verts))

    return materials, paths, meshes


def read_vtx(path, lod=0):
    """-> [[(a, b, c), ...], ...] one triangle list per mesh, indices relative to that mesh."""
    d = open(path, 'rb').read()
    version = struct.unpack_from('<i', d, 0)[0]

    if version != VTX_VERSION:
        raise ValueError('%s is VTX version %d, expected %d' % (path, version, VTX_VERSION))

    num_bodyparts, bodypart_offset = struct.unpack_from('<2i', d, 28)
    out = []

    for b in range(num_bodyparts):
        bo = bodypart_offset + b * 8
        num_models, model_offset = struct.unpack_from('<2i', d, bo)

        for m in range(num_models):
            mo = bo + model_offset + m * 8
            num_lods, lod_offset = struct.unpack_from('<2i', d, mo)

            if lod >= num_lods:
                continue

            lo = mo + lod_offset + lod * 12
            num_meshes, mesh_offset = struct.unpack_from('<2i', d, lo)

            for k in range(num_meshes):
                ko = lo + mesh_offset + k * 9
                num_groups, group_offset = struct.unpack_from('<2i', d, ko)
                tris = []

                for g in range(num_groups):
                    go = ko + group_offset + g * 25
                    n_verts, vert_off, n_idx, idx_off, n_strips, strip_off = \
                        struct.unpack_from('<6i', d, go)

                    # Each strip-group vertex points back at its mesh's own vertex range.
                    orig = [struct.unpack_from('<H', d, go + vert_off + v * 9 + 4)[0]
                            for v in range(n_verts)]
                    idx = [struct.unpack_from('<H', d, go + idx_off + i * 2)[0]
                           for i in range(n_idx)]

                    for s in range(n_strips):
                        so = go + strip_off + s * 27
                        s_idx, s_idx_off, _s_v, _s_vo, _nb, flags = \
                            struct.unpack_from('<iiiihB', d, so)

                        if flags & 0x02:                     # tri strip
                            for i in range(s_idx - 2):
                                a, bb, c = (idx[s_idx_off + i], idx[s_idx_off + i + 1],
                                            idx[s_idx_off + i + 2])

                                if i % 2:
                                    a, bb = bb, a

                                if a != bb and bb != c and a != c:
                                    tris.append((orig[a], orig[bb], orig[c]))
                        else:                                 # tri list
                            for i in range(0, s_idx - 2, 3):
                                tris.append((orig[idx[s_idx_off + i]],
                                             orig[idx[s_idx_off + i + 1]],
                                             orig[idx[s_idx_off + i + 2]]))

                out.append(tris)

    return out


def load(base, lod=0):
    """base: path without extension. -> (positions, uvs, {material: [triangles]})."""
    pos, _nrm, uv = read_vvd(base + '.vvd', lod)
    materials, _paths, meshes = read_mdl(base + '.mdl')
    per_mesh = read_vtx(base + '.dx90.vtx', lod)
    groups = {}

    for i, tris in enumerate(per_mesh):
        if i >= len(meshes):
            break

        mat_index, vertex_offset, _n = meshes[i]
        name = materials[mat_index] if mat_index < len(materials) else 'material_%d' % mat_index
        out = groups.setdefault(name, [])

        for a, b, c in tris:
            # origMeshVertID is relative to the mesh, so lift it into the model's vertex array.
            out.append(tuple((vertex_offset + v, vertex_offset + v) for v in (a, b, c)))

    return pos, uv, groups


if __name__ == '__main__':
    import sys
    import glob

    bases = sys.argv[1:] or sorted({p.rsplit('.', 1)[0].replace('.dx90', '')
                                    for p in glob.glob('/tmp/dust2/models/*.mdl')})[:6]

    for b in bases:
        b = b[:-4] if b.endswith('.mdl') else b

        try:
            pos, uv, groups = load(b)
            print('%-46s %5d verts  %5d tris  %d materials: %s'
                  % (os.path.basename(b), len(pos), sum(len(v) for v in groups.values()),
                     len(groups), list(groups)[:3]))
        except Exception as ex:                                     # noqa: BLE001
            print('%-46s FAILED %s' % (os.path.basename(b), ex))
