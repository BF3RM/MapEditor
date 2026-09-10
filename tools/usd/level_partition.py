#!/usr/bin/env python3
"""Derive the emitted level partition from the SOURCE level, instead of maintaining one by hand.

The level partition the server loads was a file in /tmp that nothing generated. Whatever it did not
happen to contain, the level did not have -- and what it did not contain was most of LevelData.
MEASURED against the game's own MP_001: 17 of 43 fields differed, and one of them was
`LevelDescription.Components`, empty where the game has five. With it empty the engine never
registers teams, never registers a game, and the server exits seconds after the level loads:

    Registering team 0 with  0 player slots   <- none of this happened
    Registering team 1 with 16 player slots
    Registering a new game with Zeus...

So derive it. LevelData comes from the source level verbatim -- every flag, every component, every
reference -- and only what MUST differ is replaced: the partition's name, and the Objects list,
which is ours because the world parts and sub-levels are ours.

    level_partition.py <source level.json> <current partition.json> <out.json>

`current` supplies the half that is genuinely ours: the world-part and sub-world reference objects,
the RegistryContainer, and the primary instance guid. Everything else comes from the source.

Anything LevelData points at INSIDE this partition is copied across, which is how the components
and the interface descriptor arrive. Anything it points at outside is left alone and reported --
those are partitions the bundle has to carry separately, and saying which ones is more use than
silently dropping the reference.
"""
import argparse
import glob
import json
import os
import sys


def _refs(node, out):
    """Every {PartitionGuid, InstanceGuid} anywhere under `node`."""
    if isinstance(node, dict):
        if node.get('PartitionGuid') and node.get('InstanceGuid'):
            out.append(node)

        for value in node.values():
            _refs(value, out)
    elif isinstance(node, list):
        for value in node:
            _refs(value, out)

    return out


def _owner(guid, names):
    return (names.get(guid) or '').lower()


