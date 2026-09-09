#!/usr/bin/env python3
"""Carry the partitions a level's RegistryContainer declares, so its weapons actually resolve.

A level's registry names the gameplay assets it expects at runtime -- on mp_001 that is 1628 assets
and 132 entities, 1543 of them under `weapons/`. Those refs point at partitions that live outside
the level's own bundle, and NOTHING in the export carried them, so every one of them dangled:

    [BLT-WPN] resolved=0 missing=12

measured in-engine with ResourceManager:SearchForDataContainer after Level:Loaded, against a
control (the level's own world parts) that resolved in the same run. Mounting does not fix it --
`Weapons` was already in the mount list and they still did not resolve, which is the third time
MountSuperBundle has failed to make content reachable (chunks and the gamemode level setup were the
others). They have to be IN the bundle.

Carrying them as raw partitions works and is cheap: 1688 partitions is 11 MB on disk and about
5.9 MB of superbundle. After it:

    [BLT-WPN] resolved=60 missing=0

on a random 60-name sample across weapons and persistence.

WHAT IS DELIBERATELY NOT CARRIED
--------------------------------
Placeable blueprints -- `architecture/`, `objects/`, `vehicles/` -- kill the server SILENTLY
(exit 0, during load, no error). Bisected: 11 weapon partitions load, 100 partitions starting with
architecture/facadeclusters and objects/vegetation do not, and 1688 weapons+persistence do. Those
blueprints are meshes and physics that something will try to instantiate, and a raw partition has
no dependency closure, so instantiating one reaches for assets that are not there. It is the same
failure the 9 invisible-collision placements in the gamemode sub-level produce.

Carrying those needs their closure, which `reference_existing_partition` provides at a cost this
level cannot pay: referencing three of them took a 49 MB superbundle to 1.48 GB.
"""
import argparse
import collections
import glob
import json
import os
import subprocess
import sys

# The one namespace that cannot be carried, rather than a list of the ones that can.
#
# This was an allow-list of weapons/ and persistence/, which left 64 of MP_001's declared
# partitions on the floor. Bisected one namespace at a time: architecture, props, vehicles, levels,
# gameplay, xp_raw, characters, animations, ui, fx and sound ALL load. Only objects/ kills the
# server -- exit 0 during autoloaded-sublevel entity creation, raw or with its dependency closure,
# and in either half of the eight entries, so it is the class and not one bad partition. It is the
# same failure signature as the gamemode's collision placements, which were fixed by placing our
# own blueprint instead of the game's; the registry declares these rather than placing them, so
# that fix does not reach them.
#
# MEASURED after this: MP_001 carries 1744 of 1752 and the engine resolves all 1744.
# Bisected to the individual partition. Five of MP_001's eight objects/ entries carry fine --
# ashtray, ceiling light, iraq lamp, both plastic crates. These three do not, and all three are
# things the level ALSO places through our own blueprints, which is the conflict repoint_registry
# resolves where it can.
UNSAFE = ('objects/oilbarrel_01/',
          'objects/vegetation/bushazalea_m_01/',
          'objects/vegetation/treelinden_l_01/')


def registry_of(part_dir):
    """The exported level's RegistryContainer, or None."""
    for f in glob.glob(os.path.join(part_dir, '*.json')):
        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        for inst in (doc.get('Instances') or {}).values():
            if inst.get('$type') == 'RegistryContainer' and inst.get('AssetRegistry'):
                return inst, doc, f

    return None, None, None


