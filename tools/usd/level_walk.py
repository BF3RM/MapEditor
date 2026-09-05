#!/usr/bin/env python3
"""Walk a level's EBX offline and report every mesh placement it contains.

The existing dumper reaches EBX over the network, one level at a time. Rime can write the whole
game's EBX once -- 73k partitions -- and then every level is a local walk, which is what makes
running all 49 of them practical.

The structure, which is the same one the engine descends:

    LevelData.Objects
      SubWorldReferenceObjectData   -> another partition (a sub-level)
      WorldPartReferenceObjectData  -> another partition (a world part)
        ReferenceObjectData         -> Blueprint + BlueprintTransform
          ObjectBlueprint           -> ... -> MeshAsset

    level_walk.py <ebx dir> <levels/x/x> [out.json]
"""
import json
import os
import sys

MESH_TYPES = ('RigidMeshEntityData', 'CompositeMeshEntityData', 'SkinnedMeshEntityData',
              'MeshProxyEntityData')


class Ebx(object):
    """The dumped partitions, indexed by path and by partition guid."""

    def __init__(self, root):
        self.root = root
        self._by_path = {}
        self._by_guid = {}
        self._scanned = False

    def by_path(self, path):
        f = os.path.join(self.root, path.lower() + '.json')

        if path.lower() in self._by_path:
            return self._by_path[path.lower()]

        if not os.path.exists(f):
            return None

        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            return None

        self._by_path[path.lower()] = doc
        return doc

    def _scan(self):
        """PrimaryInstanceGuid -> file, built once.

        The whole-game dump does NOT record a PartitionGuid, so a reference cannot be resolved that
        way. It does record PrimaryInstanceGuid as the FIRST key of every file, and a blueprint
        reference's InstanceGuid is that partition's primary instance -- so this is the index that
        actually resolves, and reading 200 bytes per file is enough to build it.
        """
        if self._scanned:
            return

        self._scanned = True

        for dirpath, _dirs, files in os.walk(self.root):
            for name in files:
                if not name.endswith('.json'):
                    continue

                full = os.path.join(dirpath, name)

                try:
                    with open(full, 'rb') as fh:
                        head = fh.read(200).decode('utf-8', 'ignore')
                except Exception:                            # noqa: BLE001
                    continue

                for key in ('"PrimaryInstanceGuid":"', '"PrimaryInstanceGuid": "'):
                    at = head.find(key)

                    if at >= 0:
                        guid = head[at + len(key):at + len(key) + 36].lower()
                        self._by_guid.setdefault(guid, full)
                        break

    def by_guid(self, guid):
        self._scan()
        f = self._by_guid.get(str(guid).lower())

        if not f:
            return None

        try:
            return json.load(open(f))
        except Exception:                                    # noqa: BLE001
            return None


def _instances(doc):
    return (doc or {}).get('Instances') or {}


def _name_from(ebx, guid):
    """The mesh resource's name, from the path its partition was dumped at.

    The whole-game dump carries no Name field either, and the layout mirrors the partition name --
    so the path IS the name.
    """
    ebx._scan()                                              # noqa: SLF001
    f = ebx._by_guid.get(str(guid).lower())                  # noqa: SLF001

    if not f:
        return None

    rel = os.path.relpath(f, ebx.root)
    return rel[:-5].replace(os.sep, '/') if rel.endswith('.json') else None


def _mesh_of(doc, ebx, depth=0):
    """The MeshAsset name a blueprint eventually draws, or None."""
    if doc is None or depth > 4:
        return None

    for inst in _instances(doc).values():
        if inst.get('$type') in MESH_TYPES:
            mesh = inst.get('Mesh')

            if isinstance(mesh, dict) and mesh.get('InstanceGuid'):
                target = ebx.by_guid(mesh['InstanceGuid'])

                if target is not None:
                    return target.get('Name') or _name_from(ebx, mesh['InstanceGuid'])

    return None


def walk(ebx, level_path):
    """-> {mesh name: [LinearTransform, ...]}"""
    root = ebx.by_path(level_path)

    if root is None:
        return {}, 'no such partition'

    placements = {}
    seen = set()
    queue = [(root, None)]

    while queue:
        doc, _ = queue.pop()

        for inst in _instances(doc).values():
            t = inst.get('$type')

            if t in ('SubWorldReferenceObjectData', 'WorldPartReferenceObjectData'):
                bp = inst.get('Blueprint') or {}
                pg = bp.get('InstanceGuid')

                if pg and pg not in seen:
                    seen.add(pg)
                    sub = ebx.by_guid(pg)

                    if sub is not None:
                        queue.append((sub, inst))

            elif t == 'ReferenceObjectData':
                bp = inst.get('Blueprint') or {}
                pg = bp.get('InstanceGuid')

                if not pg:
                    continue

                target = ebx.by_guid(pg)
                name = _mesh_of(target, ebx)

                if not name:
                    continue

                xf = inst.get('BlueprintTransform') or {}
                r, u, f, tr = (xf.get('right') or {}), (xf.get('up') or {}), \
                    (xf.get('forward') or {}), (xf.get('trans') or {})
                placements.setdefault(name, []).append([
                    r.get('x', 1.0), r.get('y', 0.0), r.get('z', 0.0),
                    u.get('x', 0.0), u.get('y', 1.0), u.get('z', 0.0),
                    f.get('x', 0.0), f.get('y', 0.0), f.get('z', 1.0),
                    tr.get('x', 0.0), tr.get('y', 0.0), tr.get('z', 0.0)])

    return placements, None


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)

    e = Ebx(sys.argv[1])
    p, err = walk(e, sys.argv[2])

    if err:
        print('%s: %s' % (sys.argv[2], err))
        sys.exit(1)

    print('%s: %d meshes, %d placements'
          % (sys.argv[2], len(p), sum(len(v) for v in p.values())))

    if len(sys.argv) > 3:
        json.dump({'level': sys.argv[2], 'meshes': p}, open(sys.argv[3], 'w'))
