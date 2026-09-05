#!/usr/bin/env python3
"""Read a Source .phy: the convex hulls a prop collides with.

Source keeps physics in Ipion/IVP form, not as the render mesh. A .phy is a small header, then one
"solid" per collision body, each a compact surface holding a tree of LEDGES -- and a ledge is a
convex hull: a point cloud plus the triangles over it.

Only the points are needed here. hkpConvexVerticesShape wants a hull's vertices and its face
planes, and the planes come back out of the triangles, so a ledge maps onto it almost directly.

IVP stores points in its own frame and in its own unit. Source's convention is
(x, y, z)_source = (x, -z, y)_ivp, and the unit is metres where the rest of the BSP is inches --
which is why a 64-unit crate reads as 0.81 either side rather than 32 of something.
"""
import struct

IVPS = b'IVPS'


def _walk(d, surface, tree_root):
    """Leaf ledges lie contiguously from the surface header to the ledge tree's root."""
    out = []
    pos = surface + 48

    while pos + 16 <= tree_root and len(out) < 8192:
        point_offset, _client, flags = struct.unpack_from('<iiI', d, pos)
        size = (flags >> 8) * 16
        n_tris = struct.unpack_from('<h', d, pos + 12)[0]

        if size <= 0 or pos + size > tree_root + 16:
            break

        # point_offset can reach past this ledge into a pool shared with its siblings, so it is
        # not bounded by the ledge's own size -- only that it points forwards.
        if point_offset > 0 and n_tris > 0:
            out.append((pos, point_offset, n_tris))

        pos += size

    return out


def hulls(path, with_faces=False):
    """-> one vertex list per convex hull, in Source units (inches).

    With with_faces, each hull is (vertices, triangles) instead -- the triangles are what a convex
    shape's plane equations come from, and they are already here: a ledge names three point indices
    per triangle.
    """
    d = open(path, 'rb').read()
    header_size, _id, solid_count, _checksum = struct.unpack_from('<4i', d, 0)
    pos = header_size
    out = []

    for _s in range(solid_count):
        if pos + 4 > len(d):
            break

        solid_size = struct.unpack_from('<i', d, pos)[0]
        body = pos + 4
        pos = body + solid_size

        # dummy[2] carries the tag, 44 bytes into the compact surface.
        mark = d.find(IVPS, body, min(pos, len(d)))

        if mark < 0:
            continue

        surface = mark - 44
        tree_root = surface + struct.unpack_from('<i', d, surface + 32)[0]

        for ledge, point_offset, n_tris in _walk(d, surface, tree_root):
            start = ledge + point_offset

            # The triangles name every vertex the hull uses, so they give the count even when the
            # points sit in a shared pool of unknown length.
            highest = -1

            for t in range(n_tris):
                to = ledge + 16 + t * 16

                if to + 16 > len(d):
                    break

                for e in range(3):
                    highest = max(highest,
                                  struct.unpack_from('<H', d, to + 4 + e * 4)[0])

            count = highest + 1
            tris = []

            for t in range(n_tris):
                to = ledge + 16 + t * 16

                if to + 16 > len(d):
                    break

                tris.append(tuple(struct.unpack_from('<H', d, to + 4 + e * 4)[0]
                                  for e in range(3)))

            verts = []

            for i in range(count):
                o = start + i * 16

                if o + 12 > len(d):
                    break

                x, y, z = struct.unpack_from('<3f', d, o)
                # IVP is metres and Y-up-ish; Source is inches with Z up.
                verts.append((x / 0.0254, -z / 0.0254, y / 0.0254))

            if len(verts) >= 4:
                out.append((verts, tris) if with_faces else verts)

    return out


if __name__ == '__main__':
    import glob
    import sys

    files = sys.argv[1:] or sorted(glob.glob('/tmp/dust2/models/*.phy'))[:8]

    for f in files:
        try:
            hs = hulls(f)
            name = f.rsplit('/', 1)[-1][:44]

            if not hs:
                print('%-46s no hulls' % name)
                continue

            xs = [v[0] for h in hs for v in h]
            ys = [v[1] for h in hs for v in h]
            zs = [v[2] for h in hs for v in h]
            print('%-46s %2d hulls %4d verts  extent %.1f x %.1f x %.1f units'
                  % (name, len(hs), sum(len(h) for h in hs),
                     max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))
        except Exception as ex:                                     # noqa: BLE001
            print('%-46s FAILED %s' % (f.rsplit('/', 1)[-1][:44], ex))


def planes(verts, tris, eps=1e-4):
    """Unique outward face planes of a hull, as n.p = d, from its triangles."""
    import math

    seen, out = [], []

    for a, b, c in tris:
        if max(a, b, c) >= len(verts):
            continue

        pa, pb, pc = verts[a], verts[b], verts[c]
        u = [pb[i] - pa[i] for i in range(3)]
        v = [pc[i] - pa[i] for i in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        ln = math.sqrt(sum(x * x for x in n))

        if ln < 1e-9:
            continue

        n = [x / ln for x in n]
        dist = sum(n[i] * pa[i] for i in range(3))

        # Triangles of one face share a plane; keep it once.
        if any(abs(dist - d0) < eps and all(abs(n[i] - m[i]) < eps for i in range(3))
               for m, d0 in seen):
            continue

        seen.append((n, dist))
        out.append((n[0], n[1], n[2], dist))

    return out