def derive(source, current, dest_name=None, source_names=None):
    src_instances = source.get('Instances') or {}
    cur_instances = current.get('Instances') or {}

    level = next((i for i in src_instances.values() if i.get('$type') == 'LevelData'), None)
    ours = next((i for i in cur_instances.values() if i.get('$type') == 'LevelData'), None)

    if level is None or ours is None:
        raise SystemExit('both partitions must hold a LevelData')

    partition_guid = current['PartitionGuid']
    source_names = source_names or {}
    # e.g. 'levels/mp_001/' -- the source level's own tree.
    source_tree = '/'.join((source.get('Name') or '').lower().split('/')[:2]) + '/'
    level = json.loads(json.dumps(level))                    # copy; the source is not ours to edit

    # The two things that are genuinely ours.
    level['Name'] = dest_name or ours.get('Name')
    level['Objects'] = ours.get('Objects') or []

    # The registry is ours: it lists what THIS bundle carries, not what MP_001 carried.
    for field in ('RegistryContainer',):
        if ours.get(field) is not None:
            level[field] = ours[field]

    instances = {current['PrimaryInstanceGuid']: level}

    # Our own objects: world parts, sub-levels, the registry, and anything they name locally.
    for guid, inst in cur_instances.items():
        if inst.get('$type') == 'LevelData':
            continue

        instances[guid] = inst

    # Whatever LevelData reaches INSIDE this partition -- components, the interface descriptor,
    # the skeleton database -- travels with it. Followed transitively: a component can name
    # another local instance.
    pending = [r for r in _refs(level, []) if r['PartitionGuid'].lower() == partition_guid.lower()]
    external = {}
    seen = set()

    while pending:
        ref = pending.pop()
        guid = ref['InstanceGuid']

        if guid in seen or guid in instances:
            seen.add(guid)
            continue

        seen.add(guid)
        inst = src_instances.get(guid)

        if inst is None:
            continue

        # NOT the source level's own object graph.
        #
        # Following every reference out of LevelData drags in MP_001's 34 world parts and 8
        # sub-levels alongside our 2 -- and a SubWorldReferenceObjectData names a BUNDLE, so the
        # engine then waits forever for eight bundles this build never makes. The object graph is
        # the one part of a level that is definitively ours; everything else travels.
        if str(inst.get('$type', '')).endswith('ReferenceObjectData'):
            continue

        instances[guid] = inst

        for nested in _refs(inst, []):
            if nested['PartitionGuid'].lower() == partition_guid.lower():
                pending.append(nested)
            else:
                external[nested['PartitionGuid'].lower()] = nested.get('InstanceGuid')

    # PRUNE the lists that describe objects we replaced.
    #
    # Copying LevelData verbatim also copies EventConnections, LinkConnections and
    # PropertyConnections -- and those wire up MP_001's own 34 world parts and 8 sub-levels, which
    # are exactly the objects we swapped out for ours. Left in, they point at instances that are
    # not in the partition any more, and the level dies before it loads: MEASURED, the server
    # exits rc=0 with nothing logged at all, earlier than the failure this tool was written for.
    #
    # An entry survives if every LOCAL instance it names is present. A reference to another
    # partition is somebody else's problem -- reported below, so the bundle can carry it.
    pruned = {}

    for field, value in list(level.items()):
        if not isinstance(value, list) or not value:
            continue

        keep = []

        for entry in value:
            local = [r['InstanceGuid'] for r in _refs(entry, [])
                     if r['PartitionGuid'].lower() == partition_guid.lower()]

            # And nothing reaching into the SOURCE LEVEL's own namespace.
            #
            # levels/mp_001/mp_001/layer4_buildings and its fourteen siblings are MP_001's world
            # parts. They arrive through fields like EmitterExclusionVolumes, and carrying them
            # would ship the game's entire level alongside ours -- which is duplication, not
            # parity. A reference into the source level's own tree is object graph; a reference to
            # a shared asset (a skeleton, a sound bank, the minimap) is content this level needs.
            foreign = any(_owner(r['PartitionGuid'].lower(), source_names).startswith(source_tree)
                          for r in _refs(entry, [])
                          if r['PartitionGuid'].lower() != partition_guid.lower())

            if all(g in instances for g in local) and not foreign:
                keep.append(entry)

        if len(keep) != len(value):
            pruned[field] = len(value) - len(keep)
            level[field] = keep

    for ref in _refs(level, []):
        if ref['PartitionGuid'].lower() != partition_guid.lower():
            external[ref['PartitionGuid'].lower()] = ref.get('InstanceGuid')

    return {
        'pruned': pruned,
        'PartitionGuid': partition_guid,
        'PrimaryInstanceGuid': current['PrimaryInstanceGuid'],
        'Name': level['Name'],
        'Instances': instances,
    }, external


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source', help="the game level's own partition, dumped as JSON")
    ap.add_argument('current', help='the partition we ship now, for the half that is ours')
    ap.add_argument('out', help='where to write the derived partition')
    ap.add_argument('--closure', default='/tmp/closure',
                    help='closure dump, to tell a shared asset from the source level\'s own tree')
    ap.add_argument('--name', help='destination partition name (default: keep the current one)')
    args = ap.parse_args()

    source = json.load(open(args.source))
    current = json.load(open(args.current))
    # guid -> partition name, so a reference can be told from its owner.
    names = {}

    for f in glob.glob(os.path.join(args.closure, '*.json')):
        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        if doc.get('PartitionGuid') and doc.get('Name'):
            names[doc['PartitionGuid'].lower()] = doc['Name']

    derived, external = derive(source, current, args.name, names)

    json.dump({k: v for k, v in derived.items() if k != 'pruned'},
              open(args.out, 'w'), indent=1)

    level = derived['Instances'][derived['PrimaryInstanceGuid']]
    src_level = next(i for i in source['Instances'].values() if i.get('$type') == 'LevelData')
    same = sum(1 for k in set(level) | set(src_level)
               if level.get(k, '<a>') == src_level.get(k, '<b>'))

    print('%s: %d instance(s), LevelData matches the source on %d of %d field(s)'
          % (derived['Name'], len(derived['Instances']), same, len(set(level) | set(src_level))))
    if derived.get('pruned'):
        print('  pruned entries naming instances we do not have: %s' % derived['pruned'])

    print('  references %d partition(s) outside this one; the bundle must carry them:'
          % len(external))

    for guid in sorted(external):
        print('     %s' % guid)

    return 0


if __name__ == '__main__':
    sys.exit(main())
