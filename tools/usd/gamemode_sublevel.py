#!/usr/bin/env python3
"""Emit the TEAM DEATHMATCH gamemode sub-level and wire it into the level partition.

A geometry-only export loads and accepts a connection, but the server reports
`team=0 squad=0 alive=false soldier=false` and the client can never deploy. The reason is
structural, not a bug in the geometry: in BF3 the gameplay layer of a level does not live in the
level's own world at all. It lives in a SEPARATE sub-level per gamemode --
levels/mp_001/team_deathmatch, /rush, /conquest -- each with its own spawns, its own registry and
its own mesh-variation database, and the level partition names it through a
SubWorldReferenceObjectData whose BundleName points at that bundle
(MEASURED: mp_001's level holds exactly one such reference, BundleName =
Levels/MP_001/Team_Deathmatch).

So the exporter emitting only the base world can never produce a playable level, however complete
the geometry is. This builds the missing half for TDM:

  levels/realitymod/team_deathmatch          SubWorldData + registry + one world part
  levels/realitymod/team_deathmatch/part0    the gamemode's spawns

and adds a second SubWorldReferenceObjectData to the level partition so the engine loads it.
"""
import collections
import glob
import json
import os
import subprocess
import sys
import uuid

# Which gamemode sub-level to copy the gameplay records out of, and where its EBX dump lives.
#
# Both were hardcoded to MP_001, which meant this tool -- and therefore teams and spawns -- worked
# for exactly one level. Overridable so a second level can be built without editing the file; the
# defaults keep MP_001 behaving exactly as before.
SRC_GAMEMODE = os.environ.get('GAMEMODE_SRC', 'levels/mp_001/team_deathmatch')
EBX = os.environ.get('GAMEMODE_EBX', '/tmp/mp001ebx')
CLOSURE = os.environ.get('CLOSURE_DIR', '/tmp/closure')

# DST and the bundle it goes in are READ OUT OF THE RECIPE, not written down here.
#
# They were `levels/realitymod/team_deathmatch` and `Win32/Levels/REALITYMOD/team_deathmatch`, so
# this tool only worked for one level under one mod name. The emitter already states both facts in
# the recipe it wrote -- `build_sb <superbundle path>` and the world partition's own name -- and
# taking them from there means a level called anything, under a mod called anything, lands beside
# its own level instead of beside MP_001's.
DST = None
DST_BUNDLE = None
WORLD_BUNDLE = None      # the level's OWN sub-level bundle, which wire() must never drop

# The level partition the harness injects. Shared by every build, hence the replace-not-append rule
# in wire(); overridable so a different harness can point somewhere else.
LEVEL_JSON = os.environ.get('LEVEL_JSON', '/tmp/TestJson1_usd.json')


def _derive(out_dir):
    """The destination sub-level name and bundle, from the recipe the emitter just wrote."""
    global DST, DST_BUNDLE, WORLD_BUNDLE

    leaf = SRC_GAMEMODE.rsplit('/', 1)[-1]
    world, sb = None, None

    for line in open(os.path.join(out_dir, 'build.cmds')):
        if line.startswith('build_sb '):
            sb = line.split(' ')[1].strip()
        elif line.startswith('add_json_partition ') and 'world.json"' in line:
            world = line.split(' ')[1].strip('"')

    if world is None or sb is None:
        raise SystemExit('could not read the level name / superbundle path out of build.cmds')

    # The gamemode sub-level is a SIBLING of the level partition: same namespace, its own leaf.
    WORLD_BUNDLE = world
    DST = world.rsplit('/', 1)[0] + '/' + leaf
    # And its bundle is a sibling of the superbundle, under the same path.
    DST_BUNDLE = sb.rsplit('/', 1)[0] + '/' + leaf

    return DST, DST_BUNDLE

