#!/usr/bin/env python3
"""de_dust2's info_overlay decals, as geometry.

An overlay is a textured quad pinned just off a wall or floor -- the map's signs, arrows, scorch
marks and grime. Source stores it as an origin, a surface normal and four 2D points, and the two
world directions those points are measured along are NOT in the overlay: they come from the
texinfo's texture vectors, which is what makes the quad reconstructable at all.

Nothing here is BF3-specific: the output is positions/UVs/material name, the same shape the mesh
builder already takes for a material group, so a decal costs one more subset and no new machinery.

Placing them needs the map's own transform, not an equivalent-looking one: the points come out in
BSP space (Source inches) and the render mesh has been moved out of it by inches-to-metres,
(x, z, -y), and a centring translation. build_props derives that translation from the map's OWN
vertices and checks it against all 12091 of them -- max residual 4e-06 -- rather than reconstructing
it by hand, which is how a decal ends up a few centimetres inside a wall.

Seven of the 55 belong to the 3D skybox and sit far outside the playable map; they are dropped so
they do not stretch the mesh's bounds. The other 48 build and load.

Materials: 24 distinct, of which 18 exist. The six absent ones -- bills02a/04a/05a,
decalrug004a/005a, trashdecal01a -- are in neither the CS:S archive nor the BSP's own pakfile
(which carries only this map's cubemaps and tilefloor patches). They are referenced by a map whose
content set no longer ships them, so 18 of 24 is the ceiling from these sources, not a gap here.
"""
import struct

OVERLAY_SIZE = 352
TEXINFO_SIZE = 72


def _lump(blob, index):
    off, length, _ver, _ = struct.unpack_from('<4i', blob, 8 + index * 16)
    return blob[off:off + length]


