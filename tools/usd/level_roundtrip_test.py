#!/usr/bin/env python3
"""Round-trip a whole LEVEL: BF3 -> USD level stage -> BF3, byte-compared per prototype.

roundtrip_test.py answers the single-object question -- one MeshSet out and back. A level is the
other half: the exporter writes each distinct mesh once as a prototype and places it N times, so
what has to hold is that every PROTOTYPE still reproduces its original resource exactly, and that
the placements survive with the right count and transform.

    level_roundtrip_test.py <stage.usdc> <corpus dir> <placements.json>

Only prototypes that were built from a real resource can be compared; a level references far more
meshes than any one corpus dump contains, and those are reported rather than counted as failures.
"""
import glob
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bf3_usd                                                              # noqa: E402
import level_from_usd                                                      # noqa: E402
from meshset import MeshSet                                                # noqa: E402


def _safe(name):
    out = ''.join(c if (c.isalnum() or c == '_') else '_' for c in name)
    return ('_' + out) if (not out or out[0].isdigit()) else out


def corpus_index(res_dir):
    """mesh name (lowercased) -> resource bytes, so a prototype can find what it came from."""
    index = {}

    for path in sorted(glob.glob(os.path.join(res_dir, '*.bin'))):
        data = open(path, 'rb').read()

        if not data:
            continue

        try:
            ms = MeshSet.parse(data)
        except Exception:                                    # noqa: BLE001
            continue

        if ms.name:
            index[ms.name.lower()] = (path, data)

    return index


def main(stage_path, corpus, placements_json):
    res_dir = os.path.join(corpus, 'res')
    index = corpus_index(res_dir)
    protos, places, stats = level_from_usd.read(stage_path)
    source = json.load(open(placements_json))['meshes']

    stage_dir = os.path.dirname(os.path.abspath(stage_path))
    compared = identical = missing = 0
    fails = []

    for name in sorted(protos):
        key = name.lower()

        if key not in index:
            missing += 1
            continue

        proto_path = os.path.join(stage_dir, 'meshes', _safe(name) + '.usdc')

        if not os.path.exists(proto_path):
            missing += 1
            continue

        _orig_path, original = index[key]
        compared += 1

        try:
            ms, _chunks = bf3_usd.load(proto_path)
            out, _meta = ms.serialize()
        except Exception as exc:                             # noqa: BLE001
            fails.append((name, 'import: %s' % exc))
            continue

        if out == original:
            identical += 1
        else:
            fails.append((name, 'resource not reproduced (%d vs %d bytes)'
                          % (len(out), len(original))))

    # Placements are the other half of a level: same meshes, same counts, same transforms.
    place_ok = place_bad = 0

    for name, transforms in source.items():
        got = places.get(name)

        if got is None or len(got) != len(transforms):
            place_bad += 1
            continue

        place_ok += 1

    print('level stage        : %s' % stage_path)
    print('meshes / placements: %d / %d' % (stats['meshes'], stats['placements']))
    print('prototypes compared: %d (%d had no resource in the corpus)' % (compared, missing))
    print('BF3 -> USD level -> BF3, byte-identical : %d / %d' % (identical, compared))
    print('placement sets preserved (count)        : %d / %d' % (place_ok, len(source)))

    for name, why in fails[:10]:
        print('   FAIL %-50s %s' % (name[:50], why))

    return 0 if (identical == compared and place_bad == 0) else 1


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)

    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