# The gameplay records worth carrying. AlternateSpawnEntityData is the spawn mechanism TDM
# actually uses -- character/vehicle spawn reference objects appear only in rush, squad_rush and
# conquest, never in team_deathmatch, so their absence here is correct rather than missing.
CARRY = ('AlternateSpawnEntityData', 'ReferenceObjectData', 'VolumeVectorShapeData',
         'SoundEntityData', 'LocatorEntityData')

NS = uuid.UUID('9d3f1a52-6c41-4f2b-9c7e-0d7a2f0e1b33')
guid = lambda *p: str(uuid.uuid5(NS, 'gamemode|' + '|'.join(str(x) for x in p)))
ref = lambda pg, ig: {'PartitionGuid': pg, 'InstanceGuid': ig}

IDENTITY = {'right': {'x': 1.0, 'y': 0.0, 'z': 0.0},
            'up': {'x': 0.0, 'y': 1.0, 'z': 0.0},
            'forward': {'x': 0.0, 'y': 0.0, 'z': 1.0},
            'trans': {'x': 0.0, 'y': 0.0, 'z': 0.0}}


def collect():
    """Every gameplay record in the source gamemode sub-level, keyed by its own instance guid."""
    out = {}
    seen = collections.Counter()
    _refs_taken = [0]                                        # mutable, for CARRY_REFS below

    for f in glob.glob(os.path.join(EBX, '**', '*.json'), recursive=True):
        try:
            d = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        name = (d.get('Name') or '')

        if not name.startswith(SRC_GAMEMODE):
            continue

        for g, i in (d.get('Instances') or {}).items():
            t = i.get('$type')

            if t not in CARRY:
                continue

            # BISECT: the full carry (43 spawns + 11 reference objects + 5 volumes) kills the server
            # silently with exit 0 during autoloaded-sublevel entity creation -- the same failure the
            # emitter's WORLD_PART_TYPES comment records for a wrong type. Keep the spawns and ONLY
            # the reference object that points at the level setup carrying the teams; the other 9
            # point at invisible-collision props and the 5 volumes are gamemode boundaries, none of
            # which are needed to prove team assignment.
            if t == 'ReferenceObjectData':
                bp = (i.get('Blueprint') or {}).get('PartitionGuid') or ''

                if (not bp.lower().startswith('fad987c1')
                        and os.environ.get('CARRY_MODE', 'all') not in ('refs', 'all')):
                    continue

                # CARRY_REFS bisects WITHIN the 9 collision placements: a count keeps that many,
                # and a partition-guid prefix keeps only the ones placing that blueprint. "All 9
                # kill it" and "any one of them kills it" are different findings and the fix is
                # different for each, so the knob has to reach inside the group.
                if not bp.lower().startswith('fad987c1'):
                    _only = os.environ.get('CARRY_REFS_BP', '').lower()

                    if _only and not bp.lower().startswith(_only):
                        continue

                    _limit = os.environ.get('CARRY_REFS')

                    if _limit is not None:
                        if _refs_taken[0] >= int(_limit):
                            continue

                        _refs_taken[0] += 1

            # CARRY_MODE was a bisecting knob for a silent exit-0 that is now FIXED: 'min' =
            # spawns + level-setup ref only, 'vol' = + boundary volumes, 'refs' = + the collision
            # refs, 'all' = both, and 'all' is the default because all 59 records load.
            #
            # The 9 remaining ReferenceObjectData place two INVISIBLE COLLISION blueprints, and
            # carrying them kills the server silently (exit 0) during autoloaded-sublevel entity
            # creation. Bisected to those 9 exactly: 44 records load, 49 load, 54 die. Ruled out by
            # measurement, none of which changed the outcome:
            #   * dependency closure for the placed blueprints (reference_existing_partition)
            #   * registering the placed blueprints in the sub-level BlueprintRegistry
            #   * carrying all 16 Havok physics resources they own (already present via the closure,
            #     which is why the superbundle came out byte-identical)
            # Both blueprints are physics objects (HavokAsset x11 and x4, RigidBodyData,
            # PhysicsEntityData). Narrowed since, and none of it fixed the exit:
            #   * A hook on EntityFactory:CreateFromBlueprint names the culprit exactly: the last
            #     blueprint created is objects/invisiblecollision_01/invisiblecollision_charandveh_
            #     01_scalable, entity 5892 of 5892, and the engine dies INSIDE creating it.
            #   * ONE placement is enough; it is not cumulative. Either blueprint alone does it.
            #   * The scale is UNIFORM 0.2 (right/up/forward all measure 0.2), not non-uniform as
            #     this comment used to say, and replacing the basis with identity changes nothing.
            #   * Every one of the blueprint's 18 external references resolves inside the built
            #     superbundle -- checked by mounting it alone and dumping all 3407 partitions.
            #   * Our re-emitted mesh partition shares its name with the closure's copy, and giving
            #     ours the shipped INSTANCE guids (a real bug, fixed) did not change it. Nor did
            #     removing our copies from the main bundle entirely.
            #   * It names Physics_9_Win32, which exists nowhere in the game -- but MP_001's own
            #     bundle ships only 9 of the 11 HavokAssets either, so vanilla loads it with gaps
            #     too. Not the cause.
            # Still open. The remaining untested difference from vanilla is the Havok collision this
            # export does not rebuild (MOPP is an SDK bake).
            mode = os.environ.get('CARRY_MODE', 'all')

            if t == 'VolumeVectorShapeData' and mode not in ('vol', 'all'):
                continue

            out[g] = i
            seen[t] += 1

    return out, seen


