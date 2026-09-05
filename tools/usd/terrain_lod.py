#!/usr/bin/env python3
"""Flatten BF3's terrain quadtree into one heightfield, at the detail the game actually has.

BF3 stores terrain as a quadtree where EVERY node carries the same 133x133 grid over its own
bounding box. So a depth-3 node covers an eighth of the root's span at the same sample count --
8x the density per axis. The root alone is complete but coarse (7.76 m between samples on MP_001);
the deeper nodes are where the shape of the ground actually lives.

Taking the root and stopping, which is what the exporter did, throws away 29 of 30 populated grids.
Taking only the leaves leaves holes, because leaves cover a third of the map. The quadtree's own
answer is to use the deepest node available at each point, so that is what this does: start from
the root and let each deeper node overwrite the region it covers, shallowest first.

Height is `sample * worldScaleY` -- measured, not assumed: it reproduces a leaf node's bbox on both
ends, where treating the u16 as a fraction of the node's own min..max does not.

The grids also carry a SKIRT on every edge, and the dump reports its width: treating all 133
samples as spanning the node's bbox makes adjacent nodes disagree by up to 8.25 m along their
shared edge, which would show as cracks metres deep. Dropping the skirt leaves a 129x129 interior
that covers the bbox exactly, and neighbours then agree to 0.000 m. 129 samples is 128 cells, so a
fully refined MP_001 composite lands on exactly 1.0 m over its 1024 m.

The width comes from the resource (`nodeBorderWidth`, 2 on all 33 of the game's terrains) rather
than being assumed -- it was measured first, by sweeping candidate widths until the seams closed,
and only afterwards found to be a field the format carries.
"""
import base64

import numpy as np


SKIRT = 2                      # the fallback for a dump that predates nodeBorderWidth


def _grid(node, side, skirt):
    """The node's INTERIOR samples: the outer rings are a stitching skirt, not terrain."""
    raw = base64.b64decode(node["data"])[:side * side * 2]
    full = np.frombuffer(raw, dtype="<u2").astype(np.float32).reshape(side, side)
    return full[skirt:side - skirt, skirt:side - skirt]


def _resample(src, h, w):
    """Bilinear resample a (side, side) grid onto (h, w). The node grids sit on a coarser lattice
    than the composite, and the samples between them have to come from somewhere."""
    sh, sw = src.shape
    y = np.linspace(0, sh - 1, h)
    x = np.linspace(0, sw - 1, w)
    y0 = np.floor(y).astype(int)
    x0 = np.floor(x).astype(int)
    y1 = np.minimum(y0 + 1, sh - 1)
    x1 = np.minimum(x0 + 1, sw - 1)
    fy = (y - y0)[:, None]
    fx = (x - x0)[None, :]
    top = src[np.ix_(y0, x0)] * (1 - fx) + src[np.ix_(y0, x1)] * fx
    bot = src[np.ix_(y1, x0)] * (1 - fx) + src[np.ix_(y1, x1)] * fx
    return top * (1 - fy) + bot * fy


def composite(doc, max_side=2048):
    """-> (heights, lo, hi, stats). heights is (n, n) in metres, indexed [z][x]."""
    side = int(doc["samplesPerSide"])
    skirt = int(doc.get("nodeBorderWidth", SKIRT))
    scale_y = float(doc["worldScaleY"])
    nodes = [n for n in doc.get("nodes") or [] if n.get("data") and n.get("embedded")]

    if not nodes:
        return None, None, None, {}

    root = nodes[0]
    lo, hi = root["min"], root["max"]
    span = hi[0] - lo[0]
    deepest = max(n["depth"] for n in nodes)

    # Each depth halves the node's span at the same sample count, so the finest cell size is
    # span / 2^deepest / cells. Size the composite to match, capped so a deep tree cannot ask for
    # a billion vertices.
    cells = side - 2 * skirt - 1
    n = min(max_side, cells * (2 ** deepest) + 1)
    out = np.zeros((n, n), np.float32)
    covered = np.zeros((n, n), np.uint8)

    for node in sorted(nodes, key=lambda x: x["depth"]):
        nlo, nhi = node["min"], node["max"]
        i0 = int(round((nlo[0] - lo[0]) / span * (n - 1)))
        i1 = int(round((nhi[0] - lo[0]) / span * (n - 1)))
        j0 = int(round((nlo[2] - lo[2]) / span * (n - 1)))
        j1 = int(round((nhi[2] - lo[2]) / span * (n - 1)))

        if i1 <= i0 or j1 <= j0:
            continue

        patch = _resample(_grid(node, side, skirt), j1 - j0 + 1, i1 - i0 + 1)
        out[j0:j1 + 1, i0:i1 + 1] = patch
        covered[j0:j1 + 1, i0:i1 + 1] = max(1, node["depth"] + 1)

    stats = {
        "nodes_used": len(nodes),
        "deepest_depth": deepest,
        "composite_side": n,
        "root_spacing_m": span / cells,
        "finest_spacing_m": span / (n - 1),
        "refined_fraction": float((covered > 1).mean()),
        "skirt": skirt,
    }
    return out * scale_y, lo, hi, stats


