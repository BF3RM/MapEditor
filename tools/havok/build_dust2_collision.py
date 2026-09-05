#!/usr/bin/env python3
"""dust2's collision, generated from the BSP's own brushes.

Source stores world collision as convex BRUSHES -- a set of half-space planes -- which is exactly
what a physics engine wants, and nothing like the triangle soup the renderer draws. So collision
comes from lump 18/19, not from the mesh: the same authority the game itself uses.

A brush whose planes are all axis-aligned IS its own bounding box, and hkpBoxShape represents it
without losing anything. Brushes with slanted planes need hkpConvexVerticesShape; this reports how
many there are rather than quietly boxing them.

Geometry is put through the same transform as the render mesh (tools/usd/build_dust2.py): Source
units to metres, Z-up to Y-up, then centred on X/Z with the floor at Y=0 -- otherwise the collision
would be somewhere the map is not.
"""
import struct
import sys

import build_collision

INCH = 0.0254
L_PLANES, L_BRUSHES, L_BRUSHSIDES = 1, 18, 19
CONTENTS_SOLID = 0x1
AXIS_EPS = 1e-4
# A brush thinner than this in some axis is a face-hugging sliver Source uses for texturing; giving
# it a shape only costs broadphase pairs.
MIN_EXTENT = 0.002


def lumps(path):
    blob = open(path, "rb").read()
    out = []

    for i in range(64):
        ofs, ln, _ver, _cc = struct.unpack_from("<4i", blob, 8 + i * 16)
        out.append(blob[ofs:ofs + ln])

    return out


def brush_boxes(path):
    lump = lumps(path)
    planes = [struct.unpack_from("<4f", lump[L_PLANES], i * 20)
              for i in range(len(lump[L_PLANES]) // 20)]
    sides = [struct.unpack_from("<H", lump[L_BRUSHSIDES], i * 8)[0]
             for i in range(len(lump[L_BRUSHSIDES]) // 8)]

    boxed, slanted = [], 0

    for i in range(len(lump[L_BRUSHES]) // 12):
        first, count, contents = struct.unpack_from("<3i", lump[L_BRUSHES], i * 12)

        if not contents & CONTENTS_SOLID:
            continue

        lo = [-1e30] * 3
        hi = [1e30] * 3
        ok = True

        for s in range(first, first + count):
            nx, ny, nz, dist = planes[sides[s]]

            for axis, n in enumerate((nx, ny, nz)):
                other = [abs(v) for k, v in enumerate((nx, ny, nz)) if k != axis]

                if abs(abs(n) - 1.0) < AXIS_EPS and max(other) < AXIS_EPS:
                    if n > 0:
                        hi[axis] = min(hi[axis], dist)
                    else:
                        lo[axis] = max(lo[axis], -dist)

                    break
            else:
                ok = False

        if not ok or any(l < -1e29 or h > 1e29 for l, h in zip(lo, hi)):
            slanted += 1
            continue

        boxed.append((lo, hi))

    return boxed, slanted


def to_bf3(v):
    """Source Z-up metres -> Frostbite Y-up."""
    return (v[0], v[2], -v[1])


def obj_bounds(path):
    lo = [1e30] * 3
    hi = [-1e30] * 3

    for line in open(path):
        if line.startswith("v "):
            p = to_bf3([float(x) for x in line.split()[1:4]])
            lo = [min(a, b) for a, b in zip(lo, p)]
            hi = [max(a, b) for a, b in zip(hi, p)]

    return lo, hi


def main(bsp, obj, out):
    boxes, slanted = brush_boxes(bsp)
    lo, hi = obj_bounds(obj)
    shift = ((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2)

    # Source builds the 3D skybox as a miniature room parked far outside the playable map. Its
    # brushes are solid and never drawn, so they arrive here but belong to no part of dust2 the
    # player can reach -- keep only what overlaps the geometry the renderer actually has.
    margin = 2.0
    shapes, tiny, outside = [], 0, 0

    for blo, bhi in boxes:
        a = to_bf3([v * INCH for v in blo])
        b = to_bf3([v * INCH for v in bhi])
        centre = [(x + y) / 2 - s for x, y, s in zip(a, b, shift)]
        half = [abs(y - x) / 2 for x, y in zip(a, b)]

        if min(half) < MIN_EXTENT:
            tiny += 1
            continue

        if any(c - h > hh - ss + margin or c + h < ll - ss - margin
               for c, h, ll, hh, ss in zip(centre, half, lo, hi, shift)):
            outside += 1
            continue

        # 0.0 convex radius: Havok's default inflates a box, which would leave the player floating
        # a centimetre above dust2's floor.
        shapes.append(tuple(centre) + tuple(half) + (0.0,))

    print("brushes: %d boxed, %d slanted (need hkpConvexVerticesShape), %d slivers, "
          "%d outside the map (3D skybox)" % (len(boxes), slanted, tiny, outside))
    print("shapes : %d" % len(shapes))
    print("extent : x %.1f..%.1f  y %.1f..%.1f  z %.1f..%.1f m"
          % (min(s[0] - s[3] for s in shapes), max(s[0] + s[3] for s in shapes),
             min(s[1] - s[4] for s in shapes), max(s[1] + s[4] for s in shapes),
             min(s[2] - s[5] for s in shapes), max(s[2] + s[5] for s in shapes)))

    blob = build_collision.build(shapes)
    open(out, "wb").write(blob)
    print("wrote %s (%d bytes)" % (out, len(blob)))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/dust2/de_dust2.bsp",
         sys.argv[2] if len(sys.argv) > 2 else "/tmp/dust2/de_dust2.obj",
         sys.argv[3] if len(sys.argv) > 3 else "/tmp/dust2/dust2_physics.bin")
