#!/usr/bin/env python3
"""Prove a level's Enlighten bake survives USD byte for byte.

    tools/usd/enlighten_roundtrip_test.py [enlighten.json]

Dump one with Rime: `dump_level_enlighten mp_001 /tmp/mp001-enlighten.json`.

Compares DECODED payload bytes, not the base64 text, so a re-encoding that changed padding or line
breaks would still be caught. Everything here is guarded on CONTENT: a level with no Enlighten
resources authored would otherwise pass every check by having nothing to disagree about.
"""
import base64
import json
import os
import sys

from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import enlighten


def point_counts(stage):
    """{prim path of the owning resource: {child name: point count}} for every authored Points."""
    out = {}

    for prim in Usd.PrimRange(stage.GetPrimAtPath(enlighten.SCOPE)):
        if not prim.IsA(UsdGeom.Points):
            continue

        pts = UsdGeom.Points(prim).GetPointsAttr().Get()
        out.setdefault(str(prim.GetParent().GetPath()), {})[prim.GetName()] = len(pts or [])

    return out


def main(path="/tmp/mp001-enlighten.json"):
    doc = json.load(open(path))
    src = [r for r in (doc.get("resources") or []) if r.get("payload")]

    stage = Usd.Stage.CreateInMemory()
    made = enlighten.author(stage, doc)

    src_counts = {}

    for r in src:
        src_counts[r["type"]] = src_counts.get(r["type"], 0) + 1

    print("level        %s" % doc.get("level"))
    print("source       %d resource(s), %d payload byte(s), %s"
          % (len(src), doc.get("payloadBytes", 0), src_counts))
    print("authored     %d resource(s), %s"
          % (sum(made.values()), {k: v for k, v in made.items() if v}))

    # A level that emitted NOTHING passes a byte comparison over an empty set, so the count is
    # checked before anything is compared.
    if not src:
        print("FAIL         the dump holds no Enlighten resources at all")
        return 1

    for kind, short in enlighten.KINDS:
        if made[short] != src_counts.get(kind, 0):
            print("FAIL         %s authored %d of %d" % (kind, made[short], src_counts.get(kind, 0)))
            return 1

    if sum(made.values()) != len(src):
        print("FAIL         authored %d of %d resource(s)" % (sum(made.values()), len(src)))
        return 1

    tmp = "/tmp/enlighten_rt.usda"
    stage.GetRootLayer().Export(tmp)
    # Hold the reopened stage: a temporary would expire and take its prims with it.
    reopened = Usd.Stage.Open(tmp)
    back = enlighten.read_back(reopened)

    if len(back) != len(src):
        print("FAIL         read back %d of %d resource(s)" % (len(back), len(src)))
        return 1

    total_bytes = 0
    bad = 0
    headers = 0

    for i, entry in enumerate(src):
        mine = back[i]

        a = base64.b64decode(entry["payload"])
        b = enlighten.payload_bytes(mine)
        total_bytes += len(a)

        if a != b:
            print("FAIL         %s: %d bytes -> %d, %d differ"
                  % (entry["name"], len(a), len(b),
                     sum(1 for x, y in zip(a, b) if x != y) + abs(len(a) - len(b))))
            bad += 1
            continue

        for field in ("name", "type", "meta", "length"):
            if entry.get(field) != mine.get(field):
                print("FAIL         %s .%s %r -> %r"
                      % (entry["name"], field, entry.get(field), mine.get(field)))
                bad += 1

        # The parsed header has to survive too, or the payload is bytes nobody can place.
        if entry.get("data"):
            headers += 1

            if mine.get("data") != entry["data"]:
                changed = [k for k in entry["data"]
                           if (mine.get("data") or {}).get(k) != entry["data"][k]]
                print("FAIL         %s header changed: %s" % (entry["name"], changed))
                bad += 1

    print("resources    %d checked, %s of payload, %d changed  -> %s"
          % (len(src), "%.1f MB" % (total_bytes / 1048576.0), bad,
             "PASS" if bad == 0 else "FAIL"))
    print("headers      %d carried whole, %d changed  -> %s"
          % (headers, bad, "PASS" if bad == 0 else "FAIL"))

    if total_bytes != doc.get("payloadBytes"):
        print("FAIL         payload total %d, dump says %d" % (total_bytes, doc.get("payloadBytes")))
        bad += 1

    # Rime's own verdict travels with the data; if it ever stops being unanimous the bytes here are
    # still round-tripping but are no longer the bytes BF3 ships.
    print("rime         reencode %d/%d exact  -> %s"
          % (doc.get("reencodeExact", 0), doc.get("reencodeChecked", 0),
             "PASS" if doc.get("reencodeChecked") and
             doc["reencodeExact"] == doc["reencodeChecked"] else "FAIL"))

    if not doc.get("reencodeChecked") or doc["reencodeExact"] != doc["reencodeChecked"]:
        bad += 1

    # The authored geometry: probe positions and lightmap instances, counted against the source.
    counts = point_counts(reopened)
    want_probes = sum(len(r["data"]["positions"]) for r in src
                      if (r.get("data") or {}).get("positions"))
    want_instances = sum(len(r["data"]["lightMapInstances"]) for r in src
                         if (r.get("data") or {}).get("lightMapInstances"))
    got_probes = sum(v.get("probes", 0) for v in counts.values())
    got_instances = sum(v.get("lightMapInstances", 0) for v in counts.values())

    # Non-zero on purpose: every BF3 level measured has probe sets that ship positions, so zero
    # here means the Points were not authored rather than that the level has none.
    geom_ok = (got_probes == want_probes and got_instances == want_instances
               and want_probes > 0 and want_instances > 0)
    print("points       %d probe position(s) of %d, %d lightmap instance(s) of %d  -> %s"
          % (got_probes, want_probes, got_instances, want_instances,
             "PASS" if geom_ok else "FAIL"))

    if not geom_ok:
        bad += 1

    meta = json.loads(reopened.GetPrimAtPath(enlighten.SCOPE).GetCustomDataByKey("bf3:enlighten"))
    missing = [k for k in enlighten.DOC_META
               if doc.get(k) is not None and meta.get(k) != doc.get(k)]
    print("level header %d field(s) carried, %d changed  -> %s"
          % (len(meta), len(missing), "PASS" if not missing else "FAIL " + str(missing)))

    return 0 if (bad == 0 and not missing) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mp001-enlighten.json"))
