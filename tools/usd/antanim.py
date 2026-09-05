#!/usr/bin/env python3
"""Ant animation clips as UsdSkelAnimation.

Rime decodes BF3's Ant clips (5204 checked, 0 failures) but they had no home in USD, so character
and weapon animation was the one thing that could be read and not authored.

The obstacle is that a clip's DOF order is NOT the skeleton's bone order -- only 441 of 2955 clips
even have a quaternion count matching some skeleton, so a positional mapping would be a guess. The
mapping lives in the actor/AntAnimationSetAsset chain (SkeletonAsset + ClipAssetIndices).

So: when a skeleton binding IS known the joints carry their real names, and when it is not the
joints are named by DOF index. Either way the VALUES are authored as real time samples a DCC can
edit and scrub, and the decode metadata rides in customData so a clip nobody touched rebuilds
exactly. Naming a channel dof037 is honest about what is unknown; dropping the clip is not.
"""
import json
import os

from pxr import Gf, Sdf, Usd, UsdGeom, UsdSkel

BF3 = 'bf3'


def _quat(v):
    # BF3 stores xyzw; UsdSkel wants w first.
    return Gf.Quatf(float(v[3]), Gf.Vec3f(float(v[0]), float(v[1]), float(v[2])))


def author(stage, root, bank, joint_names=None):
    """Write every decoded clip in a bank dump as a UsdSkelAnimation. -> clip count."""
    scope = UsdGeom.Scope.Define(stage, root.GetPath().AppendChild('Animation'))
    n = 0

    for obj in (bank.get('objects') or ()):
        samples = obj.get('sample') or []

        # Not every asset type samples the same way -- RawAnimationAsset/FrameAnimationAsset store
        # a flat list of floats rather than per-frame records, so check the shape before trusting it.
        if not samples or not isinstance(samples[0], dict) or 'values' not in samples[0]:
            continue

        nq = int(samples[0].get('quats') or 0)
        total = len(samples[0].get('values') or [])
        ntr = max(0, total - nq)

        name = (obj.get('name') or ('clip%04d' % n))
        safe = ''.join(c if (c.isalnum() or c == '_') else '_' for c in name)
        path = scope.GetPath().AppendChild(safe if not safe[:1].isdigit() else '_' + safe)
        anim = UsdSkel.Animation.Define(stage, path)

        joints = (joint_names or [])[:nq] or ['dof%03d' % i for i in range(nq)]
        anim.CreateJointsAttr([Sdf.Path(j).name if '/' in j else j for j in joints])

        rot = anim.CreateRotationsAttr()
        tr = anim.CreateTranslationsAttr()
        sc = anim.CreateScalesAttr()

        for s in samples:
            t = float(s.get('frame', 0))
            vals = s.get('values') or []
            rot.Set([_quat(v) for v in vals[:nq]], Usd.TimeCode(t))
            tr.Set([Gf.Vec3f(*[float(c) for c in v[:3]]) for v in vals[nq:nq + ntr]],
                   Usd.TimeCode(t))
            sc.Set([Gf.Vec3h(1.0, 1.0, 1.0)] * nq, Usd.TimeCode(t))

        prim = anim.GetPrim()
        prim.SetCustomDataByKey(BF3 + 'Clip', json.dumps(
            {k: obj.get(k) for k in ('type', 'name', 'codecType', 'animId', 'endFrame',
                                     'additive', 'trimOffset', 'numKeys', 'cycle',
                                     'keyTimesCount', 'dataCount')}))
        prim.SetCustomDataByKey(BF3 + 'DofLayout', json.dumps({'quats': nq, 'vec3': ntr}))
        n += 1

    return n


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
        anim = UsdSkel.Animation(prim)
        rot, tr = anim.GetRotationsAttr(), anim.GetTranslationsAttr()
        frames = []

        for t in sorted({float(x) for x in (rot.GetTimeSamples() or [])}):
            qs = rot.Get(Usd.TimeCode(t)) or []
            ts = tr.Get(Usd.TimeCode(t)) or []
            vals = [[float(q.GetImaginary()[0]), float(q.GetImaginary()[1]),
                     float(q.GetImaginary()[2]), float(q.GetReal())] for q in qs]
            vals += [[float(v[0]), float(v[1]), float(v[2]), 0.0] for v in ts]
            frames.append({'frame': t, 'quats': layout.get('quats', len(qs)), 'values': vals})

        meta['sample'] = frames
        out.append(meta)

    return out
