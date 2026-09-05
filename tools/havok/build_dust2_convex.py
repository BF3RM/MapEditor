#!/usr/bin/env python3
"""dust2's collision as convex hulls -- every brush, exactly, including the slanted ones.

The box builder (build_dust2_collision.py) can only represent the 991 axis-aligned brushes; this
one represents all 1835, because hkpConvexVerticesShape takes the hull the brush already is. Same
transform as the render mesh: Source units to metres, Z-up to Y-up, centred with the floor at Y=0.
"""
import sys

import brush_hulls
import build_collision
import build_dust2_collision as boxes

INCH = 0.0254


def to_bf3(v):
    return (v[0] * INCH, v[2] * INCH, -v[1] * INCH)


def main(bsp, obj, out):
    lo, hi = boxes.obj_bounds(obj)
    shift = ((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2)
    margin = 2.0

    shapes, outside, degenerate = [], 0, 0

    for planes, pts in brush_hulls.brushes(bsp):
        if len(pts) < 4:
            degenerate += 1
            continue

        world = [to_bf3(p) for p in pts]
        centre = [sum(c[i] for c in world) / len(world) - shift[i] for i in range(3)]

        blo = [min(c[i] for c in world) - shift[i] for i in range(3)]
        bhi = [max(c[i] for c in world) - shift[i] for i in range(3)]

        # lo/hi are the render mesh's bounds BEFORE centring, so shift them too -- comparing a
        # centred hull against uncentred bounds silently discarded ~230 real brushes.
        if any(a > h - s + margin or b < l - s - margin
               for a, b, l, h, s in zip(blo, bhi, lo, hi, shift)):
            outside += 1                                  # Source's 3D skybox room
            continue

        local = [tuple(c[i] - shift[i] - centre[i] for i in range(3)) for c in world]

        # Source planes are in inches about the world origin; move them with the hull so they stay
        # the same half-spaces, in metres, about the shape's own centre.
        pl = []

        for nx, ny, nz, dist in planes:
            n = (nx, nz, -ny)                              # the same axis map as the points
            d = dist * INCH
            d -= sum(n[i] * (shift[i] + centre[i]) for i in range(3))
            pl.append((n[0], n[1], n[2], d))

        shapes.append(build_collision.convex(tuple(centre), local, pl))

    print("hulls  : %d  (%d outside the map, %d degenerate)" % (len(shapes), outside, degenerate))
    print("verts  : %d total, %.1f mean"
          % (sum(len(s["verts"]) for s in shapes),
             sum(len(s["verts"]) for s in shapes) / len(shapes)))

    blob = build_collision.build(shapes)
    open(out, "wb").write(blob)
    print("wrote %s (%d bytes)" % (out, len(blob)))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/dust2/de_dust2.bsp",
         sys.argv[2] if len(sys.argv) > 2 else "/tmp/dust2/de_dust2.obj",
         sys.argv[3] if len(sys.argv) > 3 else "/tmp/dust2/dust2_convex.bin")
