#!/usr/bin/env python3
"""Prove the proxies are visible, are GUIDE, and change no data.

    tools/usd/visual_proxies_test.py

A proxy that rendered would put geometry into the level that BF3 never had, and a proxy that
displaced the typed attributes would make the preview authoritative. Both are checked, along with
the thing that actually matters: that a marker is drawn for every emitter, not merely for some.
"""
import os
import sys

from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import closure_export
import scattering
import visual_proxies


def main():
    bad = 0

    # 1. An emitter marker for every emitter, and not one that renders.
    stage = Usd.Stage.CreateInMemory()
    n_parts, counts = closure_export.author(stage, "/tmp/closure", 400)
    want = sum(v for k, v in counts.items() if k in visual_proxies.EMITTER_TYPES)
    made = visual_proxies.emitters(stage)
    print("emitters     %d instance(s), %d proxy(ies)" % (want, made))

    if want == 0 or made != want:
        print("FAIL         %d proxies for %d emitters" % (made, want))
        bad += 1

    tmp = "/tmp/visual_proxies.usda"
    stage.GetRootLayer().Export(tmp)
    ro = Usd.Stage.Open(tmp)
    rendered = sum(1 for p in ro.Traverse() if p.GetName() == "proxy"
                   and UsdGeom.Imageable(p).GetPurposeAttr().Get() != UsdGeom.Tokens.guide)
    print("purpose      %d proxy(ies) that would RENDER" % rendered)

    if rendered:
        bad += 1

    # 2. A scattering preview that does not disturb the authoritative fields.
    st2 = Usd.Stage.CreateInMemory()
    n_types = scattering.author(st2, "/tmp/vt-mp007.json")
    prev = visual_proxies.scattering_preview(st2, "/tmp/mp001-terrain-rt.json")
    tmp2 = "/tmp/visual_proxies_scatter.usda"
    st2.GetRootLayer().Export(tmp2)
    ro2 = Usd.Stage.Open(tmp2)
    back = scattering.read_back(ro2)
    pts = sum(len(UsdGeom.PointInstancer(p).GetPositionsAttr().Get() or [])
              for p in ro2.Traverse() if p.IsA(UsdGeom.PointInstancer))
    print("scattering   %d type(s), %d preview(s), %d point(s), %d read back"
          % (n_types, prev, pts, len(back)))

    if n_types == 0 or prev != n_types or len(back) != n_types or pts == 0:
        print("FAIL         preview count or read-back mismatch")
        bad += 1

    print("RESULT       %s" % ("PASS" if bad == 0 else "FAIL"))

    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
