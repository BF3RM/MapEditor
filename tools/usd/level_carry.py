"""Carry objects from the SOURCE level's LevelData into the emitted one, with their closure.

MEASURED on MP_001: carrying the three VisualEnvironmentReferenceObjectData brings the level's
lighting -- interior windows light up, which they do not without it -- and ships the sky component
with all eight of its textures and the systems/sky shaders. The sky still does not draw, so
something activates a visual environment that this does not do yet; the lighting is real either
way. Carrying the Enlighten entities or the trees' vegetation on top of this still wedges the
server at "Creating entities for autoloaded sublevels".

The emitted level is built on a blank LevelData, so everything the source level hangs off its own
root is simply absent: the visual environment (sky, lighting, fog -- which is why the empty space
renders flat blue), the terrain, the Enlighten entities. Those are objects in the source LevelData,
not content any mesh references, so nothing in the emit pipeline can reach them.

    CARRY_TYPES=VisualEnvironmentReferenceObjectData lvl_carry.py

Writes /tmp/blank_plus_carry.json (the patched LevelData) and /tmp/carry_lines.txt (recipe lines
for the partitions those objects reference, closed transitively).
"""
import json, os, sys

sys.path.insert(0, '/home/powos/Games/VeniceUnleashed/instance/Admin/Mods/MapEditor/tools/usd')
import level_to_bf3 as L

SRC = os.environ.get('CARRY_SRC', '/tmp/allebx/levels/mp_001/mp_001.json')
TYPES = tuple(t.strip() for t in os.environ.get(
    'CARRY_TYPES', 'VisualEnvironmentReferenceObjectData').split(',') if t.strip())
EXTRA = [n.strip() for n in os.environ.get('CARRY_RESOURCES', '').split(',') if n.strip()]
STORE = os.path.expanduser('~/Games/VeniceUnleashed/debug/carry')
CHUNKS = ' "/tmp/corpusall/chunks"'

src = json.load(open(SRC))
dst = json.load(open('/tmp/blank_plus_both.json'))
pg = dst['PartitionGuid']
root = dst['Instances'][dst['PrimaryInstanceGuid']]

want, added = set(), []


def refs(o, out):
    if isinstance(o, dict):
        if isinstance(o.get('PartitionGuid'), str) and 'InstanceGuid' in o:
            out.add(o['PartitionGuid'].lower())

        for v in o.values():
            refs(v, out)
    elif isinstance(o, list):
        for v in o:
            refs(v, out)


for g, v in src['Instances'].items():
    if v.get('$type') not in TYPES:
        continue

    dst['Instances'][g] = v
    root['Objects'].append({'PartitionGuid': pg, 'InstanceGuid': g})
    added.append(v['$type'])
    r = set()
    refs(v, r)
    want |= {x for x in r if x != pg.lower()}

json.dump(dst, open('/tmp/blank_plus_carry.json', 'w'), indent=2)

# Close what those objects reference, the same way the emitter closes its own content.
store = os.environ.get('USD_CLOSURE_DIR', '/tmp/closure')
seen, names = set(), {}

while want and len(seen) < 4000:
    names.update(L._resolve_guid_names(want))
    seen |= want
    nxt = set()

    for g in want:
        try:
            d = json.load(open(os.path.join(store, '%s.json' % g)))
        except Exception:                                    # noqa: BLE001
            continue

        r = set()
        refs(d.get('Instances') or {}, r)
        nxt |= {x for x in r if x not in seen}

    want = nxt

lines, got = L._ship_named_partitions(names.values(), STORE, CHUNKS)

# Resources named directly (terrain payloads and the like) have no EBX to walk to.
if EXTRA:
    lines += ['add_existing_resource_with_chunks "%s" 1%s' % (n, CHUNKS) for n in EXTRA]

open('/tmp/carry_lines.txt', 'w').write('\n'.join(lines) + '\n')
print('carry     %s -> %d partition(s) closed, %d shipped, %d extra resource(s)'
      % (','.join(sorted(set(added))), len(seen), len(got), len(EXTRA)))