def _closure_doc(partition_guid):
    """The closure dump's copy of a partition, by guid."""
    path = os.path.join(CLOSURE, '%s.json' % (partition_guid or '').lower())

    if not os.path.exists(path):
        return None

    try:
        return json.load(open(path))
    except Exception:                                        # noqa: BLE001
        return None


RIME = os.environ.get('RIME_BIN', '/home/powos/Projects/Rime/bin/Release')
GAME = os.environ.get('BF3_PATH',
                      '/home/powos/.local/share/Steam/steamapps/common/Battlefield 3')
RAW_DIR = os.environ.get('RAW_DUMP_DIR', '/tmp/rawparts')


def _raw_dump(name):
    """The partition's raw bytes on disk, dumped with Rime the first time they are asked for."""
    path = os.path.join(RAW_DIR, name.replace('/', '_') + '.bin')

    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path

    os.makedirs(RAW_DIR, exist_ok=True)
    recipe = os.path.join(RAW_DIR, 'dump.cmds')
    open(recipe, 'w').write('\n'.join([
        'mount_game "%s" Frostbite2_0 true' % GAME,
        'select_game 1',
        'dump_partition %s "%s"' % (name, path),
    ]) + '\n')

    # DOTNET_ROOT, or the apphost cannot find the runtime and exits without dumping anything --
    # which reads exactly like "the partition does not exist".
    env = dict(os.environ)
    env.setdefault('DOTNET_ROOT', os.path.expanduser('~/.dotnet'))

    subprocess.run([os.path.join(RIME, 'RimeREPL'), recipe], check=False, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path

    print('  could not dump %s -- set RIME_BIN/BF3_PATH, or pre-dump it into %s'
          % (name, RAW_DIR))

    return None


def _our_blueprints(out_dir):
    """Blueprint partitions the emitter already wrote, indexed by name.

    -> {name.lower(): (partition guid, primary instance guid)}
    """
    index = {}

    for f in glob.glob(os.path.join(out_dir, 'partitions', '*.json')):
        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        primary = (doc.get('Instances') or {}).get(doc.get('PrimaryInstanceGuid') or '')

        if primary and primary.get('$type') == 'ObjectBlueprint' and doc.get('Name'):
            index[doc['Name'].lower()] = (doc['PartitionGuid'], doc['PrimaryInstanceGuid'])

    return index


def _repoint(entities, out_dir):
    """Place OUR blueprint for a mesh, not the game's original.

    The gamemode's reference objects place the game's own ObjectBlueprints, and the engine dies
    inside creating one of those -- measured with a hook on EntityFactory:CreateFromBlueprint, on
    entity 5892 of 5892, with every one of the blueprint's 18 references resolving in the bundle.
    Meanwhile the MAIN level places the very same collision meshes 823 times through the blueprints
    this exporter writes, and those work.

    So place ours. The emitter names its blueprint for a mesh `<dir>/blueprint_<mesh leaf>`, so the
    game blueprint's own mesh reference is enough to find it.
    """
    ours = _our_blueprints(out_dir)
    moved = 0

    for record in entities.values():
        if record.get('$type') != 'ReferenceObjectData':
            continue

        doc = _closure_doc((record.get('Blueprint') or {}).get('PartitionGuid'))

        if doc is None:
            continue

        mesh_name = None

        for instance in (doc.get('Instances') or {}).values():
            for field in ('Mesh', 'MeshAsset'):
                target = instance.get(field)

                if isinstance(target, dict) and target.get('PartitionGuid'):
                    mesh_doc = _closure_doc(target['PartitionGuid'])

                    if mesh_doc and mesh_doc.get('Name'):
                        mesh_name = mesh_doc['Name']

        if not mesh_name:
            continue

        head, _, leaf = mesh_name.rpartition('/')
        found = ours.get(('%s/blueprint_%s' % (head, leaf)).lower())

        if not found:
            continue

        record['Blueprint'] = {'PartitionGuid': found[0], 'InstanceGuid': found[1]}
        moved += 1

    if moved:
        print('  repointed %d placement(s) at our own blueprints' % moved)

    return moved


def _refs_for(_unused=None):
    """Everything the gamemode's reference objects point OUTSIDE this sub-level.

    Read from EVERY ReferenceObjectData in the source gamemode, not just the ones CARRY_MODE keeps.
    The blueprints and Havok resources they name are needed whether or not their placements ride
    along: the MAIN level places the same invisible-collision meshes 823 times over. Deriving from
    the carried subset alone dropped them at the default carry mode and the level stopped loading --
    the old hardcoded list had them unconditionally, which hid the distinction.

    These used to be three hardcoded lists -- one level-setup partition, two collision blueprints
    and a file of physics resource names -- which is to say, MP_001's team_deathmatch written down.
    Every one of them is derivable from the ReferenceObjectData being carried, so derive it.

    The split is by what the partition is FOR, and that distinction is measured, not stylistic:

      * A level SETUP only has to EXIST for its AutoTeamEntityData and TeamEntityData to register,
        so its own content is enough -- and it must NOT be given a closure, which reaches soldiers
        and weapons and took the superbundle from 49 MB to 1.48 GB.
      * A PLACED blueprint is instantiated, so it needs its dependency closure; a placement of a
        bare partition dies on its unresolved dependencies.
      * A placed PHYSICS blueprint needs its Havok RESOURCE as well as its partition. With the
        partition present and the resource absent the placement killed the server silently, the
        same shape as a mesh header resolving while its chunk does not.
    """
    setups, placed, physics = [], [], []
    source = []

    for f in glob.glob(os.path.join(EBX, '**', '*.json'), recursive=True):
        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        if not (doc.get('Name') or '').startswith(SRC_GAMEMODE):
            continue

        source += [i for i in (doc.get('Instances') or {}).values()
                   if i.get('$type') == 'ReferenceObjectData']

    for record in source:

        guid_of = (record.get('Blueprint') or {}).get('PartitionGuid')
        doc = _closure_doc(guid_of)

        if doc is None:
            continue

        name = doc.get('Name')

        if not name:
            continue

        # A level setup declares teams and is never instantiated; anything else here is placed.
        kinds = {i.get('$type') for i in (doc.get('Instances') or {}).values()}

        if kinds & {'LevelSetupData', 'AutoTeamEntityData', 'TeamEntityData'}:
            if name not in setups:
                setups.append(name)

            continue

        if name not in placed:
            placed.append(name)

        # The RESOURCES this blueprint's payload comes from: its Havok collision, named directly
        # by its HavokAsset records, and the MESH its model entity points at -- which is named by
        # the mesh PARTITION it references, not by anything in the blueprint itself.
        #
        # Missing the mesh resource is not cosmetic. The recipe that loads carries
        # charactercollision_01_mesh and invisiblecollision_charandveh_01_scalable_mesh alongside
        # the physics; deriving only the Havok names dropped both, and the level stopped loading.
        for instance in (doc.get('Instances') or {}).values():
            if instance.get('$type') == 'HavokAsset' and instance.get('Name'):
                if instance['Name'] not in physics:
                    physics.append(instance['Name'])

            for field in ('Mesh', 'MeshAsset'):
                target = instance.get(field)

                if not isinstance(target, dict) or not target.get('PartitionGuid'):
                    continue

                mesh_doc = _closure_doc(target['PartitionGuid'])

                if mesh_doc and mesh_doc.get('Name') and mesh_doc['Name'] not in physics:
                    physics.append(mesh_doc['Name'])

    lines = []
    # RAW bytes for a level setup, not a partition rebuilt from a JSON dump.
    #
    # add_json_partition re-serialises it under the game's own name, which makes it OUR partition
    # wearing that address -- and MEASURED, that is enough to stop the level loading: the same
    # build that loads with a raw copy hangs at "Loading terrain" with a re-serialised one.
    lines += ['add_raw_partition %s "%s"' % (n, f)
              for n, f in ((n, _raw_dump(n)) for n in setups) if f]
    lines += ['reference_existing_partition %s 1' % n for n in placed]
    lines += ['add_existing_resource_with_chunks %s 1' % n for n in physics]

    print('  refs: %d level setup(s), %d placed blueprint(s), %d physics resource(s)'
          % (len(setups), len(placed), len(physics)))

    return lines


_NAME_TO_GUID = {}


def _guid_of_name(name):
    """The closure dump's partition guid for a name, indexed once."""
    if not _NAME_TO_GUID:
        for f in glob.glob(os.path.join(CLOSURE, '*.json')):
            try:
                doc = json.load(open(f))
            except Exception:                                # noqa: BLE001
                continue

            if doc.get('Name'):
                _NAME_TO_GUID[doc['Name'].lower()] = os.path.basename(f)[:-5]

    return _NAME_TO_GUID.get((name or '').lower())


def build(entities):
    pg = guid('partition', DST)
    swd = guid('instance', DST, 'subworld')
    desc = guid('instance', DST, 'descriptor')
    reg = guid('instance', DST, 'registry')
    wprod = guid('instance', DST, 'worldpartrod')

    part_pg = guid('partition', DST, 'part', 0)
    wpd = guid('instance', DST, 'worldpart', 0)

    # Part 0 gets its own partition, like every world part the game ships: 617 of the game's
    # level/sub-world roots hold no WorldPartData at all.
    part = {'PartitionGuid': part_pg, 'PrimaryInstanceGuid': wpd, 'Name': DST + '/part0',
            'Instances': {}}
    objects = []

    for g, rec in sorted(entities.items()):
        part['Instances'][g] = rec
        objects.append(ref(part_pg, g))

    # Distinct blueprints placed by the records we carried, in a stable order.
    blueprints = []
    seen_bp = set()

    for rec in (entities[g] for g in sorted(entities)):
        bp = rec.get('Blueprint')

        if not isinstance(bp, dict):
            continue

        key = (bp.get('PartitionGuid'), bp.get('InstanceGuid'))

        if key[0] and key not in seen_bp:
            seen_bp.add(key)
            blueprints.append({'PartitionGuid': key[0], 'InstanceGuid': key[1]})

    part['Instances'][wpd] = {
        '$type': 'WorldPartData', 'Name': DST + '/part0',
        'PropertyConnections': [], 'LinkConnections': [], 'EventConnections': [],
        'Descriptor': None, 'NeedNetworkId': False, 'InterfaceHasConnections': False,
        'AlwaysCreateEntityBusClient': False, 'AlwaysCreateEntityBusServer': False,
        'Objects': objects,
        'HackToSolveRealTimeTweakingIssue': '00000000-0000-0000-0000-000000000000',
        'UseDeferredEntityCreation': False, 'Enabled': True}

    root = {'PartitionGuid': pg, 'PrimaryInstanceGuid': swd, 'Name': DST, 'Instances': {
        swd: {'$type': 'SubWorldData', 'Name': DST,
              'PropertyConnections': [], 'LinkConnections': [], 'EventConnections': [],
              'Descriptor': ref(pg, desc), 'NeedNetworkId': True,
              'InterfaceHasConnections': False,
              'AlwaysCreateEntityBusClient': False, 'AlwaysCreateEntityBusServer': False,
              'Objects': [ref(pg, wprod)], 'RegistryContainer': ref(pg, reg),
              'IsWin32SubLevel': True, 'IsXenonSubLevel': True, 'IsPs3SubLevel': True,
              'RememberStateOnStreamOut': False},
        desc: {'$type': 'InterfaceDescriptorData', 'Fields': [], 'InputEvents': [],
               'OutputEvents': [], 'InputLinks': [], 'OutputLinks': []},
        reg: {'$type': 'RegistryContainer', 'EntityRegistry': [], 'AssetRegistry': [],
              # Every blueprint the sub-level PLACES has to be registered here or the reference
              # resolves to nothing -- the rule build_dust2 already records for the main world.
              # Ours registered only the world part, so the 9 collision placements pointed at
              # blueprints the level never declared, and the server died silently (exit 0) during
              # autoloaded-sublevel entity creation. The game's own team_deathmatch registers 123.
              'BlueprintRegistry': [ref(part_pg, wpd)] + blueprints,
              'ReferenceObjectRegistry': [ref(pg, wprod)]},
        wprod: {'$type': 'WorldPartReferenceObjectData', 'IndexInBlueprint': 3000,
                'IsEventConnectionTarget': 3, 'IsPropertyConnectionTarget': 3,
                'BlueprintTransform': IDENTITY, 'Blueprint': ref(part_pg, wpd),
                'ObjectVariation': None, 'StreamRealm': 'StreamRealm_None',
                'CastSunShadowEnable': True, 'Excluded': False},
    }}

    return root, part


def wire(level_json):
    """Point the level at our gamemode bundle, REPLACING any gamemode it pointed at before.

    This file is shared by every build -- the harness injects the same level partition whichever
    level is being built -- so appending a reference here accumulates across levels. Building
    MP_003 added a sub-world reference to `levels/realitymod/squaddeathmatch` and left it there;
    every MP_001 build afterwards inherited it, and since MP_001's recipe never builds a bundle by
    that name the engine waited for it forever. That is the "hang at Loading terrain" with a clean
    build and no error, and it survived clearing the superbundle, rebuilding from a byte-identical
    recipe, and reverting unrelated work, because none of those touch this file.

    So: drop any sub-world reference to a gamemode in our own namespace that is not the one we are
    wiring now, then add ours. The level's OWN sub-level (the world bundle) is left alone.
    """
    d = json.load(open(level_json))
    pg = d['PartitionGuid']
    ins = d['Instances']

    world = DST.rsplit('/', 1)[0] + '/'                      # e.g. levels/realitymod/
    stale = [g for g, i in ins.items()
             if i.get('$type') == 'SubWorldReferenceObjectData'
             and (i.get('BundleName') or '').startswith(world)
             and i.get('BundleName') not in (DST, WORLD_BUNDLE)]

    for g in stale:
        name = ins[g].get('BundleName')
        del ins[g]

        for holder in ins.values():
            for field in ('Objects', 'ReferenceObjectRegistry'):
                items = holder.get(field)

                if isinstance(items, list):
                    holder[field] = [r for r in items
                                     if not (isinstance(r, dict)
                                             and (r.get('InstanceGuid') or '').lower() == g.lower())]

        print('dropped a stale sub-world reference to %s' % name)

    existing = [i for i in ins.values() if i.get('$type') == 'SubWorldReferenceObjectData']

    for e in existing:
        if e.get('BundleName') == DST:
            if stale:
                json.dump(d, open(level_json, 'w'), indent=1)

            print('level already references %s' % DST)
            return bool(stale)

    tmpl = dict(existing[0])
    tmpl['BundleName'] = DST
    tmpl['IndexInBlueprint'] = (existing[0].get('IndexInBlueprint') or 111) + 1
    tmpl['AutoLoad'] = True

    g = guid('instance', DST, 'subworldrod')
    ins[g] = tmpl

    lvl = [i for i in ins.values() if i.get('$type') == 'LevelData'][0]
    lvl['Objects'].append(ref(pg, g))

    reg = [i for i in ins.values() if i.get('$type') == 'RegistryContainer']

    if reg:
        reg[0].setdefault('ReferenceObjectRegistry', []).append(ref(pg, g))

    json.dump(d, open(level_json, 'w'), indent=1)
    print('wired %s into the level partition (AutoLoad, BundleName=%s)' % (DST, DST))
    return True


def main():
    if len(sys.argv) < 2:
        print('usage: gamemode_sublevel.py <emit dir>   '
              '[GAMEMODE_SRC=levels/<map>/<gamemode>] [GAMEMODE_EBX=<dump>] [CLOSURE_DIR=<dump>]')
        return 2

    out_dir = sys.argv[1]
    # Read the destination name and bundle out of the recipe before anything uses them.
    _derive(out_dir)
    print('emitting %s into bundle %s' % (DST, DST_BUNDLE))
    entities, seen = collect()

    # An empty carry is not a level without gameplay, it is the wrong source name. Levels do not
    # all ship the same gamemodes -- MP_001 has team_deathmatch, MP_003 has squaddeathmatch,
    # conquestsmall, conquestlarge, rush3 and squadrush and no team_deathmatch at all -- and asking
    # for one that is not there used to carry nothing and say so only in the record count.
    if not entities:
        import glob as _g
        _here = os.path.dirname(SRC_GAMEMODE)
        _found = sorted(os.path.relpath(f, EBX)[:-5].replace(os.sep, '/')
                        for f in _g.glob(os.path.join(EBX, _here, '*.json')))
        print('NO gameplay records under %s.' % SRC_GAMEMODE)
        print('  sub-levels dumped beside it: %s'
              % (', '.join(n.rsplit('/', 1)[-1] for n in _found) or '(none)'))
        print('  set GAMEMODE_SRC to one of them.')
        return 1

    print('carrying %d gameplay record(s) from %s: %s' % (len(entities), SRC_GAMEMODE, dict(seen)))
    _repoint(entities, out_dir)

    if not entities:
        print('nothing to carry -- is the ebx dump present?')
        return 1

    root, part = build(entities)
    part_dir = os.path.join(out_dir, 'partitions')
    root_path = os.path.join(part_dir, 'gamemode_tdm.json')
    part_path = os.path.join(part_dir, 'gamemode_tdm_part0.json')
    json.dump(root, open(root_path, 'w'), indent=1)
    json.dump(part, open(part_path, 'w'), indent=1)

    cmds_path = os.path.join(out_dir, 'build.cmds')

    # Always regenerate from a PRISTINE copy. Filtering the previous run's lines out by substring
    # missed the reference_existing_partition lines (they name neither 'gamemode_tdm' nor
    # 'REALITYMOD/team_deathmatch'), so they survived into the next recipe with no bundle open,
    # closed the superbundle early, and silently discarded the whole gamemode bundle -- two runs
    # in a row reported 8 bundles and looked like the bundle simply would not build.
    pristine = cmds_path + '.orig'

    if not os.path.exists(pristine):
        import shutil
        shutil.copy(cmds_path, pristine)

    # Drop blank lines: a single trailing empty string stopped the trailing-'build' strip below
    # (its .strip() is '' not 'build'), which left the pristine copy's own build pair in place and
    # produced FIVE consecutive builds -- closing the superbundle before the gamemode bundle.
    cmds = [l for l in open(pristine).read().split('\n') if l.strip()]
    add = ['add_json_partition %s "%s"' % (DST + '/part0', part_path),
           'add_json_partition %s "%s"' % (DST, root_path)]
    # The gamemode sub-level needs its OWN bundle: its SubWorldReferenceObjectData names
    # `levels/realitymod/team_deathmatch`, and the engine resolves that to a bundle. Putting the
    # partitions in the main bundle made the server load them and then block forever in
    # LoadBundles waiting for a bundle by that name that was never built.
    # Insert BEFORE the trailing build pair. build_sb NESTS: the first `build` closes the bundle and
    # the second writes the superbundle, so appending after them opened a bundle in a context that
    # was already finished -- the commands ran, reported nothing, and the bundle was never created
    # (the build kept reporting the same 8 bundles).
    while cmds and cmds[-1].strip() == 'build':
        cmds.pop()

    # The gamemode's own external references have to be IN the bundle or they resolve to nothing.
    # MEASURED: our part0 names three partitions we do not ship, and the important one is
    # gameplay/level_setups/complete_setup/full_teamdeathmatch -- it carries the 1 AutoTeamEntityData
    # and 2 TeamEntityData that ARE the level's teams. Without it no team exists, every player stays
    # TeamNeutral, and even an RCON admin.movePlayer reports ok=true and does not stick, because
    # there is no team to move onto.
    # add_raw_partition, NOT reference_existing_partition. The latter pulls in the partition's
    # WHOLE dependency closure: referencing these three took the superbundle from 49 MB to 1.48 GB
    # and the server then exited rc=1. These partitions are 25 KB, 8 KB and 7 KB on their own, and
    # what the level actually needs from them -- the AutoTeamEntityData and two TeamEntityData --
    # lives in the partition itself.
    # Split by what each partition is FOR.
    #
    # The level setup only has to EXIST for its AutoTeamEntityData + 2 TeamEntityData to register,
    # so a raw copy is enough -- and it must be raw, because its closure reaches soldiers and
    # weapons and took the superbundle to 1.48 GB.
    #
    # The two collision objects are PLACED (9 ReferenceObjectData instantiate them), and a placement
    # of a raw partition dies on its unresolved dependencies: MEASURED, carrying those 9 refs with
    # raw blueprints exits the server rc=0 silently during autoloaded-sublevel entity creation,
    # while dropping them loads fine. A placed blueprint needs its closure.
    refs = _refs_for(entities)

    # The bundle name has to be DST's, not a literal. The sub-level's SubWorldReferenceObjectData
    # names DST and the engine resolves that to a bundle; with the name pinned to team_deathmatch,
    # any level whose gamemode is called something else (MP_003 ships squaddeathmatch and has no
    # team_deathmatch at all) referenced a bundle that was never built and the load died at
    # "Loading terrain" with nothing said.
    cmds += (['build', 'build_bundle ' + DST_BUNDLE]
             + refs + add + ['build', 'build'])
    open(cmds_path, 'w').write('\n'.join(cmds) + '\n')
    print('emitted %s (%d instances) and part0 (%d instances)'
          % (DST, len(root['Instances']), len(part['Instances'])))

    wire(LEVEL_JSON)
    return 0


if __name__ == '__main__':
    sys.exit(main())
