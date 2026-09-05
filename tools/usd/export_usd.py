#!/usr/bin/env python3
"""Export a BF3 MeshSet to USD, so the format can be inspected and compared outside the game.

The round-trip test already proves BF3 -> USD -> BF3 is byte-identical, but it writes to a temp file
and throws it away. This keeps the .usda, which is what you want when the question is "what does BF3
actually store" rather than "does the codec survive a round trip".

    export_usd.py <resource.meshset> <out.usda> [chunk-dir] [mvdb.json] [skeleton.json]

With a chunk directory it resolves each LOD's geometry chunk by the guid in the resource, so the
exported mesh carries real positions, normals and UVs rather than only the scaffold.

With a MeshVariationDatabase dump it also carries materials and textures, one USD variant per
BF3 mesh variation -- which is where the texture bindings actually live: a mesh's own partition
names its materials but not what they are painted with.

With a Rime `dump_skeleton` JSON it carries a UsdSkel rig: the skeleton, its joint hierarchy and
bind poses, and per-vertex joint indices and weights on every skinned subset -- which is what makes
a weapon or a character poseable in a DCC rather than a frozen lump.
"""
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bf3_usd                       # noqa: E402
from meshset import MeshSet          # noqa: E402


def main(res_path, out_path, chunk_dir=None, mvdb_path=None, skel_path=None):
    ms = MeshSet.parse(open(res_path, 'rb').read())
    chunks = {}
    missing = []

    if chunk_dir:
        for i, lod in enumerate(ms.lods):
            cid = getattr(lod, 'data_chunk_id', None)

            if not cid:
                continue

            name = '%s.chunk' % uuid.UUID(bytes_le=cid)
            path = os.path.join(chunk_dir, name)

            if os.path.exists(path):
                chunks[i] = open(path, 'rb').read()
            else:
                missing.append(name)

    variations = None

    if mvdb_path:
        mv = json.load(open(mvdb_path)).get('meshes', {})
        variations = mv.get(ms.name.lower())

        if variations is None:
            print('note: %s is not in %s; exporting without materials'
                  % (ms.name, os.path.basename(mvdb_path)))

    skeleton = None

    if skel_path:
        import skeleton as SK
        skeleton = SK.load_dump(skel_path)
        matched, total, bad = SK.resolve(ms, skeleton)
        print('skeleton    %s, %d/%d bone hashes resolved%s'
              % (skeleton['partition'], matched, total,
                 '' if not bad else '  MISMATCHES: %s' % bad[:3]))

        if total and matched == 0:
            print('note: that skeleton accounts for none of this mesh\'s bones; exporting '
                  'without it')
            skeleton = None

    if os.path.exists(out_path):
        os.remove(out_path)

    bf3_usd.export(ms, chunks, out_path, variations=variations, skeleton=skeleton)

    print('name        %s' % (ms.name or '(unnamed)'))
    print('lods        %d' % len(ms.lods))
    print('subsets     %d' % sum(len(l.subsets) for l in ms.lods))
    print('materials   %s' % ', '.join(
        sorted({s.material_name for l in ms.lods for s in l.subsets if s.material_name})[:6]))
    if variations:
        slots = {k for e in variations.values() for d in e for k in d if not k.startswith('$')}
        print('variations  %d  (%s)' % (len(variations), ', '.join(sorted(variations))[:60]))
        print('tex slots   %s' % (', '.join(sorted(slots)) or 'none'))
    print('chunks      %d resolved%s' % (
        len(chunks), (', %d missing' % len(missing)) if missing else ''))
    print('wrote       %s (%d bytes)' % (out_path, os.path.getsize(out_path)))


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)

    main(sys.argv[1], sys.argv[2],
         sys.argv[3] if len(sys.argv) > 3 else None,
         sys.argv[4] if len(sys.argv) > 4 else None,
         sys.argv[5] if len(sys.argv) > 5 else None)
