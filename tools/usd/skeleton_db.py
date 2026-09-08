#!/usr/bin/env python3
"""Carry the level's AnimatedSkeletonDatabase, which is what makes its animations resolvable.

A level partition holds one AnimatedSkeletonDatabase: the registry of skeletons, ragdolls and
per-item bone data the animation system reads. Its Items name a skeleton Asset, a SoldierCollision,
an optional Ragdoll and the SpecialBones a weapon attaches to (`Wep_Root`, `Head`, `Neck`, ...).

The exported level carried none of it -- it is a level-scope singleton, not a world-part object, so
it never passed WORLD_PART_TYPES and nothing else looked for it. Without it the level declares no
skeletons at all, which is "animations" missing in the same way weapons were: named nowhere rather
than named and broken.

Emits the record into the destination LEVEL partition (not the sub-world), which is where the game
keeps it, and reports the external partitions it references so they can be carried alongside --
those resolve the same way the registry's weapons do, via add_raw_partition.

STATUS, measured
----------------
The five referenced partitions are SAFE to carry raw: with them in the bundle and the record left
out, the server loads normally (weapons still resolve 60/60, teams intact).

Adding the RECORD alongside BARE partitions kills the server silently -- exit 0, during load, no
error. Isolated by testing record and partitions independently.

The cause is the dependency closure, and the fix is to give them one. Carried with
`reference_existing_partition` instead of `add_raw_partition`, the record loads fine: server LOADED,
ENTITY static=799, TEAMENT team=2 autoteam=1, weapons still 60/60, and the superbundle grows only
58.16 MB -> 59.34 MB. That is cheap -- the same command on the gamemode level setup cost 1.4 GB, so
closure is worth measuring per asset rather than avoiding.

The rule this establishes: content the engine INSTANTIATES or resolves eagerly at load needs its
closure; content merely looked up by name (weapons, unlocks) is fine as a bare partition. The
database's Items name skeleton Assets, a SoldierCollision and a Ragdoll, and carrying those
partitions is not the same as carrying what they themselves depend on.

NOT a universal fix: the 9 invisible-collision PLACEMENTS in the gamemode sub-level still die with
closure, so a placed physics blueprint fails for a further reason -- most likely the Havok collision
this export does not rebuild.
"""
import argparse
import collections
import glob
import json
import os
import sys


def find_level(ebx_dir):
    """The source LEVEL partition: holds a LevelData and the skeleton database."""
    for f in glob.glob(os.path.join(ebx_dir, '**', '*.json'), recursive=True):
        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        types = {i.get('$type') for i in (doc.get('Instances') or {}).values()}

        if 'LevelData' in types and 'AnimatedSkeletonDatabase' in types:
            return doc, f

    return None, None


def external_refs(record, own_guid):
    """Partition guids the record points at, other than its own partition."""
    out = set()

    def walk(node):
        if isinstance(node, dict):
            pg = node.get('PartitionGuid')

            if pg and node.get('InstanceGuid') and pg.lower() != (own_guid or '').lower():
                out.add(pg.lower())

            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(record)
    return sorted(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ebx_dir', help='dump of the SOURCE level')
    ap.add_argument('level_json', help='the DESTINATION level partition json to add it to')
    ap.add_argument('--closure', default='/tmp/closure',
                    help='closure dump (files named <partition guid>.json) to resolve ref names')
    ap.add_argument('--add-record', action='store_true', default=True,
                    help='write the AnimatedSkeletonDatabase into the level partition (default). '
                         'Its referenced partitions must be carried with '
                         'reference_existing_partition, not add_raw_partition: with bare partitions '
                         'the record kills the server silently at load.')
    ap.add_argument('--no-add-record', dest='add_record', action='store_false',
                    help='ship the skeleton partitions only, without the database record')
    args = ap.parse_args()

    src, path = find_level(args.ebx_dir)

    if src is None:
        print('no level partition with an AnimatedSkeletonDatabase under %s' % args.ebx_dir)
        return 1

    db = {g: i for g, i in (src.get('Instances') or {}).items()
          if i.get('$type') == 'AnimatedSkeletonDatabase'}

    if not db:
        return 1

    added = 0

    if args.add_record:
        dst = json.load(open(args.level_json))

        for guid, rec in db.items():
            if guid not in dst['Instances']:
                dst['Instances'][guid] = rec
                added += 1

        json.dump(dst, open(args.level_json, 'w'), indent=1)

    guid, rec = next(iter(db.items()))
    items = rec.get('Items') or []
    bones = collections.Counter()

    for it in items:
        for b in (it.get('SpecialBones') or []):
            bones[b] += 1

    print('AnimatedSkeletonDatabase: %s'
          % ('wrote %d instance into %s' % (added, os.path.basename(args.level_json))
             if args.add_record else 'record NOT written (--add-record is off; it kills the server)'))
    print('  %d skeleton item(s), %d ragdoll(s), %d distinct special bone(s)'
          % (len(items), len(rec.get('Ragdolls') or []), len(bones)))

    refs = external_refs(rec, src.get('PartitionGuid'))
    names = []

    for pg in refs:
        p = os.path.join(args.closure, '%s.json' % pg)

        if os.path.exists(p):
            try:
                n = json.load(open(p)).get('Name')
            except Exception:                                # noqa: BLE001
                n = None

            if n:
                names.append(n)

    print('  references %d external partition(s), %d resolvable by name:' % (len(refs), len(names)))

    for n in names:
        print('     %s' % n)

    return 0


if __name__ == '__main__':
    sys.exit(main())
