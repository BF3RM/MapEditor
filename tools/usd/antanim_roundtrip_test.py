#!/usr/bin/env python3
"""Prove Ant clips reach USD with real bone names AND with their values untouched.

    tools/usd/antanim_roundtrip_test.py [bankdir] [rigdump] [skeldir]

Defaults to the corpus Rime dumps: /tmp/antbanks (banks with decoded frames),
/tmp/ant/all/animations_antanimations_s_basicassets.json (the static package that holds every
rig), /tmp/ant (the dump_skeleton output).

Four things are checked, and each guards on CONTENT rather than on a verdict, because a clip
that emits nothing round trips perfectly:

  1. clips authored, and how many got named joints -- both must be non-zero;
  2. the names are BF3's own -- every named joint has to appear in a SkeletonAsset the game
     ships, or be one of the rig-only channels (IK targets, weapon parts, foot velocities) that
     no skeleton carries. A name that is neither is a fabricated bone and fails;
  3. a spot check with the answer written down: the ak74 M26 fire clip, whose DOF set BF3 itself
     names (a ClipControllerAsset targets 1P_Upperbody_DOF), must put Neck on channel 0,
     Wep_Root's rotation on 3 and its translation on 96, and must drive LeftHandThumb2;
  4. every channel comes back bit-identical through .usda -- float32 compared as float32.
"""
import glob
import json
import os
import struct
import sys

from pxr import Usd, UsdGeom

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import antanim
import antrig

BANKS = "/tmp/antbanks"
RIG = "/tmp/ant/all/animations_antanimations_s_basicassets.json"
SKEL = "/tmp/ant"

# Channels that are rig machinery rather than bones. BF3's SkeletonAssets do not carry them and
# should not: they are the trajectory root, the IK effectors, the animated weapon parts and the
# foot-plant signals the rig computes.
RIG_ONLY = ("AITrajectory", "Trajectory", "Reference", "delta", "Connect", "IK_Joint_", "Wep_",
            "JointIndex", "FOV", "_scale", "EffectorAux", "_vel", "_height")


def _f32(x):
    return struct.unpack("<f", struct.pack("<f", float(x)))[0]


def main(bankdir=BANKS, rigpath=RIG, skeldir=SKEL):
    if not os.path.isfile(rigpath):
        print("SKIP         no rig dump at %s" % rigpath)
        return 0

    rig = antrig.load(rigpath)
    print("rig          %d DOF set(s), %d channel map(s), %d ant skeleton(s)"
          % (len(rig.tables), len(rig.maps), len(rig.skeletons)))

    if not rig.tables or not rig.maps:
        print("FAIL         the static package produced no DOF tables")
        return 1

    # Every bone name BF3's own SkeletonAsset partitions carry.
    bones = set()

    for f in glob.glob(os.path.join(skeldir, "skel_*.json")):
        for b in (json.load(open(f)).get("bones") or []):
            bones.add(b["name"])

    print("skeletons    %d bone name(s) from %d SkeletonAsset dump(s)"
          % (len(bones), len(glob.glob(os.path.join(skeldir, "skel_*.json")))))

    banks = sorted(glob.glob(os.path.join(bankdir, "*.json")))

    if not banks:
        print("SKIP         no bank dumps in %s" % bankdir)
        return 0

    stage = Usd.Stage.CreateInMemory()
    world = UsdGeom.Scope.Define(stage, "/World")
    clips = named = 0
    source = []

    for path in banks:
        bank = json.load(open(path))
        c, n = antanim.author(stage, world, bank, rig)
        clips += c
        named += n

        for o in (bank.get("objects") or ()):
            if o.get("sample") and isinstance(o["sample"][0], dict) and "values" in o["sample"][0]:
                source.append(((bank.get("partition"), o.get("index")), o))

    print("export       %d clip(s) from %d bank(s), %d with named joints"
          % (clips, len(banks), named))

    if clips == 0 or named == 0:
        print("FAIL         %d clip(s), %d named -- nothing to check" % (clips, named))
        return 1

    tmp = "/tmp/antanim_rt.usda"
    stage.GetRootLayer().Export(tmp)
    back = antanim.read(tmp)
    print("read back    %d clip(s)" % len(back))

    if len(back) != clips:
        print("FAIL         read back %d of %d" % (len(back), clips))
        return 1

    # 2. the names are the game's own.
    checked = fabricated = rigonly = 0
    bad = []

    for clip in back:
        if not clip.get("named"):
            continue

        for j in clip["joints"]:
            checked += 1

            if j in bones:
                continue

            if any(j.startswith(p) or p in j for p in RIG_ONLY):
                rigonly += 1
                continue

            fabricated += 1

            if len(bad) < 8:
                bad.append(j)

    print("names        %d joint token(s) on named clips: %d in a shipped SkeletonAsset, "
          "%d rig-only, %d unaccounted" % (checked, checked - rigonly - fabricated, rigonly,
                                           fabricated))

    if checked == 0:
        print("FAIL         no named joints to check")
        return 1

    if fabricated:
        print("FAIL         %d joint name(s) match no BF3 bone, e.g. %s" % (fabricated, bad))
        return 1

    # 3. spot check with the answer written down.
    spot = os.path.join(bankdir, "animations_antanimations_ak74.json")
    ok = True

    if os.path.isfile(spot):
        bank = json.load(open(spot))
        clip = next((o for o in bank["objects"]
                     if o.get("objectName") == "M26_Fire Anim"), None)

        if clip is None:
            print("SKIP         ak74 has no 'M26_Fire Anim' to spot check")
        else:
            idx = antrig.channel_map(rig, bank, clip)
            slots = rig.resolve(idx, int(clip["sample"][0]["quats"]))
            want = {0: "Neck.q", 3: "Wep_Root.q", 96: "Wep_Root.t"}
            got = {k: (slots[k] if slots else None) for k in want}
            ok = slots is not None and got == want
            print("spot check   ak74 M26_Fire Anim channels %s -> %s  %s"
                  % (sorted(want), [got[k] for k in sorted(want)], "PASS" if ok else "FAIL"))

            if ok and "LeftHandThumb2.q" not in (slots or []):
                print("FAIL         the clip drives no LeftHandThumb2")
                ok = False

    if not ok:
        return 1

    # 4. values unchanged.
    by_id = dict(source)

    values = changed = matched = 0

    for clip in back:
        key = (clip.get("partition"), clip.get("index"))
        orig = by_id.get(key)

        if orig is None:
            print("FAIL         no source clip for %s" % (key,))
            return 1

        matched += 1
        a, b = orig["sample"], clip["sample"]

        if len(a) != len(b):
            print("FAIL         %s: %d frames out, %d back" % (key, len(a), len(b)))
            changed += 1
            continue

        for fa, fb in zip(a, b):
            for va, vb in zip(fa["values"], fb["values"]):
                for i in range(4):
                    values += 1

                    if _f32(va[i]) != _f32(vb[i]):
                        changed += 1

    print("values       %d clip(s) matched, %d float(s) compared, %d changed  -> %s"
          % (matched, values, changed, "PASS" if changed == 0 else "FAIL"))

    if matched == 0 or values == 0:
        print("FAIL         nothing was compared")
        return 1

    return 0 if changed == 0 else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
