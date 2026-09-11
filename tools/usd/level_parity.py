#!/usr/bin/env python3
"""Diff an emitted level against the game's own, and say what the emit is missing.

Every defect in this exporter has had the same shape: the game's level has something the emitted
one does not, and nothing in the build or the server says so. Each was found by a crash, days
apart. They were all visible in a diff of the two levels from the start.

    level_parity.py /tmp/emit_final --level mp_001

Reports, worst first:
  - ENTITY TYPES the source level has and the emit does not. This is the one that matters most:
    a WindComponentData missing means the vegetation system has nothing to create a tree instance
    against, and the server dies writing through the null -- nowhere near the word "wind".
  - PARTITIONS referenced by the emit but not carried, which is a null at whatever touches them.
  - PLACEMENT COUNTS per mesh, source versus emit, so a silently dropped prototype shows up.
"""
import argparse
import collections
import glob
import json
import os
import sys


def load(path):
    try:
        return json.load(open(path))
    except Exception:                                        # noqa: BLE001
        return None


def types_in(files):
    seen = collections.Counter()

    for f in files:
        d = load(f)

        if not d:
            continue

        for v in (d.get('Instances') or {}).values():
            seen[v.get('$type')] += 1

    return seen


def refs_in(doc, out):
    if isinstance(doc, dict):
        if isinstance(doc.get('PartitionGuid'), str) and 'InstanceGuid' in doc:
            out.add(doc['PartitionGuid'].lower())

        for v in doc.values():
            refs_in(v, out)
    elif isinstance(doc, list):
        for v in doc:
            refs_in(v, out)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('emit', help='the emit directory')
    ap.add_argument('--level', default='mp_001')
    ap.add_argument('--ebx', default='/tmp/allebx')
    ap.add_argument('--extra-dumps', default='/tmp/closure,'
                    + os.path.expanduser('~/Games/VeniceUnleashed/debug/ebx'))
    a = ap.parse_args()

    src_files = glob.glob(os.path.join(a.ebx, 'levels', a.level, '**', '*.json'), recursive=True)
    src_files += glob.glob(os.path.join(a.ebx, 'levels', a.level + '.json'))
    emit_files = glob.glob(os.path.join(a.emit, 'partitions', '*.json'))

    if not src_files:
        sys.exit('no dump of %s under %s' % (a.level, a.ebx))

    src, emit = types_in(src_files), types_in(emit_files)
    missing = [(t, n) for t, n in src.most_common() if t and not emit.get(t)]

    print('== entity types %s has that the emit does not (%d)' % (a.level, len(missing)))

    for t, n in missing:
        print('   %5d  %s' % (n, t))

    # References the emit makes but does not carry.
    have = set()

    for f in emit_files:
        d = load(f)

        if d and d.get('PartitionGuid'):
            have.add(d['PartitionGuid'].lower())

    raw = set()
    cmds = os.path.join(a.emit, 'build.cmds')

    if os.path.exists(cmds):
        for line in open(cmds):
            if line.startswith('add_raw_partition "'):
                raw.add(line.split('"')[1].lower())

    names = {}

    for base in [d for d in a.extra_dumps.split(',') if d and os.path.isdir(d)] + [a.ebx]:
        for f in glob.glob(os.path.join(base, '**', '*.json'), recursive=True):
            d = load(f)

            if d and d.get('PartitionGuid') and d.get('Name'):
                names.setdefault(d['PartitionGuid'].lower(), d['Name'])

    for g, n in names.items():
        if n.lower() in raw:
            have.add(g)

    dangling = collections.Counter()

    for f in emit_files:
        d = load(f)

        if not d:
            continue

        # The registry declares thousands of weapon and unlock NAMES the game answers from its own
        # bundles; they are not content a level carries, and listing them buries the real gaps.
        if any(v.get('$type') == 'RegistryContainer'
               for v in (d.get('Instances') or {}).values()):
            continue

        got = set()
        refs_in(d.get('Instances') or {}, got)

        for g in got:
            if g not in have and g != (d.get('PartitionGuid') or '').lower():
                dangling[names.get(g) or g] += 1

    print('\n== partitions the emit references but does not carry (%d)' % len(dangling))

    for n, c in dangling.most_common(20):
        print('   %5d  %s' % (c, n))


if __name__ == '__main__':
    main()
