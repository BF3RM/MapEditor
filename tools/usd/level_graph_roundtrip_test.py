#!/usr/bin/env python3
"""Does the USD hierarchy actually reproduce BF3's level graph, and survive the trip back?

Nesting entities by partition path was browsable and structurally wrong: a WorldPartData prim's
children were "other instances in the same file", so a DCC could not select a layer and get the
layer, and the meshes were not in the tree at all -- they lived in a flat list beside it.

This checks the graph against the EBX it came from, not against itself:

    containers   every LevelData / SubWorldData / WorldPartData prim has exactly the children its
                 own `Objects` list names, no more and no fewer
    reference    every world-part and sub-world reference object owns the blueprint it points at
    census       every instance in every partition is authored EXACTLY once, in one place or the
                 other -- an ownership tree that quietly drops what nothing owns is worse than no
                 tree, and one that authors an instance twice loses an edit with no error
    anchors      a mesh placed inside the graph sits at the transform it was dumped with, to the
                 bit, because its owner carries the placement and it carries identity
    round trip   every record read back out of the stage equals the record that went in

    level_graph_roundtrip_test.py [ebx dir] [levels/x/x] [placements.json]

Every assertion is on a COUNT as well as on a verdict. A stage with nothing in it passes any test
that only asks "did anything disagree?", and this pipeline has been caught by that four times.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pxr import Usd, UsdGeom                                                # noqa: E402
import level_entities                                                      # noqa: E402

BF3 = 'bf3'
CONTAINERS = ('LevelData', 'SubWorldData', 'WorldPartData')


def _fields(a, b, path=''):
    """-> (compared, [what differs]) between two EBX records, leaf by leaf."""
    if isinstance(a, dict) and isinstance(b, dict):
        n, bad = 0, []

        for k in set(a) | set(b):
            if k not in a or k not in b:
                bad.append('%s%s missing' % (path, k))
                continue

            dn, db = _fields(a[k], b[k], path + k + '.')
            n += dn
            bad += db

        return n, bad

    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return 0, ['%s length %d vs %d' % (path, len(a), len(b))]

        n, bad = 0, []

        for i, (x, y) in enumerate(zip(a, b)):
            dn, db = _fields(x, y, '%s%d.' % (path, i))
            n += dn
            bad += db

        return n, bad

    return 1, ([] if a == b else ['%s %r vs %r' % (path.rstrip('.'), a, b)])


def _entity(prim):
    """The bf3Entity record a graph prim carries, or None."""
    raw = prim.GetCustomDataByKey(BF3 + 'Entity')
    return json.loads(raw) if raw else None


def main(ebx_dir, level, placements_path):
    placements = json.load(open(placements_path))['meshes'] if placements_path else {}

    import glob

    base = os.path.join(ebx_dir, os.path.dirname(level).lower())
    parts = sorted(os.path.relpath(f, ebx_dir)[:-5]
                   for f in glob.glob(os.path.join(base, '**', '*.json'), recursive=True))

    out = '/tmp/level_graph_rt.usda'

    if os.path.exists(out):
        os.remove(out)

    stage = Usd.Stage.CreateNew(out)
    world = UsdGeom.Xform.Define(stage, '/World')
    stage.SetDefaultPrim(world.GetPrim())

    counts, placed, graph = level_entities.author(stage, world, ebx_dir, parts,
                                                  level=level, placements=placements)

    # The meshes, exactly the way export_level_usd authors them: a child of the reference object
    # that places it, at identity, because the owner already carries the transform.
    for name, owned in graph['anchors'].items():
        for i, owner in owned.items():
            UsdGeom.Xform.Define(stage, owner + '/mesh').GetPrim() \
                .SetCustomDataByKey(BF3 + ':mesh', name)

    stage.GetRootLayer().Save()

    docs, _bypart, _byprimary = level_entities._index(ebx_dir, parts)     # noqa: SLF001
    total = sum(len(d.get('Instances') or {}) for d in docs.values())
    fails = []

    print('level              %s' % level)
    print('partitions         %d, %d instance(s)' % (len(docs), total))
    print('graph              %d instance(s) owned, %d level(s) deep, %d nothing owns'
          % (graph['nodes'], graph['depth'], graph['loose']))

    if graph['nodes'] < 2 or graph['depth'] < 2:
        fails.append('the graph is empty or flat -- nothing below is worth reading')

    # -- containers -----------------------------------------------------------------------------
    # A container prim must have exactly the children BF3 says it has. Counting the other way
    # round (does every child have a parent?) passes trivially on a tree with one node in it.
    checked = kids_seen = kids_want = 0

    for prim in stage.Traverse():
        meta = _entity(prim)

        if not meta or meta['type'] not in CONTAINERS:
            continue

        record = meta['record']
        instances = docs[meta['partition']].get('Instances') or {}
        want = sum(1 for o in (record.get('Objects') or [])
                   if str(o.get('InstanceGuid') or '') in instances)
        got = sum(1 for c in prim.GetChildren() if _entity(c))
        checked += 1
        kids_seen += got
        kids_want += want

        if got != want:
            fails.append('%s owns %d prim(s), its Objects names %d'
                         % (prim.GetPath(), got, want))

    print('containers         %d checked, %d owned object(s) against %d in the EBX'
          % (checked, kids_seen, kids_want))

    if checked == 0 or kids_seen == 0:
        fails.append('no container was checked -- the graph has no world parts in it')

    # -- structural reference objects -----------------------------------------------------------
    refs = blueprints = 0

    for prim in stage.Traverse():
        meta = _entity(prim)

        if not meta or meta['type'] not in level_entities.STRUCTURAL:
            continue

        refs += 1
        owned = [c for c in prim.GetChildren()
                 if (_entity(c) or {}).get('type') in CONTAINERS]
        blueprints += len(owned)

        if len(owned) > 1:
            fails.append('%s owns %d blueprints' % (prim.GetPath(), len(owned)))

    print('reference objects  %d structural, %d of them own their blueprint' % (refs, blueprints))

    if refs == 0 or blueprints == 0:
        fails.append('no world part or sub-world was resolved to its blueprint')

    # -- census ---------------------------------------------------------------------------------
    seen = {}

    for prim in stage.Traverse():
        meta = _entity(prim)

        if not meta:
            continue

        key = (meta['partition'], meta['instance'])
        seen.setdefault(key, []).append(str(prim.GetPath()))

    twice = [k for k, v in seen.items() if len(v) > 1]
    in_graph = sum(1 for p in stage.Traverse()
                   if _entity(p) and str(p.GetPath()).startswith('/World/Level'))

    print('census             %d of %d instance(s) authored, %d in the graph, %d authored twice'
          % (len(seen), total, in_graph, len(twice)))

    if len(seen) != total:
        fails.append('%d instance(s) went missing' % (total - len(seen)))

    if twice:
        fails.append('%d instance(s) authored more than once (%s)'
                     % (len(twice), seen[twice[0]]))

    if in_graph != graph['nodes']:
        fails.append('the graph reports %d nodes but %d prims are under /World/Level'
                     % (graph['nodes'], in_graph))

    # -- anchors --------------------------------------------------------------------------------
    # The whole point of putting a mesh under its reference object is that the geometry and the
    # EBX record become ONE thing to move. That is only true if it lands on the same transform.
    cache = UsdGeom.XformCache()
    anchored = exact = 0

    for name, owned in graph['anchors'].items():
        for i, owner in owned.items():
            anchored += 1
            m = cache.GetLocalToWorldTransform(stage.GetPrimAtPath(owner + '/mesh'))
            got = [float(m[r][c]) for r in range(4) for c in range(3)]

            if got == [float(x) for x in placements[name][i][:12]]:
                exact += 1

    print('anchored meshes    %d of %d placement(s), %d at the dumped transform to the bit'
          % (anchored, sum(len(v) for v in placements.values()), exact))

    if placements and anchored == 0:
        fails.append('no placement was anchored to the object that places it')

    if exact != anchored:
        fails.append('%d anchored mesh(es) moved' % (anchored - exact))

    # -- round trip -----------------------------------------------------------------------------
    edits = level_entities.read(out)
    compared = changed = records = 0
    changes = []

    for part, records_out in edits.items():
        instances = docs[part].get('Instances') or {}

        for guid, got in records_out.items():
            records += 1
            n, bad = _fields(instances.get(guid), got)
            compared += n
            changed += len(bad)
            changes += ['%s/%s: %s' % (part.rsplit('/', 1)[-1], guid[:8], b) for b in bad[:2]]

    print('round trip         %d record(s), %d field(s) compared, %d changed'
          % (records, compared, changed))

    if records != total:
        fails.append('read back %d record(s) of %d' % (records, total))

    if compared < 1000:
        fails.append('only %d field(s) compared -- nothing was really checked' % compared)

    if changed:
        fails.append('%d field(s) changed on the round trip' % changed)

    for line in changes[:8]:
        print('   CHANGED %s' % line)

    print('')

    for line in fails:
        print('FAIL %s' % line)

    print('RESULT %s' % ('PASS' if not fails else 'FAIL'))
    return 0 if not fails else 1


if __name__ == '__main__':
    argv = sys.argv[1:]
    sys.exit(main(argv[0] if argv else '/tmp/allebx',
                  argv[1] if len(argv) > 1 else 'levels/mp_001/mp_001',
                  argv[2] if len(argv) > 2 else '/tmp/lv/mp_001.placements.json'))
