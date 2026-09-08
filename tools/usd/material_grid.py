#!/usr/bin/env python3
"""Carry the source level's MATERIAL GRID, which is what gives a level destruction and impact sound.

A level's per-material responses -- what happens when a bullet hits concrete, what sound wood makes
when it breaks, which decal a surface takes, how far a round penetrates -- are not attached to the
meshes. They live in one partition, `levels/<lvl>/<lvl>/materialgrid_win32/grid`, as a table of
MaterialRelation records that the damage, audio and effect systems read at runtime.

MEASURED on mp_001: 1436 instances --

    MaterialRelationDamageData              466
    MaterialRelationSoundData               310
    MaterialRelationEffectData              298
    MaterialRelationPenetrationData         172
    MaterialRelationDecalData               135
    MaterialRelationVehicleData              23
    MaterialPropertySoundData                21
    MaterialRelationTerrainDestructionData    9

The exported level shipped a grid containing exactly ONE instance -- a LevelData stub -- so it had
no per-material destruction, no impact audio, no effect or decal responses at all. Nothing errors:
the systems simply find no relation for a material and do nothing, which reads as "the level is
quiet and nothing breaks" rather than as a missing table.

This rewrites the source grid under the destination level's name. The records reference materials
by guid, and those are game-wide assets rather than level-local, so they resolve unchanged.
"""
import argparse
import collections
import glob
import json
import os
import sys

GRID_SUFFIX = '/materialgrid_win32/grid'


def find_grid(ebx_dir, level=None):
    """The source level's material grid partition, found by name shape."""
    for f in glob.glob(os.path.join(ebx_dir, '**', '*.json'), recursive=True):
        try:
            d = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        name = d.get('Name') or ''

        if name.endswith(GRID_SUFFIX) and (level is None or level in name):
            return d, f

    return None, None


def grid_from_stage(stage_path):
    """Rebuild the grid partition from a USD stage, so DCC edits to it actually ship.

    Reading the source EBX means an edit made in Blender is silently ignored: the build carries the
    ORIGINAL relations no matter what the artist changed, which is "referenced" without being
    "editable". Every record is on the stage in a prim's `bf3Entity` customData, complete, so the
    partition can be rebuilt from what the DCC saved.
    """
    from pxr import Usd                                      # imported lazily: only this path needs USD

    stage = Usd.Stage.Open(stage_path)

    if stage is None:
        return None

    instances = {}
    src_name = None

    for prim in stage.Traverse():
        blob = prim.GetCustomData().get('bf3Entity')

        if not blob:
            continue

        try:
            rec = json.loads(blob) if isinstance(blob, str) else dict(blob)
        except Exception:                                    # noqa: BLE001
            continue

        part = rec.get('partition') or ''

        if not part.endswith(GRID_SUFFIX):
            continue

        src_name = part
        guid = rec.get('instance')
        body = rec.get('record')

        if guid and isinstance(body, dict):
            instances[guid] = body

    if not instances:
        return None

    return {'Name': src_name, 'Instances': instances,
            'PartitionGuid': None, 'PrimaryInstanceGuid': None}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('ebx_dir', help='dump of the SOURCE level (e.g. /tmp/mp001ebx)')
    ap.add_argument('out', help='destination .json')
    ap.add_argument('--level', default='levels/realitymod/realitymod',
                    help='destination level path (default: %(default)s)')
    ap.add_argument('--stage', help='USD stage to take the relations FROM, so edits made in a DCC '
                                    'are what ship instead of the untouched source records')
    args = ap.parse_args()

    if args.stage:
        grid, path = grid_from_stage(args.stage), args.stage

        if grid is None:
            print('no material grid found on %s -- falling back to the source dump' % args.stage)
            grid, path = find_grid(args.ebx_dir)
        else:
            # The stage carries the records but not the partition's own guids -- take those from the
            # source dump. Writing a partition with a null PartitionGuid is not a partition.
            src, _ = find_grid(args.ebx_dir)

            if src:
                grid['PartitionGuid'] = src.get('PartitionGuid')
                grid['PrimaryInstanceGuid'] = src.get('PrimaryInstanceGuid')
    else:
        grid, path = find_grid(args.ebx_dir)

    if grid is None:
        print('no material grid found under %s' % args.ebx_dir)
        return 1

    instances = grid.get('Instances') or {}
    counts = collections.Counter(i.get('$type') for i in instances.values())

    # A grid holding only a LevelData stub is the empty case this tool exists to replace; carrying
    # it forward would be a no-op dressed up as a fix.
    if len(instances) <= 1:
        print('source grid at %s holds %d instance(s) -- nothing to carry' % (path, len(instances)))
        return 1

    grid['Name'] = args.level + GRID_SUFFIX
    json.dump(grid, open(args.out, 'w'), indent=1)

    print('material grid  %d instance(s) -> %s' % (len(instances), grid['Name']))

    for t, c in counts.most_common():
        print('   %-42s %5d' % (t, c))

    return 0


if __name__ == '__main__':
    sys.exit(main())
