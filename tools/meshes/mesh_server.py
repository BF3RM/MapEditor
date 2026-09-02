#!/usr/bin/env python3
"""Serve level meshes to the standalone editor, extracting them from the game on demand.

The browser asks for a level's manifest and then for individual .glb files; anything not already
cached is extracted from the game with Rime, cached on disk, and served. Nothing is exported ahead
of time -- open a level and its geometry appears.

    tools/meshes/mesh_server.py            # http://localhost:8091, cache in WebUI/public/meshes

Rime stays MOUNTED. Mounting BF3 takes ~30s, which is the whole cost of an export run, so the
server keeps one RimeREPL alive (a commands file that mounts and then DROPs to the REPL) and writes
`dump_mesh` to its stdin as requests arrive. Extraction after that is well under a second.

The dev server proxies /meshes here (see WebUI/vue.config.js), so the browser only ever talks to
one origin.
"""
import base64
import glob
import json
import os
import queue
import fcntl
import pty
import struct
import subprocess
import sys
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from export_level_meshes import (  # noqa: E402
    DEFAULT_GAME_PATH, DEFAULT_OUT, DEFAULT_RIME, Ebx, collect_blueprints, file_name_for,
    level_roots, primary as primary_instance, ref, refs, resolve_meshes, text,
)

def _params(materials):
    """How many texture parameters an entry actually carries."""
    return sum(len(m) for m in materials)


PORT = int(os.environ.get('MESH_PORT', '8091'))
CACHE = os.environ.get('MESH_CACHE', DEFAULT_OUT)
GAME = os.environ.get('MESH_GAME', 'Venice')


class Rime:
    """A mounted RimeREPL, driven through a pseudo-terminal.

    A PTY rather than pipes because the REPL reads its input with Console.ReadKey(), which throws
    outright when stdin is redirected ("Cannot read keys when either application does not have a
    console") -- it needs something that looks like a terminal.

    Its output is drained by a thread from the moment it starts. That is not optional: the REPL
    echoes every keystroke and prints a line per command, and with nobody reading, the buffer fills
    and Rime blocks mid-extraction. The tail is also the only place its errors surface.
    """

    def __init__(self, rime_dir, game_path):
        self.rime_dir = rime_dir
        self.game_path = game_path
        self.proc = None
        self.master = None
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.done = threading.Event()
        self.failed = False
        self.tail = []

    def _drain(self):
        buffer = ''

        while True:
            try:
                chunk = os.read(self.master, 4096).decode('utf-8', 'replace')
            except OSError:
                chunk = ''

            if not chunk:
                break

            # Answer cursor-position reports (ESC[6n). .NET's console echo asks the terminal where
            # the cursor is after keystrokes and WAITS for the reply; with nothing answering, the
            # REPL never finishes reading the line and the command simply never runs -- silently,
            # which is what made this look like "dump_mesh does nothing".
            queries = chunk.count('\x1b[6n')

            if queries > 0:
                try:
                    os.write(self.master, b'\x1b[1;1R' * queries)
                except OSError:
                    pass

            buffer += chunk

            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                line = line.strip()

                if line:
                    self.tail.append(line)
                    del self.tail[:-40]

                lowered = line.lower()

                if 'successfully mounted' in lowered:
                    self.ready.set()

                # A command is finished when the REPL prints its prompt banner again -- which it
                # does whatever the outcome. Matching on result text instead means every command
                # with its own wording (dump_texture says "successfully converted and dumped")
                # silently waits out the full timeout, stalling everything behind it.
                if ('failed' in lowered or 'could not' in lowered
                        or 'command not found' in lowered):
                    self.failed = True
                    self.done.set()

        print('[mesh] Rime exited; last output:', flush=True)

        for line in self.tail[-8:]:
            print('   ' + line, flush=True)

        self.ready.set()

    def start(self):
        boot = os.path.join(CACHE, '.rime-boot.txt')
        os.makedirs(CACHE, exist_ok=True)
        # select_game is issued INTERACTIVELY below, not here. DROP hands the REPL the context the
        # commands file STARTED with (Program.cs passes s_StartingContext), so a select_game in the
        # file is undone the moment it drops -- the prompt returns to the base context and
        # dump_mesh, which only exists inside a game, comes back "Command not found".
        open(boot, 'w').write('mount_game "%s" Frostbite2_0 true\nDROP\n' % self.game_path)

        self.master, slave = pty.openpty()

        # Give the terminal a real size. The REPL draws its prompt against Console.WindowWidth and
        # WindowHeight, and on a PTY that reports 0 it dies in Substring before reading a command.
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 200, 0, 0))

        env = dict(os.environ, DOTNET_ROOT=os.path.expanduser('~/.dotnet'), TERM='xterm')
        self.proc = subprocess.Popen(
            [os.path.join(self.rime_dir, 'RimeREPL'), boot],
            cwd=self.rime_dir, env=env,
            stdin=slave, stdout=slave, stderr=slave, close_fds=True)

        os.close(slave)
        threading.Thread(target=self._drain, daemon=True).start()

        if not self.ready.wait(timeout=300) or self.proc.poll() is not None:
            print('[mesh] Rime did not mount', flush=True)
            return False

        # The REPL reaches its prompt a moment after the mount line.
        time.sleep(3)

        # Enter the game's context, where dump_mesh lives.
        os.write(self.master, b'select_game 1\r')
        time.sleep(2)

        if not self.alive():
            print('[mesh] Rime exited while selecting the game', flush=True)
            return False

        print('[mesh] game mounted and selected, Rime ready', flush=True)

        return True

    def alive(self):
        return self.proc is not None and self.proc.poll() is None

    def terrain(self, streamingtree, destination, timeout=900):
        """A level's heightfield quadtree: node bounds plus their height samples."""
        return self._command('dump_terrain_nodes %s "%s"' % (streamingtree.lower(), destination),
                             destination, timeout)

    def shader_textures(self, shaderdb, destination, timeout=900):
        """Each shader's own StreamableTextures -- the surface of every mesh whose material carries
        no texture parameters of its own."""
        return self._command('dump_shader_textures %s "%s"' % (shaderdb.lower(), destination),
                             destination, timeout)

    def textures(self, mvdb, destination, timeout=900):
        """Which texture each mesh subset is painted with. The bindings live in the level's
        MeshVariationDatabase, not on the materials in a mesh's own partition."""
        return self._command('dump_mesh_textures %s "%s"' % (mvdb.lower(), destination),
                             destination, timeout)

    def texture(self, resource, destination, timeout=60):
        return self._command('dump_texture %s "%s"' % (resource.lower(), destination),
                             destination, timeout)

    def visual_terrain(self, resource, destination, timeout=300):
        """What a level's ground is painted with: its terrain layers and the shaders that blend
        them. The layer textures are not in EBX; this is the only thing that names them."""
        return self._command('dump_visual_terrain %s "%s"' % (resource.lower(), destination),
                             destination, timeout)

    def chunk(self, guid, destination, timeout=120):
        """One streamed chunk. A terrain tile's height samples live in one of these rather than in
        the tree, on every level whose heightfield tree carries no samples of its own."""
        return self._command('dump_chunk %s "%s"' % (guid.lower(), destination),
                             destination, timeout)

    def placements(self, level_path, destination, timeout=900):
        """Resolve where every mesh in a level sits, including the baked StaticModelGroup
        instances whose transforms live in the level's Havok physics data rather than EBX."""
        return self._command('dump_level_placements %s "%s"' % (level_path.lower(), destination),
                             destination, timeout)

    def dump(self, mesh_path, destination, timeout=60):
        """Extract one mesh. Serialised: one REPL, one command at a time."""
        return self._command('dump_mesh Glb %s "%s"' % (mesh_path.lower(), destination),
                             destination, timeout)

    def _command(self, command, destination, timeout):
        with self.lock:
            if not self.alive():
                print('[mesh] Rime is not running; cannot run: %s' % command, flush=True)
                return False

            self.done.clear()
            self.failed = False

            try:
                os.write(self.master, (command + '\r').encode())
            except OSError as e:
                print('[mesh] write to Rime failed: %s' % e, flush=True)
                return False

            # Wait for the FILE, not for the prompt.
            #
            # Prompt detection looked cleaner but is unreliable: the REPL redraws its banner with
            # cursor moves rather than plain lines, so the marker is often never seen on its own
            # line and a perfectly good extraction reports a timeout. (Measured: three textures that
            # this reported as hanging extract in seconds when driven by hand.) Watching for the
            # file is what actually tracks the work; `done` is kept only as an early exit when the
            # REPL says outright that it failed, and the type guards upstream keep us from asking
            # for things that never produce a file at all.
            deadline = time.time() + timeout
            size = -1

            while time.time() < deadline:
                if os.path.exists(destination):
                    current = os.path.getsize(destination)

                    if current > 0 and current == size:
                        return True

                    size = current
                elif self.done.is_set() and self.failed:
                    return False

                if not self.alive():
                    return False

                time.sleep(0.1)

            print('[mesh] timed out running: %s' % command, flush=True)

            return False

            # Wait for the file rather than parse the REPL's prose: a failed dump reports in words,
            # and a zero-byte file is that same failure.



