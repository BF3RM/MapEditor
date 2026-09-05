#!/usr/bin/env python3
"""hkpConvexVerticesShape's field offsets, and the vertex packing it expects.

The offsets below are MEASURED, off levels/xp5_001/objects/fencesloped_xp5_physics_0 -- found by
enumerating all 7617 HavokPhysicsData resources in the game and dumping a sample. They obey the
rules the earlier files proved:

  * hkpConvexShape base occupies [0, 32) at 32-bit and [0, 48) at 64-bit, radius at +16 / +32.
    Two unrelated classes (hkpBoxShape, hkpConvexTranslateShape) agree on that, so it is solid.
  * hkArray is {pointer, int size, int capacity|0x80000000} -- pointer + 8 bytes wide.
  * hkVector4 members are 16-byte aligned.

Member order is Havok 2010.2's:

    hkVector4 m_aabbHalfExtents;
    hkVector4 m_aabbCenter;
    hkArray<hkFourTransposedPoints> m_rotatedVertices;
    int m_numVertices;
    hkArray<hkVector4> m_planeEquations;
    const hkpConvexVerticesConnectivity* m_connectivity;

Note there is no m_useSpuBuffer slot: m_numVertices at +76 is followed immediately by the plane
array at +80. Deriving the layout from the SDK's documented member list put a 4-byte bool there and
pushed every field after it out by four -- which the 64-bit layout absorbed into its alignment and
the 32-bit one did not. That is the whole reason this was measured rather than reasoned.

m_connectivity is never null in shipped data, so it is emitted: per-face vertex indices, and a
count per face.
"""

LAYOUT = {
    4: dict(size=96, half=32, centre=48, rot=64, num=76, planes=80, conn=92),
    8: dict(size=128, half=48, centre=64, rot=80, num=96, planes=104, conn=120),
}

# hkpConvexVerticesConnectivity: two arrays, payload inline after the struct.
CONN = {
    4: dict(size=32, idx=8, faces=20),
    8: dict(size=48, idx=16, faces=32),
}

# hkFourTransposedPoints holds four points as three vectors: all x, all y, all z. The SIMD layout
# is why vertices are padded out to a multiple of four rather than stored as a plain list.
FOUR_POINTS = 48


def transposed(verts):
    """Pack vertices into hkFourTransposedPoints blocks, padding with the last real vertex."""
    out = []
    pts = list(verts)

    while len(pts) % 4:
        pts.append(pts[-1])

    for i in range(0, len(pts), 4):
        block = pts[i:i + 4]
        out.append([p[0] for p in block] + [p[1] for p in block] + [p[2] for p in block])

    return out


def plane_equations(planes, radius=0.0):
    """Source stores n.p = d; Havok wants n.p + w = 0, so w is -d.

    Havok's planes describe the shape AFTER the convex radius inflates it, so the surface sits a
    radius further out than the vertices do -- shipped data shows exactly that offset.
    """
    return [(n[0], n[1], n[2], -(n[3] + radius)) for n in planes]


def bounds(verts):
    lo = [min(v[i] for v in verts) for i in range(3)]
    hi = [max(v[i] for v in verts) for i in range(3)]
    centre = [(l + h) / 2 for l, h in zip(lo, hi)]
    half = [(h - l) / 2 for l, h in zip(lo, hi)]
    return half, centre


def faces(verts, planes, eps=1e-3):
    """(vertex indices per face, indices of the planes that are real faces).

    Source adds BEVEL planes to brushes -- extra half-spaces that clip nothing, there to keep
    swept collision from catching on edges. They touch the hull along an edge or a single point,
    so they are not faces and must not appear in m_planeEquations, which shipped data has exactly
    one entry of per face.
    """
    import math

    out, kept = [], []

    for pi, (nx, ny, nz, _d) in enumerate(planes):
        # Which vertices lie on this face is asked as "which are furthest along the normal", so it
        # does not matter whether the caller's plane distance includes the convex radius or not.
        dots = [v[0] * nx + v[1] * ny + v[2] * nz for v in verts]
        support = max(dots)
        on = [i for i, t in enumerate(dots) if support - t < eps]

        if len(on) < 3:
            continue                         # a bevel plane, not a face

        cx = [sum(verts[i][k] for i in on) / len(on) for k in range(3)]
        ux = [verts[on[0]][k] - cx[k] for k in range(3)]
        un = math.sqrt(sum(c * c for c in ux)) or 1.0
        ux = [c / un for c in ux]
        vx = [ny * ux[2] - nz * ux[1], nz * ux[0] - nx * ux[2], nx * ux[1] - ny * ux[0]]

        def angle(i):
            r = [verts[i][k] - cx[k] for k in range(3)]
            return math.atan2(sum(r[k] * vx[k] for k in range(3)),
                              sum(r[k] * ux[k] for k in range(3)))

        # Rotate each face to start at its lowest vertex index. The winding is what matters, not
        # where it begins, and pinning the start makes the same hull produce the same bytes whether
        # it arrived as float64 from a BSP or float32 through USD.
        ring = sorted(on, key=angle)
        start = ring.index(min(ring))
        out.append(ring[start:] + ring[:start])
        kept.append(pi)

    return out, kept
