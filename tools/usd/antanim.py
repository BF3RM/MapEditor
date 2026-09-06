#!/usr/bin/env python3
"""Ant animation clips as UsdSkelAnimation.

Rime decodes BF3's Ant clips (5204 checked, 0 failures) but they had no home in USD, so character
and weapon animation was the one thing that could be read and not authored.

A clip's DOF order is NOT the skeleton's bone order, so a positional mapping would be a guess.
The real mapping is `AnimationAsset.ChannelToDofAsset` -> a DOF set in the static Ant package, and
`antrig` resolves it: channel 37 of an ak74 clip is `LeftHandThumb2`, not `dof037`. Where the map
does not decide a single reading the joints keep indexed names -- naming a channel dof037 is
honest about what is unknown, and inventing a bone name is not.

The value layout is the one thing that must not move: rotations hold the quaternion channels in
channel order, translations the vector channels, and `bf3DofChannels` records which joint each
channel sits on, so a clip nobody touched rebuilds exactly.

The DCT codec hands every DOF back as a Vector4 whatever its kind, and a clip's trailing
`NumFloatVec` channels really do use the fourth float -- measured, 213 of them across the 85
weapon banks, all in the last two vector channels of a 62-channel group. A Vec3f translation
drops that float, so it rides alongside in `bf3:dofW` and the trip back is exact.
"""
import json
import os
import struct

from pxr import Gf, Sdf, Usd, UsdGeom, UsdSkel, Vt

BF3 = 'bf3'


def _f32(x):
    # USD stores rotations and translations as float32; a bank dump is JSON, so its numbers arrive
    # as doubles. Comparing the two without this rounds every clip "changed" and an untouched
    # stage would rewrite the whole game's animation.
    return struct.unpack('<f', struct.pack('<f', float(x)))[0]


def _quat(v):
    # BF3 stores xyzw; UsdSkel wants w first.
    return Gf.Quatf(float(v[3]), Gf.Vec3f(float(v[0]), float(v[1]), float(v[2])))


def _safe(name):
    out = ''.join(c if (c.isalnum() or c == '_') else '_' for c in name)
    return out if out and not out[0].isdigit() else '_' + out


def channel_joints(names, nq, total):
    """Slot names -> (joint list, joint index per channel), or None if the names collide.

    A bone with both a rotation and a translation channel is ONE joint -- that is the whole point
    of UsdSkel -- so `Hips.q` and `Hips.t` merge, while `LeftFoot.vel` stays its own pseudo-joint
    rather than being written into LeftFoot's translation.
    """
    import antrig

    joints = []
    index = {}
    per_channel = []

    for c in range(total):
        joint = _safe(antrig.joint_of(names[c])[0])

        if joint not in index:
            index[joint] = len(joints)
            joints.append(joint)

        per_channel.append(index[joint])

    # Two channels of the SAME kind landing on one joint would overwrite each other, and the trip
    # back would return the survivor twice. Refuse the naming rather than lose a curve.
    seen = set()

    for c, j in enumerate(per_channel):
        key = (j, c < nq)

        if key in seen:
            return None

        seen.add(key)

    return joints, per_channel