class Meshes:
    """Resolves levels to meshes, and caches both the manifests and the .glb files."""

    def __init__(self, rime, streamer=None):
        self.rime = rime
        # Tiles come off their own instance so they are not stuck behind a level's opening work.
        self.streamer = streamer or rime
        self.stream_lock = threading.Lock() if streamer else None
        self.ebx = Ebx(GAME)
        self.ebx.open(os.path.join('/tmp', 'webx-guiddict.json'))
        self.levels = {p.split('/')[-1].lower(): p for p in level_roots(self.ebx)}
        self.by_file = {}
        self.unavailable = set()
        self.queued = set()
        self.kinds = {}
        self.catalogue = None
        self.warming = False
        # Extraction never happens on a request thread: a browser opens about six connections per
        # origin, so one slow dump holding a response starves every other fetch -- geometry included.
        # Requests answer from cache or say "not yet"; this queue does the work behind them.
        self.queue = queue.Queue()
        self.lock = threading.Lock()
        threading.Thread(target=self._worker, daemon=True).start()

        self._load_cached_manifests()
        print('[mesh] %d partitions, %d levels, %d meshes known'
              % (len(self.ebx.paths), len(self.levels), len(self.by_file)), flush=True)

    def _worker(self):
        while True:
            kind, resource, path = self.queue.get()

            try:
                if os.path.exists(path):
                    continue

                if kind == 'mesh':
                    if not self.is_mesh(resource) or not self.rime.dump(resource, path):
                        self.unavailable.add(os.path.basename(path))
                elif kind == 'texture':
                    if not self.is_texture(resource) or not self.rime.texture(resource, path):
                        self.unavailable.add(os.path.basename(path))
            except Exception as e:
                print('[mesh] worker error on %s: %s' % (resource, e), flush=True)
            finally:
                self.queue.task_done()

    def _request(self, kind, resource, path):
        """Ask for something to be extracted, without waiting for it."""
        name = os.path.basename(path)

        if os.path.exists(path):
            return path

        if name in self.unavailable or name in self.queued:
            return None

        self.queued.add(name)
        self.queue.put((kind, resource, path))

        return None

    def _load_cached_manifests(self):
        """Learn every cached level's meshes up front, so a .glb can be extracted without the
        browser having asked for that level's manifest first."""
        for name in os.listdir(CACHE) if os.path.isdir(CACHE) else []:
            if not name.endswith('.json'):
                continue

            path = os.path.join(CACHE, name)

            try:
                manifest = json.load(open(path))
            except Exception:
                continue

            # Manifests written before mesh paths were recorded cannot be extracted from; drop them
            # and let the next request rebuild one that can.
            if 'meshes' not in manifest:
                os.remove(path)
                continue

            self._remember(manifest)

    def manifest(self, map_name):
        path = os.path.join(CACHE, map_name + '.json')

        if os.path.exists(path):
            manifest = json.load(open(path))
            self._remember(manifest)
            return manifest

        level = self.levels.get(map_name.lower())

        if level is None:
            return None

        with self.lock:
            print('[mesh] resolving %s...' % level, flush=True)
            mapping = resolve_meshes(self.ebx, collect_blueprints(self.ebx, level))

            # A blueprint is a LIST of parts now, each with its offset inside the prefab.
            blueprints = {}
            meshes = {}

            for guid, parts in mapping.items():
                blueprints[guid] = [
                    {'file': file_name_for(p['mesh']), 'transform': p['transform']} for p in parts
                ]

                for part in parts:
                    name = file_name_for(part['mesh'])
                    meshes[name] = part['mesh']
                    self.by_file[name] = part['mesh']

            manifest = {'game': GAME, 'level': level, 'blueprints': blueprints, 'meshes': meshes}

            json.dump(manifest, open(path, 'w'), indent=1)
            print('[mesh] %s: %d meshes' % (map_name, len(mapping)), flush=True)

            return manifest

    def _remember(self, manifest):
        # Which resource each cached file came from, so a miss can still be extracted.
        for name, mesh in manifest.get('meshes', {}).items():
            self.by_file[name] = mesh

    def placements(self, map_name):
        """Every mesh placement in a level, resolved by Rime -- the only source for the baked
        statics, whose per-instance transforms are in the Havok data and not in EBX."""
        path = os.path.join(CACHE, map_name + '.placements.json')

        if not os.path.exists(path):
            level = self.levels.get(map_name.lower())

            if level is None:
                return None

            with self.lock:
                print('[mesh] resolving placements for %s (walks the level in Rime)...' % level, flush=True)

                if not self.rime.placements(level, path):
                    return None

        raw = open(path, 'rb').read()

        # Learn the meshes it names, so their .glb files can be extracted on request too.
        try:
            named = list(json.loads(raw).get('meshes', {}))
        except Exception:
            named = []

        for mesh in named:
            self.by_file.setdefault(file_name_for(mesh), mesh)

        # Warm the cache in the background. A level names hundreds of meshes and Rime extracts them
        # one at a time, so leaving it to demand means hundreds of browser requests queueing behind
        # one lock -- the first few succeed and the rest are still waiting when the page has given
        # up on them. Warming keeps that work off the request path entirely.
        self._warm(named)

        return raw

    def is_mesh(self, resource):
        """Is this resource actually a MeshSet?

        A level names plenty of things that are not -- FX entities especially -- and asking Rime to
        dump one does not fail, it HANGS: 120s of a single mounted REPL, per resource, blocking
        every other request behind it. The EBX says what a partition is, so ask that first.
        """
        cached = self.kinds.get(resource.lower())

        if cached is not None:
            return cached

        partition = self.ebx.partition_by_path(resource)
        kind = False

        if partition is not None:
            primary = primary_instance(partition)
            kind = primary is not None and primary['$type'].endswith('MeshAsset')

        self.kinds[resource.lower()] = kind

        return kind

    def is_texture(self, resource):
        """Same guard as is_mesh: a MVDB can name a texture this dump does not carry, and
        dump_texture on a missing resource hangs the REPL rather than failing."""
        cached = self.kinds.get('tex:' + resource.lower())

        if cached is not None:
            return cached

        partition = self.ebx.partition_by_path(resource)
        kind = False

        if partition is not None:
            primary = primary_instance(partition)
            kind = primary is not None and primary['$type'].endswith('TextureAsset')

        self.kinds['tex:' + resource.lower()] = kind

        return kind

    def _warm(self, meshes):
        if self.warming:
            return

        self.warming = True

        def run():
            for mesh in meshes:
                self._request('mesh', mesh, os.path.join(CACHE, file_name_for(mesh)))

            self.queue.join()
            print('[mesh] warm-up done: %d unavailable' % len(self.unavailable), flush=True)
            self.warming = False

        threading.Thread(target=run, daemon=True).start()

    def terrain(self, map_name):
        """The level's terrain surface. Nothing in EBX describes it -- the heightfield lives in a
        streaming-tree resource, whose name is not derivable, so the mounted resources are searched
        for the one belonging to this level."""
        path = os.path.join(CACHE, map_name + '.terrain.json')

        if not os.path.exists(path):
            with self.lock:
                resource = self._terrain_resource(map_name)

                if resource is None or not self.rime.terrain(resource, path):
                    return None

                self._decode_materials(path)

        return open(path, 'rb').read()

    def terrain_layers(self, map_name):
        """The level's terrain layers, and the textures they are painted with.

        Two halves. The VisualTerrain resource says how many layers there are and which shader
        blends each combination of them -- MP_017 has seven, all virtual-textured, over 148 draws.
        The textures themselves are not named anywhere that resolves, but every level keeps them in
        one place, `Levels/<Map>/Terrain/Textures`, so they are listed from there: diffuse (_D),
        normal (_N) and the masks (_RGB, _M) kept apart by suffix.
        """
        path = os.path.join(CACHE, map_name + '.layers.json')

        if not os.path.exists(path):
            info = {}
            resource = self._terrain_resource(map_name)

            if resource is not None:
                visual = os.path.join(CACHE, map_name + '.visual.json')
                # The two resources sit side by side, differing only in extension.
                name = resource.rsplit('.', 1)[0] + '.visual'

                if os.path.exists(visual) or (
                        self.rime.visual_terrain(name, visual) and os.path.exists(visual)):
                    try:
                        with open(visual) as handle:
                            info = json.load(handle)
                    except ValueError:
                        info = {}

            prefix = 'levels/%s/terrain/textures/' % map_name.lower()
            diffuse, normal, masks = [], [], []

            for texture in self.ebx.paths.values():
                lowered = texture.lower()

                if not lowered.startswith(prefix):
                    continue

                if lowered.endswith('_n'):
                    normal.append(texture)
                elif lowered.endswith('_rgb') or lowered.endswith('_m') or 'mask' in lowered:
                    masks.append(texture)
                else:
                    diffuse.append(texture)

            # MP_001 keeps no terrain texture directory -- its whole EBX tree holds two terrain
            # paths and no textures, so the scan above returns nothing, the WebUI gets diffuse: []
            # and every tile falls back to flat grey ("the terrain is all white").
            #
            # Traced: the terrain is a RESOURCE, not EBX (Levels/MP_001/Terrain is a WorldPartData);
            # its visual dump carries LayerCount/Draws/SurfaceShader but names no textures anywhere.
            # They are bound by the compiled surface shader, which only dump_shader_textures can
            # read.
            #
            # That dump is NOT run from here: over a level shaderdb it ran past fifteen minutes,
            # and this call is what the browser waits on for terrain. If one has been produced
            # out-of-band it is used; otherwise this behaves exactly as before.
            if not diffuse:
                diffuse, normal, masks = self._terrain_shader_textures(map_name)

            if not diffuse:
                diffuse, normal, masks = self._ground_textures(map_name)

            layers = {
                'layerCount': info.get('LayerCount', 0),
                'surfaceShader': info.get('SurfaceShader', ''),
                'draws': info.get('Draws', []),
                'diffuse': sorted(diffuse),
                'normal': sorted(normal),
                'masks': sorted(masks),
            }

            with open(path, 'w') as handle:
                json.dump(layers, handle)

            print('[mesh] terrain layers for %s: %d declared, %d diffuse textures found'
                  % (map_name, layers['layerCount'], len(diffuse)), flush=True)

        return open(path, 'rb').read()

    # Ground materials a terrain layer is plausibly painted with, by BF3's own naming.
    GROUND_WORDS = ('dirt', 'ground', 'sand', 'gravel', 'asphalt', 'concrete', 'rubble',
                    'slab', 'mud', 'grass', 'rock', 'sidewalk')

    def _ground_textures(self, map_name):
        """The level's own ground textures, for levels that keep no Terrain/Textures directory.

        MP_001 is the case: its terrain declares seven layers, and its ground textures sit under
        Levels/MP_001/Props/Textures (MP001Road_Dirt_01..04_D, ConcreteFloor_01_D,
        MP001RoadAsphalt_02_D, MP001RoadSideWalk_01a_D) rather than under Terrain/Textures, which
        is the only place the scan above looks. So the terrain came back with no layers at all and
        rendered as flat colour, while the textures it is painted with were sitting in the level.

        This is inference, and narrower than it looks: only the level's OWN textures, and only ones
        whose names say ground. Levels with a real terrain texture directory never reach here.
        """
        prefix = 'levels/%s/' % map_name.lower()
        diffuse, normal, masks = [], [], []

        for texture in self.ebx.paths.values():
            lowered = texture.replace('\\', '/').lower()

            if not lowered.startswith(prefix):
                continue

            name = lowered.rsplit('/', 1)[-1]

            if not any(word in name for word in self.GROUND_WORDS):
                continue

            if name.endswith('_n'):
                normal.append(texture)
            elif name.endswith('_rgb') or name.endswith('_m') or 'mask' in name:
                masks.append(texture)
            elif name.endswith('_d') or '_d_' in name:
                diffuse.append(texture)

        print('[mesh] ground textures for %s: %d diffuse, %d normal (no terrain texture dir)'
              % (map_name, len(diffuse), len(normal)), flush=True)

        return sorted(diffuse), sorted(normal), sorted(masks)

    def roads(self, map_name):
        """The level's roads, as ribbons ready to build geometry from.

        BF3 paints roads onto the terrain as RibbonData decals, not as meshes: Levels/<Map>/
        TerrainDecals holds one RoadData per road with a centreline (Points), a per-point half
        width either side (RibbonPoints Left/Right), and how often its texture repeats along the
        run (UvTileFactor). That is everything geometry needs, and it is plain EBX -- no Rime.

        The material is a cross-partition reference and the local guid dictionary does not resolve
        partition guids, so the texture is matched by NAME against the level's own road textures.
        Stated in the payload as `textureSource` so the client is not guessing about it.
        """
        path = os.path.join(CACHE, map_name + '.roads.json')

        if not os.path.exists(path):
            partition = self.ebx.partition_by_path('levels/%s/terraindecals' % map_name.lower())
            roads = []

            if partition is not None:
                roads = self._roads_from(partition)

            payload = {'level': map_name, 'roads': roads}

            with open(path, 'w') as handle:
                json.dump(payload, handle)

            print('[mesh] roads for %s: %d ribbon(s)' % (map_name, len(roads)), flush=True)

        return open(path, 'rb').read()

    @staticmethod
    def _single(node):
        return None if node is None else node.get('$value')

    @staticmethod
    def _vec3(node):
        v = node or {}
        get = lambda k: ((v.get(k) or {}).get('$value'))
        return [get('x'), get('y'), get('z')]

    def _roads_from(self, partition):
        found = []

        def walk(node):
            if isinstance(node, dict):
                if node.get('$type') == 'RoadData':
                    found.append(node)
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(partition.get('$instances', []))

        roads = []

        for road in found:
            fields = road.get('$fields', {})
            points = [self._vec3(p.get('$value') if isinstance(p, dict) and '$value' in p else p)
                      for p in (fields.get('Points', {}).get('$value') or [])]
            points = [p for p in points if None not in p]

            if len(points) < 2:
                continue

            widths = []

            for entry in (fields.get('RibbonPoints', {}).get('$value') or []):
                widths.append([
                    self._single(entry.get('Left')) or 0.0,
                    self._single(entry.get('Right')) or 0.0,
                ])

            roads.append({
                'points': points,
                'widths': widths,
                'uvTile': self._single(fields.get('UvTileFactor')) or 1.0,
                'stick': bool(self._single(fields.get('StickToTerrain'))),
                'order': self._single(fields.get('DrawOrderIndex')) or 0,
            })

        return roads

    def _terrain_shader_textures(self, map_name):
        """Terrain layer textures from an ALREADY-DUMPED shader database. Never dumps."""
        diffuse, normal, masks = set(), set(), set()

        for part in glob.glob(os.path.join(CACHE, map_name + '.*.shaders.json')):
            try:
                found = json.load(open(part)).get('shaders', {})
            except Exception:
                continue

            for name, textures in found.items():
                # Only the terrain's own shaders: a shaderdb covers every surface in the level, and
                # painting the ground with a building's texture is worse than leaving it grey.
                if 'terrain' not in name.lower():
                    continue

                for texture in textures or []:
                    lowered = texture.lower()

                    if lowered.endswith('_n'):
                        normal.add(texture)
                    elif lowered.endswith('_rgb') or lowered.endswith('_m') or 'mask' in lowered:
                        masks.add(texture)
                    else:
                        diffuse.add(texture)

        if diffuse:
            print('[mesh] terrain textures from shader dump for %s: %d diffuse'
                  % (map_name, len(diffuse)), flush=True)

        return sorted(diffuse), sorted(normal), sorted(masks)

    def terrain_tile(self, guid, samples):
        """One terrain tile's height samples, as raw UInt16.

        A level's heightfield tree may carry no samples at all -- MP_017 embeds only its root and
        streams the other 272 tiles -- so each leaf names a chunk instead. The chunk holds the same
        grid the embedded nodes do, samples first, followed by data this does not use.
        """
        if not all(c in '0123456789abcdef-' for c in guid.lower()) or len(guid) > 40:
            return None

        cached = os.path.join(CACHE, 'chunk_' + guid.lower() + '.bin')

        if not os.path.exists(cached):
            with (self.stream_lock or self.lock):
                # Re-check: several tiles can be asked for at once, and the wait may have been for
                # the very one that was being extracted.
                if not os.path.exists(cached) and not self.streamer.chunk(guid, cached):
                    return None

        body = open(cached, 'rb').read()
        wanted = samples * samples * 2

        if len(body) < wanted:
            return None

        return body[:wanted]

    @staticmethod
    def _decode_materials(path):
        """Turn the material tree's run-length lines into a flat grid of material indices.

        Which material covers which patch of ground is the only place that is written down, and it
        arrives encoded: two equal bytes in a row are a run, and the byte after them says how many
        MORE of that byte follow; anything else is a single sample. Each decoded byte then holds
        two 4-bit material indices, high nibble first, so a node of N samples per side decodes to
        N lines of N/2 bytes.

        Verified on MP_001: all 4096 lines decode to exactly 128 bytes, giving the 256x256 samples
        per node the tree declares.
        """
        try:
            with open(path) as handle:
                terrain = json.load(handle)
        except (OSError, ValueError):
            return

        nodes = terrain.get('materialNodes') or []

        if not nodes:
            return

        side = int(terrain.get('materialSamplesPerSide') or 0)
        decoded = 0

        for node in nodes:
            rle = base64.b64decode(node.pop('rle', '') or '')
            sizes = node.pop('lineSizes', []) or []
            samples = bytearray()
            offset = 0

            for size in sizes:
                end = offset + size

                if end > len(rle):
                    break

                i = offset

                while i < end:
                    value = rle[i]

                    # A run needs its marker, its twin and a count, all inside the line: two equal
                    # bytes at the very end are two samples, not a truncated run.
                    if i + 2 < end and rle[i + 1] == value:
                        samples.extend(bytes([value]) * (rle[i + 2] + 1))
                        i += 3
                    else:
                        samples.append(value)
                        i += 1

                offset = end

            # Only keep what decoded to the size the tree promised; a short node means the format
            # is not what we think it is, and half a grid painted over the terrain is worse than
            # none at all.
            if side and len(samples) * 2 == side * side:
                node['samples'] = base64.b64encode(bytes(samples)).decode('ascii')
                decoded += 1

        terrain['materialNodesDecoded'] = decoded

        with open(path, 'w') as handle:
            json.dump(terrain, handle)

        print('[mesh] terrain materials: %d/%d nodes decoded (%d samples per side)'
              % (decoded, len(nodes), side), flush=True)

    def _terrain_resource(self, map_name):
        cached = self.kinds.get('terrain:' + map_name.lower())

        if cached is not None:
            return cached or None

        # levels/<map>/... .streamingtree, whatever the artist called the directory under it.
        for path in self.ebx.paths.values():
            lowered = path.lower()

            if lowered.startswith('levels/' + map_name.lower() + '/') and lowered.endswith('.streamingtree'):
                self.kinds['terrain:' + map_name.lower()] = path
                return path

        # The streaming tree is a RESOURCE, and resources are not all in the EBX dictionary. Fall
        # back to the shape BF3 uses in practice.
        guess = 'levels/%s/terrain/%s_terrain/%s_terrain.streamingtree' % (
            map_name.lower(), map_name.lower().replace('_', ''), map_name.lower().replace('_', ''))
        self.kinds['terrain:' + map_name.lower()] = guess

        return guess

    def texture_map(self, map_name):
        """mesh -> per-subset texture bindings for a level, from its MeshVariationDatabase."""
        path = os.path.join(CACHE, map_name + '.textures.json')

        if not os.path.exists(path):
            level = self.levels.get(map_name.lower())

            if level is None:
                return None

            with self.lock:
                merged = {}

                # A level has more than one MeshVariationDatabase: the root's, plus one per
                # subworld. Reading only the root leaves whole building sets untextured, because
                # their entries live in the gamemode subworld that places them.
                for source in self._mvdb_names(level):
                    part = os.path.join(CACHE, map_name + '.' + source.split('/')[-2] + '.mvdb.json')

                    if not os.path.exists(part) and not self.rime.textures(source, part):
                        continue

                    try:
                        found = json.load(open(part)).get('meshes', {})
                    except Exception:
                        continue

                    print('[mesh] %s: %d meshes' % (source, len(found)), flush=True)

                    for mesh, variations in found.items():
                        target = merged.setdefault(mesh, {})

                        for hash_key, materials in variations.items():
                            # The RICHEST entry wins, not the first one seen. Databases disagree:
                            # the level root can carry an entry with no texture parameters at all
                            # while a gamemode database has the real bindings, and taking whichever
                            # came first threw those away.
                            existing = target.get(hash_key)

                            if existing is None or _params(materials) > _params(existing):
                                target[hash_key] = materials

                self._fill_from_shaders(map_name, level, merged)

                # NOT _fill_by_name. Searching the texture catalogue for a material's NAME invents
                # bindings: MP_001's crane carries seven subsets with no texture parameters at all
                # ({"0": [{}, {}, {}, {}, {}, {}, {}]} in the MeshVariationDatabase), and name
                # matching dressed it in CraneAlphaMask_D four times over, plus a generic window and
                # a shop's logo. A mask painted as an opaque diffuse is the green lattice that
                # occludes what is behind it -- and being DXT1 it has no alpha channel, so nothing
                # downstream can cut it out. A guessed binding and a real one look identical from
                # the outside, which is how that survived.
                #
                # An unbound subset now stays on the neutral material and is COUNTED, so it reads as
                # "no binding" rather than as the wrong texture.
                self._count_unbound(map_name, merged)
                json.dump({'meshes': merged}, open(path, 'w'))
                print('[mesh] textures for %s: %d meshes' % (map_name, len(merged)), flush=True)

        return open(path, 'rb').read()

    def _fill_from_shaders(self, map_name, level, merged):
        """Give the meshes with no material textures the ones their SHADER streams.

        A MeshVariationDatabase entry with no texture parameters does not mean an untextured mesh:
        its surface comes from the shader, which names what it streams. Nothing in EBX carries that
        list -- only the shaderdb does.
        """
        shaders = {}

        for source in self._shaderdb_names(level):
            part = os.path.join(CACHE, map_name + '.' + source.split('/')[-2] + '.shaders.json')

            if not os.path.exists(part) and not self.rime.shader_textures(source, part):
                continue

            try:
                found = json.load(open(part)).get('shaders', {})
            except Exception:
                continue

            for name, textures in found.items():
                shaders.setdefault(name.lower(), textures)

        if not shaders:
            return

        filled = 0

        for mesh, variations in merged.items():
            materials = variations.get('0') or next(iter(variations.values()), [])

            # A subset counts as bound only if it actually names a DIFFUSE.
            #
            # This used to be `any(materials)`, i.e. "the dict is non-empty" -- and once the dump
            # started reporting metadata ($material, and $unresolved:<slot> for a binding it could
            # not resolve), every subset became non-empty and the shader fallback stopped running
            # for meshes that still had no texture at all. Diffuse coverage fell from 67% to 59%
            # while the data underneath had strictly improved.
            if any((material or {}).get('Diffuse') for material in materials):
                continue

            variations.setdefault('0', materials)
            materials = variations['0']

            for index, shader in enumerate(self._shaders_of(mesh)):
                textures = shaders.get(shader.lower())

                if not textures:
                    continue

                # _D is the diffuse by convention throughout BF3's naming; first entry otherwise.
                diffuse = next((t for t in textures if t.lower().endswith('_d')), textures[0])

                while len(materials) <= index:
                    materials.append({})

                materials[index]['Diffuse'] = diffuse
                filled += 1

        print('[mesh] shader textures filled %d material(s)' % filled, flush=True)

    def _count_unbound(self, map_name, merged):
        """How many subsets ended with no texture binding, so a gap is visible rather than filled."""
        meshes = 0
        subsets = 0

        for variations in merged.values():
            materials = variations.get('0') or next(iter(variations.values()), [])
            empty = sum(1 for material in materials if not (material or {}).get('Diffuse'))

            if empty:
                meshes += 1
                subsets += empty

        if subsets:
            print('[mesh] %s: %d subset(s) across %d mesh(es) have NO texture binding -- left '
                  'untextured on purpose (no name guessing)' % (map_name, subsets, meshes),
                  flush=True)

        return subsets

    def _fill_by_name(self, merged):
        """Last resort: match a mesh's own material NAME against the texture catalogue.

        Some bindings exist nowhere we can read them -- MP_001's backdrop houses carry a material
        called BackdropHouses_material, no texture parameters, and a shader with no streamable
        textures, yet the game paints them from props/backdropprops/me_backdrophouse_01/
        me_backdrophouse_d_01. The engine binds those externally. The mesh does name its material
        though, and BF3 names textures after the thing they cover with a _d suffix, so the catalogue
        can be searched for it.

        This is inference, not a binding, and it only runs where nothing else produced a texture.
        """
        catalogue = self._texture_catalogue()

        if not catalogue:
            return

        filled = 0

        for mesh, variations in merged.items():
            if any(any(m) for m in variations.values()):
                continue

            for name in self._material_names(mesh):
                match = self._match_texture(name, catalogue)

                if match is None:
                    continue

                materials = variations.setdefault('0', [])

                if not materials:
                    materials.append({})

                materials[0]['Diffuse'] = match
                filled += 1
                break

        if filled:
            print('[mesh] matched %d mesh(es) to a texture by material name' % filled, flush=True)

    def _texture_catalogue(self):
        if self.catalogue is not None:
            return self.catalogue

        path = os.path.join(CACHE, 'textures.list')
        self.catalogue = []

        if os.path.exists(path):
            for line in open(path):
                line = line.strip().lstrip('- ').strip()

                if line:
                    self.catalogue.append(line)

        return self.catalogue

    def _material_names(self, mesh):
        """The material names inside a mesh's .glb, which Rime carries over from the game."""
        path = os.path.join(CACHE, file_name_for(mesh))

        if not os.path.exists(path):
            return []

        try:
            with open(path, 'rb') as handle:
                data = handle.read()

            offset = 12

            while offset < len(data):
                length, kind = struct.unpack_from('<II', data, offset)

                if kind == 0x4E4F534A:  # JSON chunk
                    gltf = json.loads(data[offset + 8:offset + 8 + length].decode('utf-8', 'replace'))
                    return [m.get('name', '') for m in gltf.get('materials', []) if m.get('name')]

                offset += 8 + length
        except Exception:
            pass

        return []

    def _match_texture(self, material_name, catalogue):
        token = material_name.lower().replace('_material', '').replace('material', '').strip('_')

        if len(token) < 4:
            return None

        best = None

        for resource in catalogue:
            base = resource.rsplit('/', 1)[-1].lower()

            if token not in base and token.rstrip('s') not in base:
                continue

            # Prefer the diffuse; BF3 suffixes it _d, sometimes _d_01.
            if base.endswith('_d') or '_d_' in base:
                return resource

            if best is None:
                best = resource

        return best

    def _shaders_of(self, mesh):
        """The shader each of a mesh's materials uses, in material order."""
        partition = self.ebx.partition_by_path(mesh)

        if partition is None:
            return []

        names = []

        for instance in partition['$instances']:
            if instance['$type'] != 'MeshMaterial':
                continue

            shader = instance['$fields'].get('Shader', {}).get('$value') or {}
            reference = (shader.get('Shader') or {}).get('$value')

            if reference is None:
                names.append('')
                continue

            names.append(self.ebx.path_of(reference['$partitionGuid']) or '')

        return names

    def _shaderdb_names(self, level):
        names = [level.lower() + '/shaderdb']

        for mvdb in self._mvdb_names(level)[1:]:
            names.append(mvdb.replace('/meshvariationdb_win32', '/shaderdb'))

        return names

    def _mvdb_names(self, level):
        """The level's own MeshVariationDatabase, then each subworld's."""
        names = [level.lower() + '/meshvariationdb_win32']
        partition = self.ebx.partition_by_path(level)

        if partition is None:
            return names

        root = primary_instance(partition)

        if root is None:
            return names

        instances = {i['$guid'].lower(): i for i in partition['$instances']}

        for reference in refs(root, 'Objects'):
            child = instances.get(reference['$instanceGuid'].lower())

            if child is None or child['$type'] != 'SubWorldReferenceObjectData':
                continue

            bundle = text(child, 'BundleName')

            if bundle:
                names.append(bundle.lower() + '/meshvariationdb_win32')

        return names

    def normal(self, resource):
        """A normal map as PNG, converting the BC5 the browser cannot read."""
        png = os.path.join(CACHE, resource.replace('/', '_').lower() + '.png')

        if os.path.exists(png):
            return png

        source = self.dds(resource)

        if source is None:
            return None

        try:
            from dds_convert import to_png

            if to_png(source, png):
                return png
        except Exception as e:
            print('[mesh] normal conversion failed for %s: %s' % (resource, e), flush=True)

        # Not a format that needs converting: hand back the DDS and let the client try it.
        return None

    def dds(self, resource):
        """One texture, extracted on demand. Served as DDS: three.js reads it directly, so there
        is no decode step and the GPU keeps it compressed."""
        name = resource.replace('/', '_').lower() + '.dds'
        path = os.path.join(CACHE, name)

        if os.path.exists(path):
            return path

        return self._request('texture', resource, path)

    def glb(self, name):
        path = os.path.join(CACHE, name)

        if os.path.exists(path):
            return path

        mesh = self.by_file.get(name)

        if mesh is None or name in self.unavailable:
            return None

        return self._request('mesh', mesh, path)


