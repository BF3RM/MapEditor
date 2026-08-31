#!/usr/bin/env python3
"""Export the meshes a level needs, so the standalone editor can draw real geometry.

The browser gets the level's structure from WebX (EBX as JSON) but EBX holds no geometry -- only a
reference to a MeshSet resource, which lives in the game's bundles. Rime reads those, so this walks
the level, works out which meshes it actually uses, and has Rime write each one as a .glb.

    tools/meshes/export_level_meshes.py --level Levels/MP_001/MP_001

Output (default WebUI/public/meshes/, served by the dev server at /meshes/):

    <name>.glb        one per mesh asset
    manifest.json     { "blueprints": { "<blueprint partition guid>": "<file>.glb" } }

The manifest is the point: it resolves blueprint -> mesh offline, so the browser fetches ONE small
file instead of opening a couple of hundred blueprint partitions at load.

Needs: a Rime build (see docs/bake-pipeline.md 2) and the game files it mounts.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

DEFAULT_GAME_PATH = os.path.expanduser('~/.local/share/Steam/steamapps/common/Battlefield 3')
DEFAULT_RIME = os.path.expanduser('~/Projects/Rime/bin/Release')
HERE = os.path.dirname(os.path.abspath(__file__))
# Deliberately NOT under WebUI/public: the dev server serves that statically, which would shadow
# the /meshes proxy and turn a cache miss into a 404 instead of an on-demand extraction.
DEFAULT_OUT = os.path.abspath(os.path.join(HERE, '..', '..', '.mesh-cache'))


class Ebx:
    """Read-only WebX client. Same data the browser uses, fetched here instead."""

    def __init__(self, game, base='https://webx.powback.com', workers=12):
        self.base = '%s/Games/%s/' % (base, game)
        self.workers = workers
        self.paths = {}
        self.cache = {}

    def open(self, cache_file=None):
        if cache_file and os.path.exists(cache_file):
            raw = json.load(open(cache_file))
        else:
            raw = json.load(urllib.request.urlopen(self.base + 'guidDictionary.json', timeout=120))

            if cache_file:
                json.dump(raw, open(cache_file, 'w'))

        self.paths = {k.lower(): v.replace('\\', '/') for k, v in raw.items()}

    def path_of(self, guid):
        return self.paths.get(guid.lower())

    def partition(self, guid):
        key = guid.lower()

        if key in self.cache:
            return self.cache[key]

        path = self.paths.get(key)
        result = None

        if path is not None:
            try:
                result = json.load(urllib.request.urlopen(self.base + path + '.json', timeout=120))
            except Exception:
                result = None

        self.cache[key] = result

        return result

    def partition_by_path(self, path):
        wanted = path.replace('\\', '/').lower()

        for guid, p in self.paths.items():
            if p.lower() == wanted:
                return self.partition(guid)

        return None

    def prefetch(self, guids):
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            list(pool.map(self.partition, guids))


def instances_of(partition):
    return {i['$guid'].lower(): i for i in partition['$instances']}


def primary(partition):
    return instances_of(partition).get(partition['$primaryInstance'].lower())


def refs(instance, field):
    f = instance['$fields'].get(field)
    value = f.get('$value') if f else None

    return [r for r in value if r and r.get('$partitionGuid')] if isinstance(value, list) else []


def ref(instance, field):
    f = instance['$fields'].get(field)
    value = f.get('$value') if f else None

    return value if isinstance(value, dict) and value.get('$partitionGuid') else None


def text(instance, field):
    f = instance['$fields'].get(field)
    value = f.get('$value') if f else None

    return value if isinstance(value, str) and value else None


GROUPS = ('WorldPartReferenceObjectData', 'SubWorldReferenceObjectData')


def collect_blueprints(ebx, level_path):
    """Every blueprint partition placed in the level, walking groups the way the engine does."""
    level = ebx.partition_by_path(level_path)

    if level is None:
        raise SystemExit('no partition for level "%s"' % level_path)

    found = set()
    seen = set()

    def walk(partition, instance, depth):
        if depth > 4:
            return

        for r in refs(instance, 'Objects'):
            target = partition if r['$partitionGuid'].lower() == partition['$guid'].lower() \
                else ebx.partition(r['$partitionGuid'])

            if target is None:
                continue

            child = instances_of(target).get(r['$instanceGuid'].lower())

            if child is None:
                continue

            blueprint = ref(child, 'Blueprint')

            if child['$type'] in GROUPS:
                # A subworld carries no Blueprint reference; it names its partition in BundleName.
                sub = ebx.partition(blueprint['$partitionGuid']) if blueprint is not None \
                    else ebx.partition_by_path(text(child, 'BundleName') or '')

                if sub is None or sub['$guid'].lower() in seen:
                    continue

                seen.add(sub['$guid'].lower())
                root = primary(sub)

                if root is not None:
                    walk(sub, root, depth + 1)
            elif blueprint is not None:
                found.add(blueprint['$partitionGuid'].lower())

    walk(level, primary(level), 0)

    return sorted(found)


def resolve_meshes(ebx, blueprint_guids):
    """blueprint partition guid -> mesh resource path, for those that name a mesh directly."""
    ebx.prefetch(blueprint_guids)
    mapping = {}

    for guid in blueprint_guids:
        partition = ebx.partition(guid)

        if partition is None:
            continue

        for instance in partition['$instances']:
            mesh = ref(instance, 'Mesh')

            if mesh is None:
                continue

            path = ebx.path_of(mesh['$partitionGuid'])

            if path is not None:
                mapping[guid] = path
                break

    return mapping


def level_roots(ebx):
    """Every Levels/<Map>/<Map> partition -- a level names its root after its own directory."""
    found = []

    for path in ebx.paths.values():
        parts = path.split('/')

        if len(parts) == 3 and parts[0] == 'Levels' and parts[1] == parts[2]:
            found.append(path)

    return sorted(found)


def file_name_for(mesh_path):
    return mesh_path.replace('/', '_').lower() + '.glb'


def run_rime(rime_dir, game_path, mesh_paths, out_dir, quiet=False):
    """One REPL session: mount once, then dump every mesh."""
    lines = [
        'mount_game "%s" Frostbite2_0 true' % game_path,
        'select_game 1',
    ]

    for mesh in mesh_paths:
        lines.append('dump_mesh Glb %s "%s"' % (mesh.lower(), os.path.join(out_dir, file_name_for(mesh))))

    lines.append('exit')

    commands = os.path.join(out_dir, 'rime-commands.txt')
    open(commands, 'w').write('\n'.join(lines) + '\n')

    env = dict(os.environ, DOTNET_ROOT=os.path.expanduser('~/.dotnet'))
    proc = subprocess.run([os.path.join(rime_dir, 'RimeREPL'), commands],
                          cwd=rime_dir, env=env, capture_output=True, text=True, timeout=7200)

    if not quiet:
        for line in (proc.stdout or '').splitlines():
            if 'Extracted' in line or 'Failed' in line or 'Exception' in line:
                print('  ' + line)

    return proc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', action='append', default=None,
                    help='level path; repeat for several (they share one Rime session)')
    ap.add_argument('--all', action='store_true', help='every level root the game ships')
    ap.add_argument('--game', default='Venice')
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--rime', default=DEFAULT_RIME)
    ap.add_argument('--gamepath', default=DEFAULT_GAME_PATH)
    ap.add_argument('--dict-cache', default=os.path.join('/tmp', 'webx-guiddict.json'))
    ap.add_argument('--skip-rime', action='store_true', help='resolve and write the manifest only')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    ebx = Ebx(args.game)
    print('loading guid dictionary...')
    ebx.open(args.dict_cache)
    print('  %d partitions' % len(ebx.paths))

    levels = args.level or []

    if args.all:
        levels = level_roots(ebx)

    if not levels:
        levels = ['Levels/MP_001/MP_001']

    # Resolve every level FIRST, then extract once. Mounting the game is the slow part of a Rime
    # run, so doing it per level would pay that cost 49 times over for a full export, and maps
    # share a lot of props -- the union is far smaller than the sum.
    per_level = {}
    wanted = set()

    for level in levels:
        try:
            blueprints = collect_blueprints(ebx, level)
        except SystemExit as e:
            print('%s: %s' % (level, e))
            continue

        mapping = resolve_meshes(ebx, blueprints)
        per_level[level] = mapping
        wanted.update(mapping.values())
        print('  %-34s %4d blueprints, %3d meshes' % (level, len(blueprints), len(mapping)))

    meshes = sorted(wanted)
    print('%d level(s), %d unique mesh assets' % (len(per_level), len(meshes)))

    if not args.skip_rime and meshes:
        if not os.path.exists(os.path.join(args.rime, 'RimeREPL')):
            raise SystemExit('no RimeREPL at %s -- see docs/bake-pipeline.md 2' % args.rime)

        # Skip what is already on disk: re-running for one more level should not redo the rest.
        todo = [m for m in meshes if not os.path.exists(os.path.join(args.out, file_name_for(m)))]
        print('extracting %d mesh(es) with Rime (%d already present)...' % (len(todo), len(meshes) - len(todo)))

        if todo:
            run_rime(args.rime, args.gamepath, todo, args.out, quiet=len(todo) > 40)

    total = 0

    for level, mapping in per_level.items():
        written = {}

        for guid, mesh in mapping.items():
            name = file_name_for(mesh)

            if os.path.exists(os.path.join(args.out, name)):
                written[guid] = name

        # Named for the map, not "manifest", so every exported level can sit in the same directory
        # -- a single manifest.json meant loading a second level silently reused the first's meshes.
        # `meshes` records which resource each file came from. Recovering that from the file name
        # is not possible -- '/' becomes '_' and mesh paths contain underscores of their own -- and
        # the on-demand server needs it to extract a file that is missing from the cache.
        manifest = {'game': args.game, 'level': level, 'blueprints': written,
                    'meshes': {file_name_for(m): m for m in set(mapping.values())}}
        name = level.rstrip('/').split('/')[-1]
        json.dump(manifest, open(os.path.join(args.out, name + '.json'), 'w'), indent=1)
        total += len(written)
        print('  %-34s %d meshes' % (level, len(written)))

    print('%d mesh references across %d level(s) -> %s' % (total, len(per_level), args.out))

    return 0 if total else 1


if __name__ == '__main__':
    sys.exit(main())