def author(stage, root, bank, rig=None):
    """Write every decoded clip in a bank dump as a UsdSkelAnimation. -> (clips, named clips)."""
    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Animation'))
    n = 0
    named = 0

    try:
        import antrig
    except ImportError:                                      # noqa: BLE001
        antrig = None

    for obj in (bank.get('objects') or ()):
        samples = obj.get('sample') or []

        # Not every asset type samples the same way -- RawAnimationAsset/FrameAnimationAsset store
        # a flat list of floats rather than per-frame records, so check the shape before trusting it.
        if not samples or not isinstance(samples[0], dict) or 'values' not in samples[0]:
            continue

        nq = int(samples[0].get('quats') or 0)
        total = len(samples[0].get('values') or [])

        # The clip's channels, named where the rig decides them. The map is longer than the value
        # array when the clip carries scalar DOFs the decoder does not return, so it is sliced.
        slots = None

        if rig is not None and antrig is not None:
            idx = antrig.channel_map(rig, bank, obj)

            if idx is not None and len(idx) >= total:
                slots = rig.resolve(idx, nq)

        layout = channel_joints(slots, nq, total) if slots else None

        if layout is None:
            layout = (['dof%03d' % c for c in range(total)], list(range(total)))
        else:
            named += 1

        joints, per_channel = layout

        name = obj.get('objectName') or obj.get('name') or ('clip%04d' % n)
        path = scope.GetPath().AppendChild(_safe(name))

        # Bank names repeat ("Idle Anim" in two packages); a collision would silently merge clips.
        suffix = 0

        while stage.GetPrimAtPath(path):
            suffix += 1
            path = scope.GetPath().AppendChild(_safe(name) + '_%d' % suffix)

        anim = UsdSkel.Animation.Define(stage, path)
        anim.CreateJointsAttr([Sdf.Path(j).name if '/' in j else j for j in joints])

        rot = anim.CreateRotationsAttr()
        tr = anim.CreateTranslationsAttr()
        sc = anim.CreateScalesAttr()
        nj = len(joints)
        ws = []

        for s in samples:
            t = float(s.get('frame', 0))
            vals = s.get('values') or []
            rots = [Gf.Quatf(1.0, Gf.Vec3f(0.0, 0.0, 0.0))] * nj
            trs = [Gf.Vec3f(0.0, 0.0, 0.0)] * nj
            w = [0.0] * (total - nq)

            for c, v in enumerate(vals[:total]):
                if c < nq:
                    rots[per_channel[c]] = _quat(v)
                else:
                    trs[per_channel[c]] = Gf.Vec3f(*[float(x) for x in v[:3]])
                    w[c - nq] = float(v[3])

            rot.Set(rots, Usd.TimeCode(t))
            tr.Set(trs, Usd.TimeCode(t))
            sc.Set([Gf.Vec3h(1.0, 1.0, 1.0)] * nj, Usd.TimeCode(t))
            ws.append((t, w))

        if any(any(w) for _, w in ws):
            extra = anim.GetPrim().CreateAttribute('bf3:dofW', Sdf.ValueTypeNames.FloatArray)

            for t, w in ws:
                extra.Set(Vt.FloatArray(w), Usd.TimeCode(t))

        prim = anim.GetPrim()
        meta = {k: obj.get(k) for k in ('type', 'name', 'objectName', 'codecType', 'animId',
                                        'endFrame', 'additive', 'trimOffset', 'numKeys', 'cycle',
                                        'keyTimesCount', 'dataCount', 'index')}
        # Where the clip came from. Bank names and animIds both repeat across the 322 packages, so
        # (partition, index) is the only thing that identifies a clip when one is compared back.
        meta['partition'] = bank.get('partition')
        prim.SetCustomDataByKey(BF3 + 'Clip', json.dumps(meta))
        prim.SetCustomDataByKey(BF3 + 'DofLayout', json.dumps({'quats': nq, 'vec3': total - nq}))
        # Which joint each channel sits on, in channel order. Without it the trip back cannot tell
        # a merged rotation/translation pair from two separate joints.
        prim.SetCustomDataByKey(BF3 + 'DofChannels', json.dumps(per_channel))
        prim.SetCustomDataByKey(BF3 + 'DofNamed', json.dumps(bool(slots)))
        n += 1

    return n, named


