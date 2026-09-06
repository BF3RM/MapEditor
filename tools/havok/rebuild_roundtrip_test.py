#!/usr/bin/env python3
"""Rebuild a shipped collision resource and prove the rebuild says the same thing.

    tools/havok/rebuild_roundtrip_test.py <original.bin> [--list]

Byte equality is not available for most of BF3's collision and saying so is the point: the bake
contains an hkpMoppCode, which only the Havok SDK produces, and the padding lanes of an
hkpConvexTransformShape's rotation carry SIMD leftovers with no rule (col0.w is zero in 28,191 of
BF3's 52,448 transforms and equals col1.z in 24,257). So this measures the two things that CAN be
established:

  * the OBJECT CENSUS of the rebuild against the game's own, class by class, so what is missing is
    named rather than summarised;
  * a full round trip -- game bytes -> Rime's reader -> descriptors -> builder -> Rime's reader --
    requiring the same placements back, at the same positions, with the same rotations.

Plus an edit probe, because a builder that ignored its input would pass a round trip that only ever
fed it the same thing.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build_collision                                                  # noqa: E402

RIME = os.path.expanduser("~/Projects/Rime")
DUMPER = os.path.join(RIME, "Utils/HavokRoundTrip/bin/Release/HavokRoundTrip.dll")
DOTNET = os.path.expanduser("~/.dotnet/dotnet")

BUILDABLE = build_collision.EMITTABLE


def decode(path):
    """Rime's reader on a raw resource -> its shapes and its object census."""
    out = path + ".json"
    r = subprocess.run([DOTNET, DUMPER, path, out], capture_output=True, text=True)

    if r.returncode != 0:
        raise RuntimeError("decode failed: %s" % (r.stderr.strip() or r.stdout.strip()))

    return json.load(open(out))


def descriptors(dump):
    """Rime's shapes -> the descriptors build_collision.build() consumes."""
    out = []

    for s in dump["shapes"]:
        rot = s["rotation"]
        rot = None if rot == [[1, 0, 0], [0, 1, 0], [0, 0, 1]] else [tuple(c) for c in rot]
        kind = s["kind"]

        leaf = s["offset"]

        if kind == "box":
            d = build_collision.box(tuple(s["centre"]), tuple(s["half"]), s["radius"], rotation=rot,
                                    leaf_id=leaf)
        elif kind == "sphere":
            d = build_collision.sphere(tuple(s["centre"]), s["radius"], rotation=rot, leaf_id=leaf)
        elif kind in ("cylinder", "capsule"):
            f = build_collision.cylinder if kind == "cylinder" else build_collision.capsule
            args = [tuple(s["centre"]), tuple(s["vertexA"]), tuple(s["vertexB"])]

            if kind == "cylinder":
                args.append(s["cylinderRadius"])

            d = f(*args, radius=s["radius"], rotation=rot, leaf_id=leaf)
        elif kind == "convex":
            # Havok's planes are POST-radius, so undo the inflation the builder re-applies.
            planes = [(p[0], p[1], p[2], -p[3] - s["radius"]) for p in s["planes"]]
            d = build_collision.convex(tuple(s["centre"]), [tuple(v) for v in s["verts"]], planes,
                                       s["radius"], rotation=rot,
                                       connectivity=s.get("connectivity", False),
                                       leaf_id=leaf)
        else:
            return None, kind                       # a mesh: the builder has no class for it

        if d is None:
            return None, "degenerate %s" % kind

        out.append(d)

    return out, None


def compare(src, back, label):
    """Every placement back, in order, at the same place. -> (checked, bad)"""
    if len(src) != len(back):
        print("FAIL         %s: %d placement(s) in, %d out" % (label, len(src), len(back)))
        return 0, 1

    checked = bad = 0

    def close(a, b, tol=1e-4):
        return abs(float(a) - float(b)) <= tol

    for i, (a, b) in enumerate(zip(src, back)):
        if a["kind"] != b["kind"]:
            print("FAIL         shape %d kind %s -> %s" % (i, a["kind"], b["kind"]))
            bad += 1
            continue

        fields = [("centre", 3)]

        if a["kind"] == "box":
            fields.append(("half", 3))
        elif a["kind"] in ("cylinder", "capsule"):
            fields += [("vertexA", 3), ("vertexB", 3)]

        for name, n in fields:
            for k in range(n):
                checked += 1

                if not close(a[name][k], b[name][k]):
                    print("FAIL         shape %d %s[%d] %r -> %r" % (i, name, k, a[name][k], b[name][k]))
                    bad += 1

        for c in range(3):
            for k in range(3):
                checked += 1

                if not close(a["rotation"][c][k], b["rotation"][c][k]):
                    print("FAIL         shape %d rotation[%d][%d] %r -> %r"
                          % (i, c, k, a["rotation"][c][k], b["rotation"][c][k]))
                    bad += 1

        if a["kind"] == "convex":
            checked += 1

            if len(a["verts"]) != len(b["verts"]):
                print("FAIL         shape %d verts %d -> %d" % (i, len(a["verts"]), len(b["verts"])))
                bad += 1

    return checked, bad


