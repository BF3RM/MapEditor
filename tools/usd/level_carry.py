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

THOSE LINES BELONG IN THE LEVEL'S OWN BUNDLE, not in a sub-bundle alongside the geometry, and in
front of the LevelData that references them. The client's load order is

    Registering entity resources -> Loading assets -> Init render modules
        -> Creating entities for autoloaded sublevels

so a render module looking for the level's Enlighten database has already looked by the time a
sub-bundle's content could matter -- and the Enlighten entities carried here are not created until
two stages later, so they cannot be what supplies it. Built into Win32/Levels/<LEVEL>/usdlevel the
database was never found, the level object's Enlighten pointer stayed null, and the client died at
"Init render modules" with a page fault on a string built from it. Built into
Win32/Levels/<LEVEL>/<LEVEL> it loads.
"""
import json, os, re, sys

sys.path.insert(0, '/home/powos/Games/VeniceUnleashed/instance/Admin/Mods/MapEditor/tools/usd')
import build_dust2
import level_to_bf3 as L

SRC = os.environ.get('CARRY_SRC', '/tmp/allebx/levels/mp_001/mp_001.json')
TYPES = tuple(t.strip() for t in os.environ.get(
    'CARRY_TYPES', 'VisualEnvironmentReferenceObjectData').split(',') if t.strip())
EXTRA = [n.strip() for n in os.environ.get('CARRY_RESOURCES', '').split(',') if n.strip()]
STORE = os.path.expanduser('~/Games/VeniceUnleashed/debug/carry')
CHUNKS = ' "/tmp/corpusall/chunks"'


def source_bundle():
    """The bundle the SOURCE level ships its own content in, derived from CARRY_SRC."""
    named = os.environ.get('CARRY_FAMILY_BUNDLE')

    if named is not None:
        return named

    return 'win32/levels/%s' % os.path.splitext(SRC)[0].split('/levels/')[-1]

def bundle_resources(bundle):
    """Every resource the SOURCE level's own bundle holds, as {name: type}.

    Cached next to the other dumps -- it takes Rime half a minute and never changes.
    """
    import subprocess

    cache = os.path.join(STORE, '%s.resources' % bundle.replace('/', '_'))

    if not (os.path.exists(cache) and os.path.getsize(cache)):
        recipe = os.path.join(STORE, 'listres.cmds')
        game = '/home/powos/.local/share/Steam/steamapps/common/Battlefield 3'
        open(recipe, 'w').write('mount_game "%s" Frostbite2_0 true\nselect_game 1\n'
                                'list_bundle_resources %s\n' % (game, bundle))
        out = subprocess.run(
            [os.path.join('/home/powos/Projects/Rime/bin/Release', 'RimeREPL'), recipe],
            check=False, capture_output=True, text=True,
            env=dict(os.environ, DOTNET_ROOT=os.path.expanduser('~/.dotnet'))).stdout
        open(cache, 'w').write(out)

    found = {}

    for line in open(cache):
        line = line.strip()

        if line.startswith('- ') and line.endswith(')') and ' (' in line:
            nm, _, ty = line[2:].rpartition(' (')
            found[nm.strip().lower()] = ty[:-1]

    return found


src = json.load(open(SRC))
dst = json.load(open('/tmp/blank_plus_both.json'))
pg = dst['PartitionGuid']
root = dst['Instances'][dst['PrimaryInstanceGuid']]

want, added = set(), []
_src_pg = (src.get('PartitionGuid') or '').lower()


def refs(o, out):
    if isinstance(o, dict):
        if isinstance(o.get('PartitionGuid'), str) and 'InstanceGuid' in o:
            out.add(o['PartitionGuid'].lower())

        for v in o.values():
            refs(v, out)
    elif isinstance(o, list):
        for v in o:
            refs(v, out)


def internal_refs(o, out):
    """The instances this object names inside its OWN partition.

    Copying an object across is not enough. The source level's objects point at each other
    constantly -- a StaticModelGroupEntityData names its PhysicsData and one MeshEntityType per
    member, all of them instances of the source LevelData itself -- and Rime rejects a partition
    that references an instance it does not contain. The build then fails and the server quietly
    serves whatever level it can, which reads in-game as "my change did nothing".
    """
    if isinstance(o, dict):
        g = o.get('InstanceGuid')

        if isinstance(g, str) and isinstance(o.get('PartitionGuid'), str) \
                and o['PartitionGuid'].lower() == _src_pg:
            out.add(g)

        for v in o.values():
            internal_refs(v, out)
    elif isinstance(o, list):
        for v in o:
            internal_refs(v, out)


def carry(guid):
    """Copy one source instance into the emitted LevelData with its internal closure.

    Returns the guids it named that the source does not actually contain, which is worth saying out
    loud: those are the ones Rime will still reject.
    """
    pending, missing = {guid}, set()

    while pending:
        i = pending.pop()

        if i in dst['Instances']:
            continue

        v = src['Instances'].get(i)

        if v is None:
            missing.add(i)
            continue

        dst['Instances'][i] = v
        r = set()
        refs(v, r)
        want.update(x for x in r if x != _src_pg)
        pulled = set()
        internal_refs(v, pulled)
        pending |= pulled - set(dst['Instances'])

    return missing


_before = len(dst['Instances'])

for g, v in sorted(src['Instances'].items()):
    if v.get('$type') not in TYPES:
        continue

    gone = carry(g)
    root['Objects'].append({'PartitionGuid': pg, 'InstanceGuid': g})
    added.append(v['$type'])

    if gone:
        print('carry     WARNING %s names %d instance(s) the source does not contain'
              % (v['$type'], len(gone)))

json.dump(dst, open('/tmp/blank_plus_carry.json', 'w'), indent=2)

# LEVELDATA'S OWN REFERENCE FIELDS.
#
# Carrying the objects is not enough: the root itself points at things. EnlightenShaderDatabase is
# the one that bites -- the engine composes a name from "<level name>" and that reference during
# render-module init, and with it null it builds an empty string and dereferences it. The client
# dies at "Init render modules" nowhere near the word Enlighten. Copy any reference the source sets
# and ours leaves null.
#
# An ALLOWLIST, not everything the source root sets: taking the lot drags in SoundStates and
# VoiceOverSystem, a separate subsystem each and not what any fault asked for. CARRY_REFS names
# them. Internal references are fine now -- carry() pulls the instance they name across too.
_added_refs = []
_REF_ALLOW = {k.strip() for k in os.environ.get(
    'CARRY_REFS', 'EnlightenShaderDatabase').split(',') if k.strip()}

# PLAIN VALUES THE SOURCE ROOT SETS AND OURS DOES NOT.
#
# The emitted LevelData is built from a blank, so it is missing more than references:
# AlwaysCreateEntityBusClient/Server, NeedNetworkId and InterfaceHasConnections are all absent, and
# a level that does not ask for an entity bus or a network id is a level whose entities are wired
# up differently from the one we exported. They cost nothing to carry.
# CARRY_VALUES=0 turns this off. They look free and they are not: the level that came out with
# them carried also carried a Descriptor and an AnimatedSkeletonDatabase, and the client died in a
# new place entirely (vu.com+0x1A983D, a null where an asset should be). Anything added here is a
# change to how the engine wires the level up, so it stays bisectable.
_added_vals = []

for _k, _v in (src['Instances'][src['PrimaryInstanceGuid']].items()
               if os.environ.get('CARRY_VALUES', '1') == '1' else ()):
    if isinstance(_v, (dict, list)) or _k in dst['Instances'][dst['PrimaryInstanceGuid']]:
        continue

    root[_k] = _v
    _added_vals.append(_k)

if _added_vals:
    print('carry     plain value(s) taken from the source root: %s' % ', '.join(_added_vals))

for _k, _v in src['Instances'][src['PrimaryInstanceGuid']].items():
    if _k not in _REF_ALLOW or not isinstance(_v, dict) or not _v.get('PartitionGuid'):
        continue

    if root.get(_k) is not None:
        continue

    root[_k] = _v

    if _v['PartitionGuid'].lower() == _src_pg:
        carry(_v['InstanceGuid'])
    else:
        r = set()
        refs(_v, r)
        want |= {x for x in r if x != _src_pg}

    _added_refs.append(_k)

print('carry     %d instance(s) pulled into the LevelData' % (len(dst['Instances']) - _before))

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

def _dump_for(guid):
    """The JSON dump of a partition, from whichever guid directory has it."""
    for base in [store] + [d for d in os.environ.get('USD_GUID_DIRS', '').split(':') if d]:
        f = os.path.join(base, '%s.json' % guid)

        if os.path.exists(f):
            try:
                return json.load(open(f))
            except Exception:                                # noqa: BLE001
                return None

    return None


def _texture_instance(doc):
    """The TextureAsset instance guid in a partition, if it is a texture partition."""
    for g, inst in (doc.get('Instances') or {}).items():
        if (inst.get('$type') or '').endswith('TextureAsset'):
            return g

    return None


def repoint_textures(part_names):
    """Carry a partition as JSON with its texture references repointed at partitions WE emit.

    A reference to the GAME's texture partition does not resolve in an exported level, even carried
    byte for byte under its own name and guid with its resource and chunks. Measured on MP_001: all
    eight of the sky's texture fields read null in-game, and so does the colour-correction grading
    texture -- a different component, same partition -- while the scalars beside them are the real
    authored values. That is a flat blue sky with no envmap on a level whose meshes are textured.

    The meshes work because the emitter never references the game's texture partitions: it emits
    its own TextureAsset beside each one, pointing at the game's texture RESOURCE, and binds those.
    Follow the same rule here. The emitted names and guids are derived exactly as the emitter
    derives them, so a texture both paths want is one partition, not two.

    -> (lines to add before the carried partitions, {old partition name: json path})
    """
    build_dust2.configure(os.environ.get('CARRY_HOST', 'mp_001'))
    out_dir = os.path.join(STORE, 'json')
    os.makedirs(out_dir, exist_ok=True)
    tex_lines, emitted, rewritten = [], {}, {}

    # ONLY PARTITIONS THAT ARE NOT ALSO A RESOURCE.
    #
    # A partition backed by a resource of the same name -- the Enlighten databases, the probe sets,
    # the textures themselves -- has a binary payload the engine reads directly, and the EBX beside
    # it is a handle onto that. Rewriting one desyncs the pair: re-emitting the Enlighten databases
    # as JSON put the render-module fault straight back, on a build where the level bundle had
    # already fixed it. The visual environment is EBX only, which is why it is safe to rewrite and
    # why it was the thing that needed rewriting.
    _mode = os.environ.get('CARRY_REPOINT_TEXTURES', '0')
    _b = source_bundle()
    _resources = bundle_resources(_b) if _b and _b != '0' else {}

    for guid, name in sorted(names.items(), key=lambda kv: kv[1] or ''):
        if (name or '').lower() in _resources:
            continue

        doc = _dump_for(guid)

        if not doc or not doc.get('Instances'):
            continue

        # Which of this partition's references point at a texture partition?
        refs_here = set()
        refs(doc['Instances'], refs_here)
        swap = {}

        for r in refs_here:
            # In 'json' mode nothing is repointed, so emitting TextureAssets nothing references
            # would put dead partitions in the bundle and muddy the one variable being tested.
            if r == guid or _mode == 'json':
                continue

            tex_doc = _dump_for(r)

            if not tex_doc:
                continue

            tex_ig = _texture_instance(tex_doc)

            if not tex_ig:
                continue

            tex_name = (tex_doc.get('Name') or names.get(r) or '').strip()

            if not tex_name:
                continue

            if tex_name not in emitted:
                ours = build_dust2.texture_partition_name(tex_name)
                pg = build_dust2.guid('partition', ours)
                ig = build_dust2.guid('instance', ours)
                path = os.path.join(out_dir, 'tex_%s.json' % ours.replace('/', '__'))
                json.dump({'PartitionGuid': pg, 'PrimaryInstanceGuid': ig, 'Name': ours,
                           'Instances': {ig: {'$type': 'TextureAsset', 'Name': ours}}},
                          open(path, 'w'), indent=1)
                tex_lines.append('add_json_partition %s "%s"' % (ours, path))
                emitted[tex_name] = (pg, ig)

            swap[r] = emitted[tex_name]

        # CARRY_REPOINT_TEXTURES=json re-emits through Rime's writer WITHOUT touching any
        # reference. That separates the two things the repointing conflated: whether a raw
        # partition loses its external references (Rime rebuilds the import table on the JSON
        # path, and keeps the game's on the raw path), and whether pointing at TextureAssets we
        # emit helps. The MVDB is an emitted JSON partition that references game texture
        # partitions and binds them, so the JSON path demonstrably resolves them.
        if _mode == 'json':
            swap = {}
        elif not swap:
            continue

        def _fix(o):
            if isinstance(o, dict):
                pgv = o.get('PartitionGuid')

                if isinstance(pgv, str) and pgv.lower() in swap and 'InstanceGuid' in o:
                    o['PartitionGuid'], o['InstanceGuid'] = swap[pgv.lower()]

                for v in o.values():
                    _fix(v)
            elif isinstance(o, list):
                for v in o:
                    _fix(v)

        _fix(doc['Instances'])
        path = os.path.join(out_dir, '%s.json' % (name or guid).replace('/', '__'))
        json.dump(doc, open(path, 'w'), indent=1)
        rewritten[name] = path

    return tex_lines, rewritten


lines, got = L._ship_named_partitions(names.values(), STORE, CHUNKS)

# OFF BY DEFAULT, and probably wrong. The theory was that a reference to the GAME's texture
# partition never resolves in an exported level, because the sky's eight textures and the
# colour-grading texture all read null in-game. But the meshes ARE textured, and with
# GAME_MVDB=1 the database entries are the game's own with their TextureParameters
# untouched -- pointing at exactly those game texture partitions. So they do resolve, and
# whatever stops the sky binding is something else. Re-emitting the visual environment as
# JSON to repoint them cost a new fault of its own (vu.com+0xC0E24, a null read) on a
# build that was otherwise good. Kept behind a knob rather than deleted, because the
# texture-partition emitter here is reusable once the real cause is known.
if os.environ.get('CARRY_REPOINT_TEXTURES', '0') in ('1', 'json'):
    _tex_lines, _rewritten = repoint_textures(names.values())

    if _rewritten:
        # The TextureAssets first, then each carried partition as JSON in place of its raw copy.
        _kept_lines = []

        for _l in lines:
            _m = re.match(r'add_raw_partition\s+"([^"]+)"', _l.strip())

            if _m and _m.group(1) in _rewritten:
                _kept_lines.append('add_json_partition %s "%s"'
                                   % (_m.group(1), _rewritten[_m.group(1)]))
            else:
                _kept_lines.append(_l)

        lines = _tex_lines + _kept_lines
        print('carry     %d partition(s) re-emitted as JSON with %d texture reference(s) '
              'repointed at partitions we emit' % (len(_rewritten), len(_tex_lines)))





# RESOURCE FAMILIES.
#
# Enlighten is not three partitions, it is a family: MP_001 carries 159 EnlightenProbeSet resources
# beside the static and dynamic databases, and NOTHING in EBX references them -- the system
# resource names them by string at runtime, so no amount of closure can reach them. Leave them
# behind and the render module builds its job off a null and the client dies at "Init render
# modules", nowhere near the word Enlighten.
#
# The rule that finds them without a list to hand-maintain: the source level's bundle says what it
# holds, and a family member's name starts with the name of the resource that owns it. So for every
# resource we already carry, take the bundle's own resources that extend its name.
_bundle = source_bundle()

_family = []

if _bundle and _bundle != '0':
    _held = bundle_resources(_bundle)
    _have = {n.lower() for n in got}

    for _n in sorted(_held):
        if _n in _have:
            continue

        if any(_n.startswith(_h) and _n != _h for _h in _have):
            _family.append(_n)

    lines += ['add_existing_resource_with_chunks "%s" 1%s' % (n, CHUNKS) for n in _family]

    if _family:
        import collections as _c

        print('carry     %d resource(s) in the families of what we carry: %s'
              % (len(_family), ', '.join('%s x%d' % (t, c) for t, c
                                         in _c.Counter(_held[n] for n in _family).most_common())))

# THE LEVEL'S UI BUNDLES.
#
# A level ships more than geometry: beside <LEVEL> there are <LEVEL>_UiLoadingMp, <LEVEL>_UiPlaying
# and <LEVEL>_loading_music, and they hold the loading screen, the HUD and -- the one that matters
# -- ui/assets/spawnscreen. The emitted level declares all three and leaves them EMPTY, so there is
# no loading screen, no deploy screen, and the player can never spawn. Every "alive=false
# soldier=false" reading and every empty spawn log came from that.
#
# Carried by asking the source level's own bundles what they hold, so it follows any level.
_ui = {}

for _suffix in [x.strip() for x in os.environ.get(
        'CARRY_UI_BUNDLES', 'uiloadingmp,uiplaying,loading_music').split(',') if x.strip()]:
    _held = bundle_resources('%s_%s' % (source_bundle(), _suffix))

    if _held:
        _ui[_suffix] = sorted(_held)

if _ui:
    json.dump(_ui, open('/tmp/carry_ui.json', 'w'), indent=1)
    print('carry     ui bundles: %s'
          % ', '.join('%s=%d' % (k, len(v)) for k, v in sorted(_ui.items())))

# Resources named directly (terrain payloads and the like) have no EBX to walk to.
if EXTRA:
    lines += ['add_existing_resource_with_chunks "%s" 1%s' % (n, CHUNKS) for n in EXTRA]

open('/tmp/carry_lines.txt', 'w').write('\n'.join(lines) + '\n')
print('carry     %s -> %d partition(s) closed, %d shipped, %d extra resource(s)'
      % (','.join(sorted(set(added))), len(seen), len(got), len(EXTRA)))

if _added_refs:
    print('carry     LevelData references taken from the source: %s' % ', '.join(_added_refs))
