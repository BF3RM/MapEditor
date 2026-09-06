#!/usr/bin/env python3
"""Prove an edited animation curve leaves USD in the shape Rime can write back.

    tools/usd/antanim_edit_test.py [bankdir]

Defaults to /tmp/antbanks. This is the USD half of the animation writeback; the Rime half
(`check_animation_codec` / `patch_animation_bank`) proves the bytes.

Guarded on content throughout, because the failure this project keeps hitting is a test that
passes by emitting nothing:

  1. an UNTOUCHED stage must emit zero edit files -- otherwise every bank would be rewritten on
     every trip and "only what changed ships" would be a lie;
  2. one nudged channel must emit exactly one clip, in the right partition, at the right index;
  3. the value that comes out has to be the value that went in, float32 for float32;
  4. every other channel of that same clip has to come out untouched -- an edit writer that
     rebuilt the whole curve from a lossy read would pass 2 and 3 and still destroy the clip.
"""
import glob
import json
import os
import struct
import sys

from pxr import Gf, Usd, UsdGeom, UsdSkel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import antanim

BANKS = "/tmp/antbanks"
OUT = "/tmp/antanim_edits"
NUDGE = 0.25


def _f32(x):
    return struct.unpack("<f", struct.pack("<f", float(x)))[0]


def _pick(bank):
    """The first clip in a bank dump that has decoded frames AND a translation channel.

    Translation, not rotation: the DCT decoder normalises quaternions, so a nudged quat component
    comes back rescaled and comparing it to what was asked for would measure the normalisation,
    not the writeback.
    """
    for obj in (bank.get("objects") or ()):
        s = obj.get("sample") or []

        if not s or not isinstance(s[0], dict) or "values" not in s[0]:
            continue

        nq = int(s[0].get("quats") or 0)

        if len(s[0]["values"]) > nq:
            return obj, nq

    return None, 0


def main(bankdir=BANKS):
    banks = sorted(glob.glob(os.path.join(bankdir, "*.json")))

    if not banks:
        print("SKIP         no bank dumps in %s" % bankdir)
        return 0

    chosen = None

    for path in banks:
        bank = json.load(open(path))
        clip, nq = _pick(bank)

        if clip is not None:
            chosen = (bank, clip, nq)
            break

    if chosen is None:
        print("FAIL         no bank dump holds a decoded clip with a translation channel")
        return 1

    bank, clip, nq = chosen
    part = bank.get("partition")
    print("bank         %s, %d object(s)" % (part, len(bank.get("objects") or ())))
    print("clip         index %s '%s', %d frame(s), %d channel(s), %d quat(s)"
          % (clip.get("index"), clip.get("objectName"), len(clip["sample"]),
             len(clip["sample"][0]["values"]), nq))

    stage = Usd.Stage.CreateInMemory()
    world = UsdGeom.Scope.Define(stage, "/World")
    made, _ = antanim.author(stage, world, bank)
    print("authored     %d clip(s)" % made)

    if made == 0:
        print("FAIL         nothing authored")
        return 1

    tmp = "/tmp/antanim_edit.usda"
    stage.GetRootLayer().Export(tmp)

    # 1. untouched -> nothing.
    if os.path.isdir(OUT):
        for f in glob.glob(os.path.join(OUT, "*.edits.json")):
            os.remove(f)

    quiet = antanim.edits_from_stage(tmp, {part: bank}, OUT)
    print("untouched    %d edit file(s)  %s" % (len(quiet), "PASS" if not quiet else "FAIL"))

    if quiet:
        return 1

    # 2. nudge exactly one channel of one clip, in the stage.
    # One handle on the stage for the whole edit: a Stage opened only to find the prim is
    # discarded at the end of the expression and every prim it handed out expires with it.
    edited = Usd.Stage.Open(tmp)
    prim = None

    for candidate in edited.Traverse():
        raw = candidate.GetCustomDataByKey("bf3Clip")

        if raw and json.loads(raw).get("index") == clip.get("index"):
            prim = candidate
            break

    if prim is None:
        print("FAIL         the authored stage has no prim for clip %s" % clip.get("index"))
        return 1

    anim = UsdSkel.Animation(prim)
    tr = anim.GetTranslationsAttr()
    channels = json.loads(prim.GetCustomDataByKey("bf3DofChannels") or "[]")
    joint = channels[nq]
    times = sorted({float(t) for t in (tr.GetTimeSamples() or [])})

    if not times:
        print("FAIL         the authored clip has no translation samples")
        return 1

    want = None

    for t in times:
        vals = list(tr.Get(Usd.TimeCode(t)))
        v = vals[joint]
        vals[joint] = Gf.Vec3f(float(v[0]) + NUDGE, float(v[1]), float(v[2]))

        if want is None:
            want = float(v[0]) + NUDGE

        tr.Set(vals, Usd.TimeCode(t))

    edited.GetRootLayer().Export(tmp)
    print("edit         channel %d (joint %d) X += %.2f on %d frame(s)"
          % (nq, joint, NUDGE, len(times)))

    got = antanim.edits_from_stage(tmp, {part: bank}, OUT)
    print("emitted      %d edit file(s): %s" % (len(got), list(got)))

    if list(got) != [part]:
        print("FAIL         expected exactly the edited partition")
        return 1

    doc = json.load(open(got[part]))
    clips = doc.get("clips") or []

    if len(clips) != 1 or clips[0]["index"] != clip["index"]:
        print("FAIL         expected 1 clip at index %s, got %s"
              % (clip["index"], [c["index"] for c in clips]))
        return 1

    frames = clips[0]["frames"]

    if len(frames) != len(clip["sample"]):
        print("FAIL         %d frame(s) emitted, %d in the bank"
              % (len(frames), len(clip["sample"])))
        return 1

    # 3 + 4. the edit landed and nothing else moved.
    moved = untouched = wrong = 0

    for f, row in enumerate(frames):
        src = clip["sample"][f]["values"]

        for c, v in enumerate(row):
            for i in range(4):
                a, b = _f32(src[c][i]), _f32(v[i])

                if c == nq and i == 0:
                    if abs(b - (a + NUDGE)) > 1e-6:
                        wrong += 1
                    else:
                        moved += 1
                elif a == b:
                    untouched += 1
                else:
                    wrong += 1

    total = sum(len(r) * 4 for r in frames)
    print("values       %d float(s): %d carried the edit, %d unchanged, %d wrong"
          % (total, moved, untouched, wrong))

    if total == 0 or moved == 0 or untouched == 0:
        print("FAIL         nothing was compared")
        return 1

    if wrong:
        print("FAIL         %d float(s) neither the edit nor the original" % wrong)
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:2]))