class Handler(BaseHTTPRequestHandler):
    meshes = None

    def do_GET(self):
        name = self.path.split('?')[0].lstrip('/')

        # Normal maps are BC5 in a DX10-header DDS, which the browser's DDS loader reads as an
        # empty texture. Converted here rather than lost.
        if name.startswith('normal/') and name.endswith('.png'):
            path = Handler.meshes.normal(name[len('normal/'):-4])

            if path is None:
                return self.send_error(404, 'normal map not available')

            return self._send(open(path, 'rb').read(), 'image/png')

        # One streamed tile, asked for by the chunk its node names. Kept separate from the tree so
        # the client pulls only the tiles it is drawing.
        if name.startswith('tile/') and name.endswith('.bin'):
            parts = name[len('tile/'):-4].split('/')

            if len(parts) != 2 or not parts[1].isdigit():
                return self.send_error(400, 'expected tile/<guid>/<samplesPerSide>.bin')

            body = Handler.meshes.terrain_tile(parts[0], int(parts[1]))

            if body is None:
                return self.send_error(404, 'tile not available')

            return self._send(body, 'application/octet-stream')

        if name.startswith('terrainlayers/'):
            body = Handler.meshes.terrain_layers(name[len('terrainlayers/'):-5])

            if body is None:
                return self.send_error(404, 'no terrain layers for that level')

            return self._send(body, 'application/json')

        if name.startswith('terrain/'):
            body = Handler.meshes.terrain(name[len('terrain/'):-5])

            if body is None:
                return self.send_error(404, 'no terrain for that level')

            return self._send(body, 'application/json')

        if name.startswith('textures/'):
            body = Handler.meshes.texture_map(name[len('textures/'):-5])

            if body is None:
                return self.send_error(404, 'no texture map for that level')

            return self._send(body, 'application/json')

        # Slashes are kept in the URL: Rime needs the resource PATH, and a flattened file name
        # cannot be turned back into one (mesh and texture names contain underscores of their own).
        if name.startswith('texture/') and name.endswith('.dds'):
            path = Handler.meshes.dds(name[len('texture/'):-4])

            if path is None:
                return self.send_error(404, 'texture not available')

            return self._send(open(path, 'rb').read(), 'image/vnd-ms.dds')

        if name.startswith('roads/') and name.endswith('.json'):
            body = Handler.meshes.roads(name[len('roads/'):-5])

            if body is None:
                return self.send_error(404, 'no roads for that level')

            return self._send(body, 'application/json')

        if name.startswith('placements/'):
            body = Handler.meshes.placements(name[len('placements/'):-5])

            if body is None:
                return self.send_error(404, 'no placements for that level')

            return self._send(body, 'application/json')

        if name.endswith('.json'):
            manifest = Handler.meshes.manifest(name[:-5])

            if manifest is None:
                return self.send_error(404, 'no such level')

            body = json.dumps(manifest).encode()
            return self._send(body, 'application/json')

        if name.endswith('.glb'):
            path = Handler.meshes.glb(name)

            if path is None:
                return self.send_error(404, 'mesh not available')

            return self._send(open(path, 'rb').read(), 'model/gltf-binary')

        self.send_error(404)

    def _send(self, body, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


def main():
    rime = Rime(DEFAULT_RIME, DEFAULT_GAME_PATH)

    if not rime.start():
        return 1

    # A SECOND mounted Rime, for streaming only.
    #
    # One REPL runs one command at a time, and a level's opening work -- walking it for placements,
    # extracting meshes -- holds it for minutes. Terrain tiles queued behind that arrived at a rate
    # of one per six minutes, which is not streaming by any definition. Tiles are small and
    # constant-cost, so they get their own instance and land in seconds no matter what the main one
    # is busy with. Mounting costs about 30s once, at startup.
    streamer = Rime(DEFAULT_RIME, DEFAULT_GAME_PATH)

    if not streamer.start():
        print('[mesh] no streaming instance; tiles will queue behind extraction', flush=True)
        streamer = None

    Handler.meshes = Meshes(rime, streamer)
    print('[mesh] serving on http://localhost:%d (cache: %s)' % (PORT, CACHE), flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()

    return 0


if __name__ == '__main__':
    sys.exit(main())