def resolve_guids(guids, closure_dir, rime, game):
    """Dump any partition the closure does not cover, so nothing is left unresolved.

    A registry entry the dump has never seen is invisible: not carried, not skipped, not counted as
    missing. MEASURED before this, per level: 4 to 64 of them, and the number varied only with how
    much of that level the closure dump happened to cover. Rime can resolve a partition by guid, so
    ask it rather than reporting a hole.
    """
    missing = [g for g in guids if not os.path.exists(os.path.join(closure_dir, '%s.json' % g))]

    if not missing or not rime:
        return len(missing)

    os.makedirs(closure_dir, exist_ok=True)
    recipe = os.path.join(closure_dir, 'resolve.cmds')
    open(recipe, 'w').write('\n'.join(
        ['mount_game "%s" Frostbite2_0 true' % game, 'select_game 1']
        + ['dump_partition_json_by_guid %s "%s"' % (g, os.path.join(closure_dir, '%s.json' % g))
           for g in missing]) + '\n')

    print('resolving %d guid(s) the closure dump does not cover...' % len(missing))

    env = dict(os.environ)
    env.setdefault('DOTNET_ROOT', os.path.expanduser('~/.dotnet'))
    binary = os.path.join(rime, 'RimeREPL') if os.path.isdir(rime) else rime
    subprocess.run([binary, recipe], check=False, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return sum(1 for g in missing
               if not os.path.exists(os.path.join(closure_dir, '%s.json' % g)))


def names_for(reg, closure_dir, own_guids, rime=None, game=None):
    """Partition NAMES the registry declares, resolved through a closure dump keyed by guid."""
    wanted = [pg for pg in
              ((ref.get('PartitionGuid') or '').lower()
               for ref in (reg.get('AssetRegistry') or []) + (reg.get('EntityRegistry') or []))
              if pg and pg not in own_guids]

    if rime:
        resolve_guids(sorted(set(wanted)), closure_dir, rime, game)

    names, unresolved = set(), 0

    for pg in wanted:
        path = os.path.join(closure_dir, '%s.json' % pg)

        if not os.path.exists(path):
            unresolved += 1
            continue

        try:
            name = json.load(open(path)).get('Name')
        except Exception:                                    # noqa: BLE001
            continue

        if name:
            names.add(name)

    return sorted(names), unresolved


def our_blueprints(part_dir):
    """{blueprint partition name: (partition guid, primary instance guid)} for what we emit."""
    index = {}

    for f in glob.glob(os.path.join(part_dir, '*.json')):
        try:
            doc = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        primary = (doc.get('Instances') or {}).get(doc.get('PrimaryInstanceGuid') or '')

        if primary and primary.get('$type') == 'ObjectBlueprint' and doc.get('Name'):
            index[doc['Name'].lower()] = (doc['PartitionGuid'], doc['PrimaryInstanceGuid'])

    return index


def _mesh_of(doc, closure_dir):
    """The mesh partition NAME a blueprint points at, through any field that names one."""
    for instance in (doc.get('Instances') or {}).values():
        for field in ('Mesh', 'MeshAsset'):
            target = instance.get(field)

            if not isinstance(target, dict) or not target.get('PartitionGuid'):
                continue

            path = os.path.join(closure_dir, '%s.json' % target['PartitionGuid'].lower())

            if os.path.exists(path):
                try:
                    name = json.load(open(path)).get('Name')
                except Exception:                            # noqa: BLE001
                    continue

                if name:
                    return name

    return None


def repoint_registry(reg, doc, part_dir, closure_dir, rime, game):
    """Point registry entries at OUR blueprint wherever we emit one for the same mesh.

    Three of MP_001's declared objects/ partitions kill the server when carried -- the oil barrel
    and two vegetation blueprints -- and they are all things the level ALSO places through the
    blueprints this exporter writes. Carrying the game's copy alongside ours puts two blueprints in
    the bundle for one object, and the placement finds the game's, which has no closure.

    Same fix as the gamemode sub-level: name ours. An entry that repoints needs no copy of the
    game's partition at all, because ours is already in the bundle.

    Returns the set of names that were repointed.
    """
    ours = our_blueprints(part_dir)

    if not ours:
        return set()

    # The mesh a blueprint names may itself be outside the closure dump; resolve those first.
    wanted = []

    for ref in (reg.get('AssetRegistry') or []) + (reg.get('EntityRegistry') or []):
        path = os.path.join(closure_dir, '%s.json' % (ref.get('PartitionGuid') or '').lower())

        if not os.path.exists(path):
            continue

        try:
            bp = json.load(open(path))
        except Exception:                                    # noqa: BLE001
            continue

        for instance in (bp.get('Instances') or {}).values():
            for field in ('Mesh', 'MeshAsset'):
                target = instance.get(field)

                if isinstance(target, dict) and target.get('PartitionGuid'):
                    wanted.append(target['PartitionGuid'].lower())

    if wanted and rime:
        resolve_guids(sorted(set(wanted)), closure_dir, rime, game)

    moved = set()

    for ref in (reg.get('AssetRegistry') or []) + (reg.get('EntityRegistry') or []):
        path = os.path.join(closure_dir, '%s.json' % (ref.get('PartitionGuid') or '').lower())

        if not os.path.exists(path):
            continue

        try:
            bp = json.load(open(path))
        except Exception:                                    # noqa: BLE001
            continue

        name = bp.get('Name')
        mesh = _mesh_of(bp, closure_dir)

        if not name or not mesh:
            continue

        head, _, leaf = mesh.rpartition('/')
        found = ours.get(('%s/blueprint_%s' % (head, leaf)).lower())

        if not found:
            continue

        ref['PartitionGuid'], ref['InstanceGuid'] = found
        moved.add(name)

    return moved


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('emit_dir', help='an emit output directory (holds partitions/ and build.cmds)')
    ap.add_argument('closure_dir', help='closure dump, files named <partition guid>.json')
    ap.add_argument('--dump-dir', default='/tmp/regparts',
                    help='where the raw partitions are (or will be) dumped')
    ap.add_argument('--rime', help='RimeREPL binary; with it, missing dumps are produced')
    ap.add_argument('--game', default='/home/powos/.local/share/Steam/steamapps/common/Battlefield 3')
    ap.add_argument('--all-namespaces', action='store_true',
                    help='carry EVERY declared namespace, including placeable blueprints. This is '
                         'known to kill the server silently -- see the module docstring.')
    args = ap.parse_args()

    part_dir = os.path.join(args.emit_dir, 'partitions')
    # REGISTRY_EXTRA names namespaces to carry ANYWAY, comma separated -- i.e. to override UNSAFE.
    # A bisecting knob: "all of them kills the server" and "this one kills the server" are
    # different findings, and only the second one tells you what to fix.
    _extra = tuple(n.strip().rstrip('/') + '/'
                   for n in os.environ.get('REGISTRY_EXTRA', '').split(',') if n.strip())
    _closure_ns = tuple(n.strip().rstrip('/') + '/'
                        for n in os.environ.get('REGISTRY_CLOSURE', '').split(',') if n.strip())

    reg, _doc, _doc_path = registry_of(part_dir)

    if reg is None:
        print('no populated RegistryContainer under %s' % part_dir)
        return 1

    own = {(json.load(open(f)).get('PartitionGuid') or '').lower()
           for f in glob.glob(os.path.join(part_dir, '*.json'))}

    # Repoint before resolving names: an entry now pointing at one of ours needs no copy of the
    # game's partition, so it must not appear in the carry list at all.
    moved = repoint_registry(reg, _doc, part_dir, args.closure_dir, args.rime, args.game)

    if moved:
        json.dump(_doc, open(_doc_path, 'w'), indent=1)
        print('repointed %d registry entry(ies) at our own blueprints' % len(moved))

    names, unresolved = names_for(reg, args.closure_dir, own, args.rime, args.game)
    names = [n for n in names if n not in moved]

    # A registry that declares what the bundle does not ship is what makes the engine reach for it.
    #
    # objects/oilbarrel_01 is the last partition we cannot carry -- a BangerEntityData with its own
    # explosion, physics and health states, which exits the server rc=0 whether it is carried raw
    # or with its full dependency closure, and which this level never places. Leaving the
    # declaration in place while omitting the partition is the worst of both: the level advertises
    # an asset that is not there. Drop the declaration instead, so what the level declares and what
    # it ships are the same set.
    _drop = {n.lower() for n in names if n.startswith(UNSAFE) and not n.startswith(_extra)}
    _dropped = 0

    if _drop:
        for _field in ('AssetRegistry', 'EntityRegistry'):
            _kept = []

            for _ref in (reg.get(_field) or []):
                _path = os.path.join(args.closure_dir,
                                     '%s.json' % (_ref.get('PartitionGuid') or '').lower())
                _name = None

                if os.path.exists(_path):
                    try:
                        _name = (json.load(open(_path)).get('Name') or '').lower()
                    except Exception:                        # noqa: BLE001
                        _name = None

                if _name and _name in _drop:
                    _dropped += 1
                    continue

                _kept.append(_ref)

            if reg.get(_field) is not None:
                reg[_field] = _kept

        if _dropped:
            json.dump(_doc, open(_doc_path, 'w'), indent=1)
            print('dropped %d declaration(s) for partitions we cannot carry, so the registry '
                  'declares exactly what ships' % _dropped)

        names = [n for n in names if n.lower() not in _drop]
    kept = (names if args.all_namespaces
            else [n for n in names
                  if not n.startswith(UNSAFE) or n.startswith(_extra)])
    skipped = [n for n in names if n not in kept]

    print('registry declares %d asset(s) and %d entity(ies)'
          % (len(reg.get('AssetRegistry') or []), len(reg.get('EntityRegistry') or [])))
    print('resolved to %d distinct partition(s); %d guid(s) absent from the closure dump'
          % (len(names), unresolved))
    print('carrying %d, skipping %d' % (len(kept), len(skipped)))

    if skipped:
        by_ns = collections.Counter(n.split('/')[0] for n in skipped)
        print('  skipped namespaces (these kill the server; see UNSAFE): %s' % dict(by_ns))

    os.makedirs(args.dump_dir, exist_ok=True)
    need = [n for n in kept
            if not os.path.exists(os.path.join(args.dump_dir, n.replace('/', '_') + '.bin'))]

    if need and args.rime:
        cmds = ['mount_game "%s" Frostbite2_0 true' % args.game, 'select_game 1']
        cmds += ['dump_partition %s "%s"' % (n, os.path.join(args.dump_dir,
                                                             n.replace('/', '_') + '.bin'))
                 for n in need]
        recipe = os.path.join(args.dump_dir, 'dump.cmds')
        open(recipe, 'w').write('\n'.join(cmds) + '\n')
        print('dumping %d missing partition(s) with Rime...' % len(need))
        # DOTNET_ROOT, or the apphost cannot find the runtime, dumps nothing, and every one of
        # these partitions is silently skipped below.
        env = dict(os.environ)
        env.setdefault('DOTNET_ROOT', os.path.expanduser('~/.dotnet'))

        subprocess.run([os.path.join(args.rime, 'RimeREPL')
                        if os.path.isdir(args.rime) else args.rime, recipe],
                       check=False, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elif need:
        print('%d partition(s) are not dumped and --rime was not given; they will be skipped'
              % len(need))

    cmds_path = os.path.join(args.emit_dir, 'build.cmds')
    pristine = cmds_path + '.orig'

    if not os.path.exists(pristine):
        import shutil
        shutil.copy(cmds_path, pristine)

    src = [l for l in open(pristine).read().split('\n') if l.strip()]
    src = [l for l in src if args.dump_dir not in l]

    # Never re-carry a partition the emitter already wrote out itself.
    #
    # The emitter emits `add_json_partition <name>` for any registry partition a DCC EDITED. This
    # tool then appended `add_raw_partition <name>` for the same name, from the pristine game dump,
    # LATER in the same bundle -- and the engine takes the later one. MEASURED end to end: the
    # A-91's DeployTime edited 0.67 -> 0.125 arrived in the built superbundle as 0.125 and the
    # running engine still read 0.67. Dropping this one raw line makes the same server read 0.125.
    #
    # Silent, and it looked exactly like the game shadowing the mod: the value was demonstrably
    # right in the .sb and demonstrably wrong in the engine. It is not shadowing -- with BOTH of
    # our copies removed the engine cannot find the instance at all, so the level bundle is the
    # only source and this tool was overwriting our own edit.
    emitted = {l.split(' ', 2)[1] for l in src
               if l.startswith('add_json_partition ') and len(l.split(' ', 2)) > 1}
    edited = [n for n in kept if n in emitted]
    lines = []
    shipped = []

    for n in kept:
        if n in emitted:
            shipped.append(n)                                # the emitter carries an edited copy
            continue

        f = os.path.join(args.dump_dir, n.replace('/', '_') + '.bin')

        # REGISTRY_CLOSURE names namespaces to carry WITH their dependency closure instead of as
        # raw bytes. A raw partition has no dependencies, so a blueprint something instantiates
        # dies on the first thing it reaches for; closure fixes that and costs whatever the closure
        # costs, which is why it is per-namespace rather than a global default.
        if n.startswith(_closure_ns):
            lines.append('reference_existing_partition %s 1' % n)
            shipped.append(n)
            continue

        if os.path.exists(f) and os.path.getsize(f) > 0:
            lines.append('add_raw_partition %s "%s"' % (n, f))
            shipped.append(n)

    if edited:
        print('  %d registry partition(s) left to the emitter, which carries an EDITED copy: %s'
              % (len(edited), ', '.join(sorted(edited)[:4])))

    # build_sb NESTS: the trailing pair closes the bundle then writes the superbundle, so anything
    # appended after them runs in a closed context and is silently discarded.
    while src and src[-1].strip() == 'build':
        src.pop()

    src += lines + ['build', 'build']
    open(cmds_path, 'w').write('\n'.join(src) + '\n')
    print('wrote %s with %d add_raw_partition line(s)' % (cmds_path, len(lines)))

    # Hand the harness the names THIS level actually carries, so its resolve probe tests the level
    # in front of it rather than a list of MP_001's weapons. Without this the probe reported
    # resolved=13 missing=47 on MP_003 -- which measured the probe, not the level.
    ext_dir = os.environ.get('BLT_EXT_DIR')

    if ext_dir and os.path.isdir(ext_dir):
        carried = os.path.join(ext_dir, 'CarriedRegistry.lua')

        with open(carried, 'w') as handle:
            handle.write('-- Generated by registry_assets.py: the partitions this build carries.\n')
            handle.write('return {\n')

            # What the recipe actually SHIPS, not what was selected. A name with no dump is
            # skipped above, and publishing it anyway made the probe report a miss for a partition
            # the build never carried -- MP_003's weapons/m16a4/m16a4kitpickup, 476 of 477.
            for n in shipped:
                handle.write("    '%s',\n" % n.replace("'", "\\'"))

            handle.write('}\n')

        print('wrote %s with %d name(s) for the resolve probe' % (carried, len(shipped)))

    return 0


if __name__ == '__main__':
    sys.exit(main())
