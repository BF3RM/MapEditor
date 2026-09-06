#!/usr/bin/env python3
"""Prove terrain mesh scattering survives USD unchanged, field for field.

    tools/usd/scattering_roundtrip_test.py [visualterrain.json]

With no argument it runs a synthetic case that exercises every field at a value that would catch a
type error: floats that are not round, both bool states, negative sbytes, and a uint above 2^31
(which is where a signed round trip quietly breaks).
"""
import json
import math
import os
import sys

from pxr import Usd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import scattering


def _synthetic():
    """Two layers, three types, values chosen to break a careless round trip."""
    return {"Scattering": [
        {"Layer": 0, "Index": 0, "MeshName": "objects/vegetation/grass_01/grass_01",
         "VariationAssetNameHash": 4207793664, "Density": 0.37500001, "LockDensity": True,
         "RandomPositionOffset": 1.25, "MinMask": 0.10000001, "MaxMask": 0.9,
         "MinScaleX": 0.75, "MinScaleY": 0.8, "MaxScaleX": 1.3, "MaxScaleY": 1.45,
         "MinMaskScaleFactorX": 0.2, "MinMaskScaleFactorY": 0.3, "ScaleRandomess": 0.65,
         "WindScale": 1.75, "FirstSpawnLevel": -3, "SpawnLevelCount": 4, "RotationMode": 2,
         "OrientationMode": -1, "RotateTowardSlopeWeight": 0.45, "CastShadowsEnable": False,
         "ShadowViewDistance": 45.5, "BillboardingEnable": True,
         "BillboardingGpuAccelleration": False, "InstanceType": 2,
         "GroundClampBoundingBoxEnable": True},
        {"Layer": 0, "Index": 1, "MeshName": "objects/vegetation/grass_01/grass_01",
         "VariationAssetNameHash": 1, "Density": 0.125, "LockDensity": False,
         "RandomPositionOffset": 0.0, "MinMask": 0.0, "MaxMask": 1.0, "MinScaleX": 1.0,
         "MinScaleY": 1.0, "MaxScaleX": 1.0, "MaxScaleY": 1.0, "MinMaskScaleFactorX": 0.0,
         "MinMaskScaleFactorY": 0.0, "ScaleRandomess": 0.0, "WindScale": 0.0,
         "FirstSpawnLevel": 0, "SpawnLevelCount": 0, "RotationMode": 0, "OrientationMode": 0,
         "RotateTowardSlopeWeight": 0.0, "CastShadowsEnable": True, "ShadowViewDistance": 0.0,
         "BillboardingEnable": False, "BillboardingGpuAccelleration": False, "InstanceType": 0,
         "GroundClampBoundingBoxEnable": False},
        {"Layer": 3, "Index": 0, "MeshName": "objects/vegetation/bush_02/bush_02",
         "VariationAssetNameHash": 2147483649, "Density": 12.345679, "LockDensity": True,
         "RandomPositionOffset": 3.75, "MinMask": 0.25, "MaxMask": 0.75, "MinScaleX": 0.5,
         "MinScaleY": 0.5, "MaxScaleX": 2.5, "MaxScaleY": 2.5, "MinMaskScaleFactorX": 1.5,
         "MinMaskScaleFactorY": 1.5, "ScaleRandomess": 0.875, "WindScale": 0.25,
         "FirstSpawnLevel": -128, "SpawnLevelCount": 127, "RotationMode": 1,
         "OrientationMode": 3, "RotateTowardSlopeWeight": 1.0, "CastShadowsEnable": True,
         "ShadowViewDistance": 120.25, "BillboardingEnable": True,
         "BillboardingGpuAccelleration": True, "InstanceType": 1,
         "GroundClampBoundingBoxEnable": False},
    ]}


def _same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b)

    if isinstance(a, float) or isinstance(b, float):
        # float32 storage: compare at float32 precision, not float64.
        import struct
        f = lambda v: struct.unpack("<f", struct.pack("<f", float(v)))[0]

        return f(a) == f(b) or (math.isnan(f(a)) and math.isnan(f(b)))

    return a == b


def main(path=None):
    doc = json.load(open(path)) if path else _synthetic()
    src = doc.get("Scattering") or doc.get("scattering") or []
    print("source       %d scattering type(s)%s"
          % (len(src), (" from " + path) if path else " (synthetic)"))

    if not src:
        print("SKIP         this level scatters nothing")
        return 0

    stage = Usd.Stage.CreateInMemory()
    made = scattering.author(stage, doc)
    print("authored     %d prim(s)" % made)

    if made != len(src):
        print("FAIL         authored %d of %d" % (made, len(src)))
        return 1

    tmp = "/tmp/scatter_rt.usda"
    stage.GetRootLayer().Export(tmp)
    back = scattering.read_back(Usd.Stage.Open(tmp))
    print("read back    %d prim(s)" % len(back))

    if len(back) != len(src):
        print("FAIL         read back %d of %d" % (len(back), len(src)))
        return 1

    # Match on (Layer, Index) -- the record's address in the resource, and what the Rime writeback
    # keys on. It is order-independent, which matters because USD hands children back in NAME order
    # (layer_10 before layer_2), so anything that leans on traversal order passes here and scrambles
    # the writeback. Falls back to (layer, mesh, nth-of-that-pair) for a dump made before Index
    # existed; a layer may grow the same mesh twice, so duplicates must not alias.
    seen_a, seen_b = {}, {}
    idx_a = {}
    keyed_by_index = all("Index" in e for e in src)

    for e in src:
        if keyed_by_index:
            idx_a[(int(e.get("Layer", 0)), int(e["Index"]))] = e
            continue

        k = (int(e.get("Layer", 0)), e.get("MeshName"))
        n = seen_a.get(k, 0)
        seen_a[k] = n + 1
        idx_a[k + (n,)] = e

    if keyed_by_index and len(idx_a) != len(src):
        print("FAIL         (Layer, Index) is not unique: %d address(es) for %d type(s)"
              % (len(idx_a), len(src)))
        return 1

    print("keyed by     %s" % ("(Layer, Index)" if keyed_by_index else "(Layer, MeshName, nth)"))

    bad = 0
    checked = 0

    for e in back:
        if keyed_by_index:
            if "Index" not in e:
                print("FAIL         layer %d came back with no Index" % int(e.get("Layer", 0)))
                bad += 1
                continue

            k = (int(e.get("Layer", 0)), int(e["Index"]))
        else:
            k = (int(e.get("Layer", 0)), e.get("MeshName"))
            n = seen_b.get(k, 0)
            seen_b[k] = n + 1
            k = k + (n,)

        orig = idx_a.get(k)

        if orig is None:
            print("FAIL         no source for %r" % (k,))
            bad += 1
            continue

        for field, _ in scattering.FIELDS:
            if field not in orig:
                continue

            checked += 1

            if not _same(orig[field], e.get(field)):
                print("FAIL         %r .%s: %r -> %r" % (k, field, orig[field], e.get(field)))
                bad += 1

    print("fields       %d compared, %d changed  -> %s"
          % (checked, bad, "PASS" if bad == 0 else "FAIL"))

    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
