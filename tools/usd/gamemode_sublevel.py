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
import sys
import uuid

SRC_GAMEMODE = 'levels/mp_001/team_deathmatch'
DST = 'levels/realitymod/team_deathmatch'
EBX = '/tmp/mp001ebx'

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
                        and os.environ.get('CARRY_MODE', 'min') not in ('refs', 'all')):
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

            # CARRY_MODE bisects the silent exit-0: 'min' = spawns + level-setup ref only (known
            # good), 'vol' = + the 5 boundary volumes, 'refs' = + the 9 collision refs, 'all' = both.
            # Default 'vol': spawns + the level-setup reference + the boundary volumes = 49 of the
            # 59 records, and the server loads it.
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
            mode = os.environ.get('CARRY_MODE', 'vol')

            if t == 'VolumeVectorShapeData' and mode not in ('vol', 'all'):
                continue

            out[g] = i
            seen[t] += 1

    return out, seen


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
    """Add a second SubWorldReferenceObjectData naming our gamemode bundle."""
    d = json.load(open(level_json))
    pg = d['PartitionGuid']
    ins = d['Instances']

    existing = [i for i in ins.values() if i.get('$type') == 'SubWorldReferenceObjectData']

    for e in existing:
        if e.get('BundleName') == DST:
            print('level already references %s' % DST)
            return False

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
    out_dir = sys.argv[1] if len(sys.argv) > 1 else '/tmp/emit_small'
    entities, seen = collect()
    print('carrying %d gameplay record(s) from %s: %s' % (len(entities), SRC_GAMEMODE, dict(seen)))

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
    refs = (['add_raw_partition gameplay/level_setups/complete_setup/full_teamdeathmatch '
             '"/tmp/full_teamdeathmatch.bin"']
            + ['reference_existing_partition %s 1' % n for n in (
                'objects/invisiblecollision_01/invisiblecollision_charandveh_01_scalable',
                'objects/invisiblecharactercollision_01/charactercollision_01')]
            # A PLACED physics blueprint needs its Havok physics RESOURCE, not just its partition.
            # Both collision blueprints are physics objects (HavokAsset x11 and x4, RigidBodyData,
            # PhysicsEntityData); with the partition present but the resource absent, instantiating
            # the placement killed the server silently (exit 0). Same shape as the mesh/texture chunk
            # problem: the header resolves, the payload does not.
            + ['add_existing_resource_with_chunks %s 1' % n
               for n in open('/tmp/physres.txt').read().split() if n.strip()])

    cmds += (['build', 'build_bundle Win32/Levels/REALITYMOD/team_deathmatch']
             + refs + add + ['build', 'build'])
    open(cmds_path, 'w').write('\n'.join(cmds) + '\n')
    print('emitted %s (%d instances) and part0 (%d instances)'
          % (DST, len(root['Instances']), len(part['Instances'])))

    wire('/tmp/TestJson1_usd.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