def read(stage_path):
    """-> [{clip metadata, frames:[{frame, values}]}] in the shape the bank dump uses."""
    stage = Usd.Stage.Open(stage_path)
    out = []

    for prim in stage.Traverse():
        if not prim.IsA(UsdSkel.Animation):
            continue

        raw = prim.GetCustomDataByKey(BF3 + 'Clip')

        if not raw:
            continue

        meta = json.loads(raw)
        layout = json.loads(prim.GetCustomDataByKey(BF3 + 'DofLayout') or '{}')
        channels = json.loads(prim.GetCustomDataByKey(BF3 + 'DofChannels') or '[]')
        nq = int(layout.get('quats') or 0)
        anim = UsdSkel.Animation(prim)
        rot, tr = anim.GetRotationsAttr(), anim.GetTranslationsAttr()
        extra = prim.GetAttribute('bf3:dofW')
        frames = []

        for t in sorted({float(x) for x in (rot.GetTimeSamples() or [])}):
            qs = rot.Get(Usd.TimeCode(t)) or []
            ts = tr.Get(Usd.TimeCode(t)) or []
            ws = (extra.Get(Usd.TimeCode(t)) if extra else None) or []
            vals = []

            for c, j in enumerate(channels):
                if c < nq:
                    q = qs[j]
                    vals.append([float(q.GetImaginary()[0]), float(q.GetImaginary()[1]),
                                 float(q.GetImaginary()[2]), float(q.GetReal())])
                else:
                    v = ts[j]
                    w = float(ws[c - nq]) if (c - nq) < len(ws) else 0.0
                    vals.append([float(v[0]), float(v[1]), float(v[2]), w])

            frames.append({'frame': t, 'quats': nq, 'values': vals})

        meta['sample'] = frames
        meta['joints'] = [str(j) for j in (anim.GetJointsAttr().Get() or [])]
        meta['named'] = json.loads(prim.GetCustomDataByKey(BF3 + 'DofNamed') or 'false')
        out.append(meta)

    return out


def edits_from_stage(stage_path, banks, out_dir, tolerance=0.0):
    """Edited clips out of a USD stage, in the shape `patch_animation_bank` consumes.

    -> {partition: path written}. Only clips that ACTUALLY CHANGED are emitted, on the same rule
    terrain and the closure follow: an untouched stage produces no edit files at all, so a bank
    nobody touched keeps referencing the game's own resource instead of shipping a rewritten copy
    that happens to be equal.

    `banks` is {partition: bank dump}, the same dumps `author` was given -- the comparison is
    against the values the clip decoded to, not against a re-decode, so a difference here is an
    edit and nothing else.

    A DCT clip is re-encoded against its OWN bit-allocation table, which is why the frame count
    cannot change: `numKeys` frames go in and `numKeys` frames come out. A clip needing more keys
    than it shipped with has to be written as an uncompressed RawAnimationAsset, which this does
    not do -- see docs/usd-parity.md.
    """
    out = {}
    by_partition = {}

    for clip in read(stage_path):
        part = clip.get('partition')
        index = clip.get('index')
        bank = banks.get(part)

        if bank is None or index is None:
            continue

        src = None

        for obj in (bank.get('objects') or ()):
            if obj.get('index') == index:
                src = obj
                break

        if src is None or not src.get('sample'):
            continue

        before = src['sample']
        after = clip.get('sample') or []

        # A frame count that moved is not an edit this codec can express, and silently truncating
        # would ship a clip that plays the wrong length.
        if len(after) != len(before):
            raise ValueError('%s clip %d: %d frame(s) authored, %d in the bank -- re-encoding '
                             'against the clip\'s own header cannot change its length'
                             % (part, index, len(after), len(before)))

        changed = False

        for fa, fb in zip(before, after):
            for va, vb in zip(fa['values'], fb['values']):
                for i in range(4):
                    if abs(_f32(va[i]) - _f32(vb[i])) > tolerance:
                        changed = True
                        break

                if changed:
                    break

            if changed:
                break

        if not changed:
            continue

        by_partition.setdefault(part, []).append({
            'index': index,
            'frames': [[[float(x) for x in v] for v in f['values']] for f in after],
        })

    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)

    for part, clips in by_partition.items():
        path = os.path.join(out_dir, part.replace('/', '_') + '.edits.json')

        with open(path, 'w') as fp:
            json.dump({'partition': part, 'clips': clips}, fp)

        out[part] = path

    return out
