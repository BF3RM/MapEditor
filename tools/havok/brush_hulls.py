#!/usr/bin/env python3
"""Turn Source BSP brushes into convex hulls: vertices and plane equations.

A brush is stored as a set of half-spaces, which is what a physics engine wants but not what it can
be handed directly -- hkpConvexVerticesShape needs the vertices too. Every vertex of a convex
polyhedron is the intersection of three of its planes, so the hull is recovered by solving each
triple and keeping the points that satisfy every other half-space.

That is O(n^3) in the plane count, which is fine: brushes have a handful of sides, and the
alternative (a general hull library) would need the vertices we are trying to find.
"""
import itertools
import struct

L_PLANES, L_BRUSHES, L_BRUSHSIDES = 1, 18, 19
CONTENTS_SOLID = 0x1
EPS = 1e-4
# Two planes that differ only in the last decimal produce a near-singular solve and a vertex far
# outside the brush; require a real corner.
DET_EPS = 1e-6
WELD = 1e-4


def lumps(path):
    blob = open(path, "rb").read()
    return [blob[o:o + n] for o, n, _v, _c in
            (struct.unpack_from("<4i", blob, 8 + i * 16) for i in range(64))]


def solve3(p, q, r):
    """The point where three planes meet, or None if they do not meet in one."""
    a, b, c = p[:3], q[:3], r[:3]
    det = (a[0] * (b[1] * c[2] - b[2] * c[1])
           - a[1] * (b[0] * c[2] - b[2] * c[0])
           + a[2] * (b[0] * c[1] - b[1] * c[0]))

    if abs(det) < DET_EPS:
        return None

    d = (p[3], q[3], r[3])
    cof = [
        [b[1] * c[2] - b[2] * c[1], a[2] * c[1] - a[1] * c[2], a[1] * b[2] - a[2] * b[1]],
        [b[2] * c[0] - b[0] * c[2], a[0] * c[2] - a[2] * c[0], a[2] * b[0] - a[0] * b[2]],
        [b[0] * c[1] - b[1] * c[0], a[1] * c[0] - a[0] * c[1], a[0] * b[1] - a[1] * b[0]],
    ]
    return tuple(sum(cof[i][k] * d[k] for k in range(3)) / det for i in range(3))


def hull(planes):
    """Vertices of the convex volume described by `planes` (normal x, y, z, dist)."""
    pts = []

    for p, q, r in itertools.combinations(planes, 3):
        v = solve3(p, q, r)

        if v is None:
            continue

        if any(v[0] * n[0] + v[1] * n[1] + v[2] * n[2] - n[3] > EPS for n in planes):
            continue                                   # outside some other half-space

        if not any(abs(v[0] - w[0]) < WELD and abs(v[1] - w[1]) < WELD
                   and abs(v[2] - w[2]) < WELD for w in pts):
            pts.append(v)

    return pts


def brushes(path, contents_mask=CONTENTS_SOLID):
    """Yield (planes, vertices) per solid brush, in Source units."""
    lump = lumps(path)
    planes = [struct.unpack_from("<4f", lump[L_PLANES], i * 20)
              for i in range(len(lump[L_PLANES]) // 20)]
    sides = [struct.unpack_from("<H", lump[L_BRUSHSIDES], i * 8)[0]
             for i in range(len(lump[L_BRUSHSIDES]) // 8)]

    for i in range(len(lump[L_BRUSHES]) // 12):
        first, count, contents = struct.unpack_from("<3i", lump[L_BRUSHES], i * 12)

        if not contents & contents_mask:
            continue

        pl = [planes[sides[s]] for s in range(first, first + count)]
        yield pl, hull(pl)


if __name__ == "__main__":
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dust2/de_dust2.bsp"
    n = bad = 0
    verts = []
    sides = []

    for pl, pts in brushes(path):
        n += 1
        sides.append(len(pl))

        if len(pts) < 4:
            bad += 1
            continue

        verts.append(len(pts))

    print("solid brushes      : %d" % n)
    print("hulls recovered    : %d  (%d degenerate)" % (len(verts), bad))
    print("vertices per hull  : min %d  max %d  mean %.1f"
          % (min(verts), max(verts), sum(verts) / len(verts)))
    print("planes per brush   : min %d  max %d  mean %.1f"
          % (min(sides), max(sides), sum(sides) / len(sides)))
    print("total vertices     : %d" % sum(verts))
