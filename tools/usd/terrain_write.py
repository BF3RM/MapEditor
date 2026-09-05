#!/usr/bin/env python3
"""Terrain edits, from a USD mesh back into BF3's quadtree.

Export flattens the quadtree into one mesh (deepest node wins per point; MP_001 is 1025x1025 at
1.00 m/sample). Nothing brought a sculpted mesh BACK: the emitter only REFERENCED the game's terrain
partitions, and `replace_terrain_heights` -- which exists in Rime and is byte-exact -- had zero call
sites. So terrain could be edited in a DCC and the edit was silently dropped, which is export, not a
round trip.

This resamples the edited mesh into each node's own grid, compares against the shipped samples, and
emits only the nodes that actually changed, in the shape the Rime command consumes:

    {"nodes": [{"level": d, "indexX": x, "indexY": y, "data": "<base64 of <u2 samples>"}]}

Only CHANGED nodes are written, so an untouched terrain produces no edits at all and the bundle
keeps referencing the game's own trees.
"""
import base64
import json
import os

import numpy as np
from pxr import Usd, UsdGeom

import terrain_lod


def _node_prim_grid(stage, node, side, skirt):
    """The node's OWN mesh, exactly as authored -- no resampling anywhere.

    The flattened composite cannot be the editable surface: going mesh -> node grid needs a
    resample, and a resample means an UNTOUCHED node comes back changed. Vanilla accuracy requires
    that an unedited terrain reproduce its shipped bytes exactly, so each node is authored as its
    own mesh at its own sample count and edited in place. uint16 -> float32 -> uint16 is exact for
    every value BF3 stores, so the trip is lossless by construction, not by tolerance.
    """
    name = 'node_%d_%d_%d' % (int(node.get('depth', 0)), int(node.get('indexX', 0)),
                              int(node.get('indexY', 0)))

    for prim in stage.Traverse():
        if prim.GetName() == name and prim.IsA(UsdGeom.Mesh):
            pts = UsdGeom.Mesh(prim).GetPointsAttr().Get() or []
            inner = side - 2 * skirt

            if len(pts) != inner * inner:
                return None

            return np.array([p[1] for p in pts], dtype=np.float32).reshape(inner, inner)

    return None


def edits_from_stage(stage_path, terrain_json, out_path, tolerance=1e-4):
    """-> (changed node count, path written or None)."""
    doc = json.load(open(terrain_json))
    side = int(doc['samplesPerSide'])
    skirt = int(doc.get('nodeBorderWidth', 1))
    scale_y = float(doc['worldScaleY'])

    stage = Usd.Stage.Open(stage_path)
    nodes_out = []

    for node in (doc.get('nodes') or []):
        if not node.get('data') or not node.get('embedded'):
            continue

        was = terrain_lod._grid(node, side, skirt)
        now = _node_prim_grid(stage, node, side, skirt)

        if now is None:
            continue                          # node not authored in this stage

        now = now / scale_y

        if now.shape != was.shape or np.array_equal(now.astype('<u2'), was.astype('<u2')):
            continue                          # byte-identical: keep referencing the game's own tree

        # Rebuild the node's full sample block, skirt included, so only the interior changes.
        raw = bytearray(base64.b64decode(node['data']))
        full = np.frombuffer(bytes(raw[:side * side * 2]), dtype='<u2').astype(np.float32) \
                 .reshape(side, side).copy()
        full[skirt:side - skirt, skirt:side - skirt] = np.clip(now, 0, 65535)
        packed = full.astype('<u2').tobytes()
        raw[:len(packed)] = packed

        nodes_out.append({'level': int(node.get('depth', 0)),
                          'indexX': int(node.get('indexX', 0)),
                          'indexY': int(node.get('indexY', 0)),
                          'data': base64.b64encode(bytes(raw)).decode('ascii')})

    if not nodes_out:
        return 0, None

    json.dump({'nodes': nodes_out}, open(out_path, 'w'))

    return len(nodes_out), out_path