if __name__ == "__main__":
    import json
    import sys

    doc = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mp001-terrain.json"))
    h, lo, hi, st = composite(doc)
    print("nodes with data      : %d   deepest depth %d" % (st["nodes_used"], st["deepest_depth"]))
    print("root grid            : %d x %d interior (of %d, skirt %d) at %.2f m per sample"
          % (doc["samplesPerSide"] - 2 * st["skirt"], doc["samplesPerSide"] - 2 * st["skirt"],
             doc["samplesPerSide"], st["skirt"], st["root_spacing_m"]))
    print("composite            : %d x %d  at %.2f m per sample  (%.1fx finer)"
          % (st["composite_side"], st["composite_side"], st["finest_spacing_m"],
             st["root_spacing_m"] / st["finest_spacing_m"]))
    print("refined by deeper LOD: %.1f%% of the map" % (100 * st["refined_fraction"]))
    print("height range         : %.2f .. %.2f m   (root bbox says %.2f .. %.2f)"
          % (h.min(), h.max(), lo[1], hi[1]))

    # Does each populated node's own bbox agree with the composite over its footprint?
    span = hi[0] - lo[0]
    n = st["composite_side"]
    worst = 0.0

    for node in doc["nodes"]:
        if not node.get("data") or not node.get("embedded"):
            continue

        i0 = int(round((node["min"][0] - lo[0]) / span * (n - 1)))
        i1 = int(round((node["max"][0] - lo[0]) / span * (n - 1)))
        j0 = int(round((node["min"][2] - lo[2]) / span * (n - 1)))
        j1 = int(round((node["max"][2] - lo[2]) / span * (n - 1)))
        sub = h[j0:j1 + 1, i0:i1 + 1]

        if sub.size:
            worst = max(worst, abs(sub.min() - node["min"][1]), abs(sub.max() - node["max"][1]))

    print("worst node bbox disagreement: %.3f m" % worst)


def mask_composite(doc, max_side=2048):
    """The mask tree's weights, flattened the same way the heightfield is.

    Each node carries NodeSamplesPerSide squared bytes over its own box, and deeper nodes refine
    shallower ones, so the same deepest-wins rule applies. What a weight MEANS -- which of the
    level's layers it drives -- needs the layer-to-texture binding, which is not readable yet; the
    values are carried so the stage holds them rather than dropping them on the floor.
    """
    nodes = doc.get("maskNodes") or []

    if not nodes:
        return None, {}

    side = int(doc["maskSamplesPerSide"])
    lo = min(n["min"][0] for n in nodes), min(n["min"][1] for n in nodes)
    hi = max(n["max"][0] for n in nodes), max(n["max"][1] for n in nodes)
    span = hi[0] - lo[0]
    depths = {}

    for n in nodes:
        w = n["max"][0] - n["min"][0]
        depths[n["level"]] = w

    deepest = max(nodes, key=lambda n: n["level"])["level"]
    cells = side - 1
    grid = min(max_side, cells * (2 ** deepest) + 1)
    out = np.zeros((grid, grid), np.uint8)

    for node in sorted(nodes, key=lambda x: x["level"]):
        raw = base64.b64decode(node["samples"])

        if len(raw) < side * side:
            continue

        patch = np.frombuffer(raw[:side * side], np.uint8).reshape(side, side)
        i0 = int(round((node["min"][0] - lo[0]) / span * (grid - 1)))
        i1 = int(round((node["max"][0] - lo[0]) / span * (grid - 1)))
        j0 = int(round((node["min"][1] - lo[1]) / span * (grid - 1)))
        j1 = int(round((node["max"][1] - lo[1]) / span * (grid - 1)))

        if i1 <= i0 or j1 <= j0:
            continue

        out[j0:j1 + 1, i0:i1 + 1] = _resample(
            patch.astype(np.float32), j1 - j0 + 1, i1 - i0 + 1).astype(np.uint8)

    stats = {"nodes": len(nodes), "side": grid, "deepest_level": deepest,
             "painted_fraction": float((out > 0).mean())}
    return out, stats