def _texinfo(blob):
    """(u axis, v axis, texdata index, u offset, v offset) per texinfo.

    The axes are the overlay's basis, and each carries its own scale -- a texture vector is not a
    unit direction, its length IS the texel density. Normalising it throws that away.
    """
    raw = _lump(blob, 6)
    out = []

    for i in range(len(raw) // TEXINFO_SIZE):
        f = struct.unpack_from('<16f', raw, i * TEXINFO_SIZE)
        _flags, texdata = struct.unpack_from('<2i', raw, i * TEXINFO_SIZE + 64)
        out.append((f[0:3], f[4:7], texdata, f[3], f[7]))

    return out


def _texnames(blob):
    """texdata index -> material name, via the string table."""
    texdata = _lump(blob, 2)
    offsets = _lump(blob, 44)
    strings = _lump(blob, 43)
    names = []

    for i in range(len(offsets) // 4):
        at = struct.unpack_from('<i', offsets, i * 4)[0]
        end = strings.find(b'\0', at)
        names.append(strings[at:end].decode('latin1'))

    out = []

    for i in range(len(texdata) // 32):
        idx = struct.unpack_from('<i', texdata, i * 32 + 12)[0]
        out.append(names[idx] if 0 <= idx < len(names) else '')

    return out


def _norm(v):
    length = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5
    return (v[0] / length, v[1] / length, v[2] / length) if length else (0.0, 0.0, 0.0)


def _faces(blob):
    """faces -> polygon of world points, via surfedges and edges."""
    verts = struct.unpack('<%df' % (len(_lump(blob, 3)) // 4), _lump(blob, 3))
    edges = struct.unpack('<%dH' % (len(_lump(blob, 12)) // 2), _lump(blob, 12))
    surfed = struct.unpack('<%di' % (len(_lump(blob, 13)) // 4), _lump(blob, 13))
    raw = _lump(blob, 7)
    out = []

    for i in range(len(raw) // 56):
        first, n = struct.unpack_from('<iH', raw, i * 56 + 4)
        ti = struct.unpack_from('<h', raw, i * 56 + 10)[0]
        poly = []

        for k in range(n):
            se = surfed[first + k]
            e = abs(se) * 2
            vi = edges[e] if se >= 0 else edges[e + 1]
            poly.append((verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]))

        out.append((poly, ti))

    return out


def load_painted(bsp_path, lift=0.5):
    """The overlays whose UV quad is DEGENERATE, as the faces they are painted onto.

    Not every overlay is a quad. dust2's thirteen brickroad01 road surfaces name a texinfo whose
    texture axes are ZERO, so there is no basis to measure their UV points along and the quad
    collapses to a point -- which is why the road markings went missing while the signs and arrows
    came through. Their geometry is the set of BSP faces they name instead.

    Their UVs cannot come from that texinfo either, so they are projected onto a basis built from
    the surface normal. That tiles the road texture across the surface at the right scale without
    claiming to reproduce Source's own alignment, which is not recoverable from this lump.

    -> [(material name, [world points], [uvs], [triangle index triples])], fan-triangulated.
    """
    blob = open(bsp_path, 'rb').read()
    raw = _lump(blob, 45)
    infos = _texinfo(blob)
    names = _texnames(blob)
    faces = _faces(blob)
    out = []

    for i in range(len(raw) // OVERLAY_SIZE):
        b = raw[i * OVERLAY_SIZE:(i + 1) * OVERLAY_SIZE]
        _id, ti, cnt = struct.unpack_from('<ihH', b, 0)
        pts = struct.unpack_from('<12f', b, 280)
        normal = struct.unpack_from('<3f', b, 340)

        if not 0 <= ti < len(infos):
            continue

        u_axis, v_axis, texdata = infos[ti][:3]

        if any(abs(c) > 1e-9 for c in u_axis) or any(abs(c) > 1e-9 for c in v_axis):
            continue                                    # has a basis; load() handles it as a quad

        n = _norm(normal)
        name = names[texdata] if 0 <= texdata < len(names) else ''
        face_ids = struct.unpack_from('<64i', b, 8)[:cnt & 0x3FFF]
        points, uvs, tris = [], [], []

        for fid in face_ids:
            if not 0 <= fid < len(faces):
                continue

            poly, fti = faces[fid]
            base = len(points)

            # The overlay's own texinfo has no axes, but the FACE it is painted on does -- so the
            # decal is laid out on that surface's own texture grid. That is both recoverable and
            # what aligns it with the wall or floor it sits on, where an arbitrary tangent would
            # rotate every decal by an unrelated amount.
            fu, fv, _ftd, fu_off, fv_off = infos[fti] if 0 <= fti < len(infos) else \
                (u_axis, v_axis, 0, 0.0, 0.0)
            width = height = 512.0

            for p in poly:
                points.append(tuple(p[k] + n[k] * lift for k in range(3)))
                uvs.append(((sum(fu[k] * p[k] for k in range(3)) + fu_off) / width,
                            (sum(fv[k] * p[k] for k in range(3)) + fv_off) / height))

            for k in range(1, len(poly) - 1):
                tris.append((base, base + k, base + k + 1))

        if name and tris:
            out.append((name, points, uvs, tris))

    return out


def load(bsp_path, lift=0.5):
    """-> [(material name, [4 world points], [4 uvs])].

    `lift` nudges the quad along its normal so it does not z-fight the surface it sits on. Half an
    inch in Source units, which is what the engine's own decal offset works out to.
    """
    blob = open(bsp_path, 'rb').read()
    raw = _lump(blob, 45)
    infos = _texinfo(blob)
    names = _texnames(blob)
    out = []

    for i in range(len(raw) // OVERLAY_SIZE):
        b = raw[i * OVERLAY_SIZE:(i + 1) * OVERLAY_SIZE]
        _id, ti, _cnt = struct.unpack_from('<ihH', b, 0)
        u0, u1, v0, v1 = struct.unpack_from('<4f', b, 264)
        pts = struct.unpack_from('<12f', b, 280)
        origin = struct.unpack_from('<3f', b, 328)
        normal = struct.unpack_from('<3f', b, 340)

        if not 0 <= ti < len(infos):
            continue

        u_axis, v_axis, texdata = infos[ti][:3]
        u_dir, v_dir = _norm(u_axis), _norm(v_axis)
        n = _norm(normal)
        corners, uvs = [], []

        # The four points are 2D, measured along the texture axes from the overlay's origin.
        for c in range(4):
            px, py = pts[c * 3], pts[c * 3 + 1]
            corners.append(tuple(origin[k] + u_dir[k] * px + v_dir[k] * py + n[k] * lift
                                 for k in range(3)))

        # Corner order is bottom-left, top-left, top-right, bottom-right.
        for su, sv in ((u0, v0), (u0, v1), (u1, v1), (u1, v0)):
            uvs.append((su, sv))

        name = names[texdata] if 0 <= texdata < len(names) else ''

        if name:
            out.append((name, corners, uvs))

    return out


if __name__ == '__main__':
    import sys
    decals = load(sys.argv[1] if len(sys.argv) > 1 else '/tmp/dust2/de_dust2.bsp')
    print('%d decals' % len(decals))
    mats = {}

    for name, corners, _uv in decals:
        mats[name] = mats.get(name, 0) + 1

    for name, n in sorted(mats.items(), key=lambda kv: -kv[1])[:12]:
        print('  %3d x %s' % (n, name))
