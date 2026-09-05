#!/usr/bin/env python3
"""Read a WHOLE level out of a USD stage: every prototype, and every placement of it.

usd_to_bf3.read_render answers a different question -- it takes the ONE drawable mesh a
single-object stage has and stops. A level stage is the other shape: N prototypes, each referenced
by M instanceable Xforms carrying a transform. Reading it needs the instancing followed, not the
first mesh taken.

    level_from_usd.py <stage.usdc>

Prototypes are keyed by the name the exporter recorded in `bf3:mesh`, so a prototype that came from
a BF3 MeshSet can be matched back to it, and the placements keep BF3's LinearTransform layout
(right, up, forward, trans) rather than a USD matrix.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pxr import Usd, UsdGeom                                                # noqa: E402

BF3 = 'bf3'


def _linear_transform(matrix):
    """USD row-major 4x4 -> BF3 LinearTransform (right, up, forward, trans)."""
    r = [list(row) for row in matrix]
    return [r[0][0], r[0][1], r[0][2],
            r[1][0], r[1][1], r[1][2],
            r[2][0], r[2][1], r[2][2],
            r[3][0], r[3][1], r[3][2]]


def _reference_of(prim):
    """What a placement points at, whichever way it was authored.

    Two conventions exist in this repo and both are legitimate USD: the level exporter writes each
    prototype to its own layer and references it by ASSET PATH, while the dust2 stage keeps its
    prototypes in the same file and references them by PRIM PATH. A reader that only understands
    one reports the other as an empty level, which is what happened.
    """
    refs = prim.GetMetadata('references')
    items = getattr(refs, 'prependedItems', None) or getattr(refs, 'addedItems', None) or []

    for item in items:
        if item.assetPath:
            return item.assetPath, 'asset'

        if item.primPath:
            return str(item.primPath), 'prim'

    return None, None


def read(stage_path):
    """-> (prototypes, placements, stats).

    prototypes: name -> what it references (an asset path or a prim path)
    placements: name -> [LinearTransform, ...]
    """
    stage = Usd.Stage.Open(stage_path)
    prototypes, placements = {}, {}

    for prim in stage.Traverse():
        target, kind = _reference_of(prim)

        if target is None or not prim.IsA(UsdGeom.Xform):
            continue

        # Name it by whatever identifies the prototype: the group's bf3:mesh where the exporter
        # recorded one, else the referenced prim or file.
        parent = prim.GetParent()
        name = parent.GetCustomDataByKey(BF3 + ':mesh') if parent else None

        if not name:
            name = target.rsplit('/', 1)[-1].replace('.usdc', '').replace('.usda', '')

        prototypes.setdefault(name, target)
        xf = UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default())
        placements.setdefault(name, []).append(_linear_transform(xf))

    stats = {'meshes': len(prototypes), 'placements': sum(len(v) for v in placements.values()),
             'with_prototype': sum(1 for v in prototypes.values() if v),
             'inline': sum(1 for v in prototypes.values() if v and not str(v).endswith('.usdc'))}
    return prototypes, placements, stats


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    protos, places, stats = read(sys.argv[1])
    print('meshes          %d' % stats['meshes'])
    print('placements      %d' % stats['placements'])
    print('with prototype  %d' % stats['with_prototype'])

    for name in sorted(places)[:5]:
        print('   %-52s %d placement(s)' % (name[:52], len(places[name])))
