#!/usr/bin/env python3
"""Bring a USD file back to BF3: write the MeshSet resource and its geometry chunk(s) to disk.

This is the return leg of export_usd.py. `bf3_usd.load()` already reconstructs the MeshSet and
chunks in memory -- and roundtrip_test.py proves that reconstruction is byte-identical for the
whole dump corpus -- but until now there was no way to get the result onto disk, which is what a
bundle build actually consumes. So the loop was provable but not usable.

    import_usd.py <in.usda> <out-dir> [--name NAME]

Writes:
    <out-dir>/<name>.meshset          the resource
    <out-dir>/<guid>.chunk            one per LOD, named by that LOD's data_chunk_id
    <out-dir>/<name>.cmds             ready-to-run Rime commands (add_resource + add_chunk)

The .cmds file carries the resource META, which add_resource needs and which is only obtainable
from MeshSet.serialize() -- getting it wrong is what makes a MeshSet relocate nothing and crash on
load, so it is emitted rather than left to be re-derived by hand.
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bf3_usd                       # noqa: E402


def main(usd_path, out_dir, name=None):
    ms, chunks = bf3_usd.load(usd_path)
    os.makedirs(out_dir, exist_ok=True)

    resource_name = name or ms.name
    payload, meta = ms.serialize()
    base = resource_name.rsplit('/', 1)[-1]
    res_path = os.path.join(out_dir, base + '.meshset')
    open(res_path, 'wb').write(payload)

    cmds = ['add_resource %s MeshSet "%s" %s' % (resource_name, res_path, meta.hex().upper())]
    written = []

    for li, lod in enumerate(ms.lods):
        if li not in chunks:
            continue

        guid = uuid.UUID(bytes_le=lod.data_chunk_id)
        # The chunk is padded to a 16-byte boundary, the same as the builder writes it.
        data = chunks[li]
        data += b'\0' * ((-len(data)) % 16)
        path = os.path.join(out_dir, '%s.chunk' % guid)
        open(path, 'wb').write(data)
        written.append((li, guid, len(data)))
        cmds.append('add_chunk %s %s "%s"' % (guid, resource_name, path))

    cmd_path = os.path.join(out_dir, base + '.cmds')
    open(cmd_path, 'w').write('\n'.join(cmds) + '\n')

    print('name       %s' % resource_name)
    print('lods       %d   subsets %d' % (len(ms.lods), sum(len(l.subsets) for l in ms.lods)))
    print('bbox       min %s' % (tuple(round(v, 3) for v in ms.bbox_min),))
    print('           max %s' % (tuple(round(v, 3) for v in ms.bbox_max),))
    print('resource   %s (%d bytes)' % (res_path, len(payload)))
    print('meta       %s' % meta.hex().upper())

    for li, guid, n in written:
        print('chunk LOD%-2d %s (%d bytes)' % (li, guid, n))

    print('commands   %s' % cmd_path)
    return res_path


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)

    argv = sys.argv[1:]
    nm = None

    if '--name' in argv:
        i = argv.index('--name')
        nm = argv[i + 1]
        del argv[i:i + 2]

    main(argv[0], argv[1], nm)