def main(path, use_list=None):
    orig = open(path, "rb").read()
    src = decode(path)
    print("original     %d bytes, %d object(s), %d placement(s)  (%s)"
          % (len(orig), src["objects32"], len(src["shapes"]), os.path.basename(path)))

    # The gate the pipeline uses: a bake containing an hkpMoppCode or an hkpCompressedMeshShape can
    # be PRESERVED verbatim but not regenerated, so it is skipped here rather than counted as a
    # failure or, worse, rebuilt into something that would load without its mesh.
    ok, blocked, degraded = build_collision.can_rebuild(src["census"])

    if not ok:
        print("SKIP         preserve-only: holds %s" % ", ".join(blocked))
        return 0

    if degraded:
        print("degraded     rebuild drops %s -- the acceleration structure, not the shapes"
              % ", ".join(degraded))

    if not src["shapes"]:
        print("FAIL         nothing decoded -- no verdict available")
        return 1

    desc, why = descriptors(src)

    if desc is None:
        print("SKIP         resource holds a %s the builder cannot emit" % why)
        return 0

    # build() pads a lone shape to two; compare against what it actually built.
    desc = build_collision.pad(desc)

    # A list only where the game has one: 900 resources put a bare hkpListShape under the
    # container and 1,272 put a bare translate, so inventing one adds an object.
    if use_list is None:
        use_list = bool(src["census"].get("hkpListShape") or src["census"].get("hkpMoppBvTreeShape"))

    # The game's own wrapper, so the diff is about the packfiles and not about a synthetic header.
    rebuilt = build_collision.build(desc, wrapper_spec=src["wrapper"], use_list=use_list)
    out = "/tmp/rebuilt_collision.bin"
    open(out, "wb").write(rebuilt)
    back = decode(out)

    print("rebuilt      %d bytes, %d object(s), %d placement(s)%s"
          % (len(rebuilt), back["objects32"], len(back["shapes"]), "  [hkpListShape]" if use_list else ""))

    # --- census, class by class. What is missing has to be named, not totalled.
    keys = sorted(set(src["census"]) | set(back["census"]))
    print("census       %-34s %6s %6s" % ("class", "game", "built"))
    missing = 0

    for k in keys:
        a, b = src["census"].get(k, 0), back["census"].get(k, 0)
        flag = "" if a == b else ("   <- SDK bake, not reproducible" if k not in BUILDABLE else "   <-")
        print("             %-34s %6d %6d%s" % (k, a, b, flag))

        if a != b and k not in BUILDABLE:
            missing += a - b

    print("             %-34s %6d %6d   (%d of them classes only the Havok SDK bakes)"
          % ("TOTAL", src["objects32"], back["objects32"], missing))

    expect = src["shapes"] + src["shapes"][-1:] * (len(desc) - len(src["shapes"]))
    checked, bad = compare(expect, back["shapes"], "round trip")
    print("round trip   %d value(s) compared, %d changed  -> %s"
          % (checked, bad, "PASS" if bad == 0 else "FAIL"))

    # --- EDIT PROBE. A builder that ignored its descriptors would pass everything above.
    probe = json.loads(json.dumps(desc))
    probe[0]["centre"] = [probe[0]["centre"][0] + 12.5, probe[0]["centre"][1], probe[0]["centre"][2]]
    open(out, "wb").write(build_collision.build(probe, wrapper_spec=src["wrapper"],
                                                use_list=use_list))
    moved = decode(out)

    got = moved["shapes"][0]["centre"][0]
    want = expect[0]["centre"][0] + 12.5
    others = sum(1 for i in range(1, len(moved["shapes"]))
                 if abs(moved["shapes"][i]["centre"][0] - expect[i]["centre"][0]) > 1e-4)

    probe_ok = abs(got - want) <= 1e-3 and others == 0
    print("edit probe   shape 0 x %.4f -> %.4f (wanted %.4f), %d other placement(s) moved  -> %s"
          % (expect[0]["centre"][0], got, want, others, "PASS" if probe_ok else "FAIL"))

    if src["objects32"] == 0 or checked == 0:
        print("RESULT       NOTHING TESTED")
        return 1

    passed = bad == 0 and probe_ok
    print("RESULT       %s" % ("PASS" if passed else "FAIL"))

    return 0 if passed else 1


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sys.exit(main(args[0], True if "--list" in sys.argv else None))
