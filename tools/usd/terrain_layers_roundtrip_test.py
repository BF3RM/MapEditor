#!/usr/bin/env python3
"""Prove the terrain layer palette and its combination draws survive USD unchanged."""
import json
import os
import sys

from pxr import Usd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import terrain_layers


def main(path):
    doc = json.load(open(path))
    stage = Usd.Stage.CreateInMemory()
    nl, nd = terrain_layers.author(stage, doc)
    print("source       %s layers, %s draws  (%s)"
          % (doc.get("LayerCount"), len(doc.get("Draws") or []), os.path.basename(path)))
    print("authored     %d layer(s), %d draw(s)" % (nl, nd))

    tmp = "/tmp/terrain_layers_rt.usda"
    stage.GetRootLayer().Export(tmp)
    reopened = Usd.Stage.Open(tmp)
    back = terrain_layers.read_back(reopened)

    bad = []

    for k in terrain_layers.DOC_META:
        if doc.get(k) is not None and back.get(k) != doc.get(k):
            bad.append("%s: %r -> %r" % (k, doc.get(k), back.get(k)))

    if (doc.get("LayerVirtualTexture") or []) != back.get("LayerVirtualTexture"):
        bad.append("LayerVirtualTexture differs")

    src_draws = doc.get("Draws") or []
    got_draws = back.get("Draws") or []

    if len(src_draws) != len(got_draws):
        bad.append("draw count %d -> %d" % (len(src_draws), len(got_draws)))
    else:
        for i, (a, b) in enumerate(zip(src_draws, got_draws)):
            for f in ("Shader", "Kind", "Level", "Layers"):
                if a.get(f) is not None and a.get(f) != b.get(f):
                    bad.append("draw %d .%s %r -> %r" % (i, f, a.get(f), b.get(f)))

    print("fields       %d header + %d layer(s) + %d draw(s), %d changed  -> %s"
          % (len(terrain_layers.DOC_META), nl, nd, len(bad), "PASS" if not bad else "FAIL"))

    for b in bad[:6]:
        print("   ", b)

    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mp001-visualterrain.json"))
