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
import re
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

    def partition_json_by_guid(self, guid, destination, timeout=180):
        """Any partition, by its guid, as JSON. The only way to follow a cross-partition
        reference: a CtrRef carries a partition guid, and nothing else here turns that into the
        thing it points at."""
        return self._command('dump_partition_json_by_guid %s "%s"' % (guid, destination),
                             destination, timeout)

    def visual_terrain(self, resource, destination, timeout=300):
        """What a level's ground is painted with: its terrain layers and the shaders that blend
        them. The layer textures are not in EBX; this is the only thing that names them."""
        return self._command('dump_visual_terrain %s "%s"' % (resource.lower(), destination),
                             destination, timeout)

    def terrain_decals(self, resource, destination, timeout=600):
        """A level's BAKED terrain decals: the geometry the engine drapes over the heightfield.

        Roads, crossings, lane markings and tank tracks are not splines the engine draws at
        runtime -- they are baked into a .decals resource as real triangles with per-vertex blend
        weights, in two LODs (a flat 2d one keyed on (x,z), and a terrain-conforming 3d one that
        carries its own y). Rebuilding ribbons from the RoadData control points approximates the
        markings and misses everything that was never a ribbon.
        """
        return self._command('dump_terrain_decals_json %s "%s"' % (resource.lower(), destination),
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

            # ONLY a level manifest, which is '<Map>.json' and nothing else.
            #
            # This walked every .json in the cache and deleted any that had no 'meshes' key,
            # which is every other kind of cached JSON in here: the shader dumps
            # (<Map>.<shaderdb>.shaders.json), the layer lists, the mvdb dumps, the visual
            # terrain. So a shader dump that took minutes to produce was deleted on the NEXT
            # startup, silently, and the textures it resolved went with it -- terrain layers
            # resolving one run and coming back empty the next, for no visible reason.
            if name.count('.') != 1:
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
            # The terrain's own shaders name its layer textures, and the layer index is in the
            # shader's name. That is the binding -- read it before any scan or inference.
            s_ByLayer = self._terrain_layer_textures(map_name, info)

            layer_indexed = False

            if s_ByLayer:
                # Indexed BY LAYER, with a hole where a layer binds no colour of its own: the
                # splat names layers by number, so compacting the list shifts every layer after
                # the hole onto the wrong texture.
                count = max(info.get('LayerCount', 0), max(s_ByLayer) + 1)
                diffuse = [s_ByLayer.get(i) for i in range(count)]
                normal, masks = [], []
                layer_indexed = True
            elif not diffuse:
                diffuse, normal, masks = self._terrain_shader_textures(map_name)

            normal_of = getattr(self, '_terrain_normal_of', {})

            layers = {
                # Texels per metre of ground. With the layer texture's own size this IS the tile
                # size -- a 1024px texture at 32 samples/m repeats every 32 m -- so the client
                # stops guessing one.
                'samplesPerMeter': info.get('TextureSamplesPerMeterMax', 0),
                # RGB blend weights over the layer materials -- the terrain's real arrangement.
                'splat': getattr(self, '_terrain_splat', None),
                # Per-material normals, aligned with the blend's material order.
                'normalMaps': getattr(self, '_terrain_normals', []),
                # Indexed BY LAYER like `diffuse`, so normalByLayer[i] is layer i's own normal
                # map. `normalMaps` above is a flat list in binding order and its order does NOT
                # match `diffuse` -- MP_001 serves it rubble-first and its colours sand-first.
                'normalByLayer': [normal_of.get(d) if d else None for d in diffuse]
                if layer_indexed else [],
                # Break-up textures the terrain shaders bind alongside the materials, most-bound
                # first: what stops a 32 m tile from reading as one repeated photograph.
                'detail': getattr(self, '_terrain_detail', []),
                # The wetness mask, where the terrain binds one.
                'wetness': getattr(self, '_terrain_wetness', None),
                'layerCount': info.get('LayerCount', 0),
                'surfaceShader': info.get('SurfaceShader', ''),
                'draws': info.get('Draws', []),
                # Sorting a layer-indexed palette alphabetically puts every layer on the wrong
                # texture, which is how the ground came out asphalt everywhere.
                'diffuse': diffuse if layer_indexed else sorted(diffuse),
                'normal': sorted(normal),
                'masks': sorted(masks),
            }

            with open(path, 'w') as handle:
                json.dump(layers, handle)

            print('[mesh] terrain layers for %s: %d declared, %d diffuse textures found'
                  % (map_name, layers['layerCount'], len(diffuse)), flush=True)

        return open(path, 'rb').read()

    # Suffixes and words that mean "this is not a colour map".
    #
    # `_nm` is here because one MP_001 material binds Window_01_nm to its Diffuse slot: a normal
    # map in a colour slot. A filter that knew only `_n` and `_m` let it through, and it painted
    # blue-violet -- a normal map's own colour -- onto the ground.
    # ------------------------------------------------------------------ #
    # What a texture IS, decided from its pixels rather than from its name.
    #
    # Names lie, and they lie in ways that silently corrupt the render. MP_001's terrain binds
    # `Asphalt_01_D` as its base layer: the suffix says diffuse, and it is a SPLAT MAP -- three
    # independent blend-weight channels. Painted as colour it turns the ground into red, green and
    # blue patches, which is exactly how it rendered. Three separate name-based rules were added to
    # catch three separate cases of this (`_nm`, `noise`/`perlin`, and masks) and each one only ever
    # covered the case that happened to be visible at the time.
    #
    # Pixels settle it in one measurement, and the same test works for content whose naming
    # conventions we have never seen -- a Source engine map's materials, say.
    # ------------------------------------------------------------------ #

    @staticmethod
    def _correlation(a, b):
        n = len(a)

        if n == 0:
            return 0.0

        mean_a = sum(a) / n
        mean_b = sum(b) / n
        cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
        var = (sum((x - mean_a) ** 2 for x in a) * sum((y - mean_b) ** 2 for y in b)) ** 0.5

        return cov / var if var else 0.0

    #: Version of the measurement rules below. Cached verdicts from an older version are redone.
    CLASSIFIER_RULES = 4

    @classmethod
    def classify_pixels(cls, path, step=8):
        """A texture's ROLE, measured: colour, splat, normal or data.

        A photograph's channels move together -- r(R,G) and friends sit at 0.97..1.00, because
        lighting and albedo affect all three. Packed data has independent channels, near 0.00. If
        those independent channels also sum to a constant they are blend weights (partition of
        unity), which is a splat map. A tangent-space normal is its own shape: blue pinned high,
        red and green centred on 128.
        """
        try:
            from PIL import Image

            # RGBA, not RGB: a two-channel normal packed DXT5nm-style keeps one of its axes in
            # ALPHA, and reading only RGB throws that axis away -- which makes the texture look
            # like a constant with one noisy channel rather than the detail normal it is.
            image = Image.open(path).convert('RGBA')
        except Exception:
            return None

        width, height = image.size
        pixels = image.load()
        red, green, blue, alpha, sums = [], [], [], [], []

        for y in range(0, height, step):
            for x in range(0, width, step):
                r, g, b, a = pixels[x, y]
                red.append(r)
                green.append(g)
                blue.append(b)
                alpha.append(a)
                sums.append(r + g + b)

        if not red:
            return None

        rg = cls._correlation(red, green)
        rb = cls._correlation(red, blue)
        gb = cls._correlation(green, blue)
        correlated = min(rg, rb, gb)
        mean_b = sum(blue) / len(blue)
        mean_r = sum(red) / len(red)
        mean_g = sum(green) / len(green)
        mean_sum = sum(sums) / len(sums)
        spread = sum(abs(v - mean_sum) for v in sums) / len(sums)

        # Per-channel spread, alpha included. A channel that does not vary carries no information,
        # whatever its mean -- which is how a packed two-channel normal is told from a four-channel
        # one, and it cannot be seen in the means alone.
        deviations = []

        for channel in (red, green, blue, alpha):
            mean = sum(channel) / len(channel)
            deviations.append((sum((v - mean) ** 2 for v in channel) / len(channel)) ** 0.5)

        means = [mean_r, mean_g, mean_b, sum(alpha) / len(alpha)]
        # Channels that actually carry signal, and whether the ones that do are centred like a
        # normal's axes rather than like a colour.
        carrying = [i for i, d in enumerate(deviations) if d >= 8.0]
        centred = all(110.0 <= means[i] <= 146.0 for i in carrying)

        if max(mean_r, mean_g, mean_b) - min(mean_r, mean_g, mean_b) < 3.0 and correlated > 0.9:
            # GREYSCALE. Its channels correlate perfectly -- they are equal -- so the colour test
            # above claims it, and BF3's `Textures/Perlin` measures exactly that: r(R,G)=0.999 with
            # all three means at 128.9. It is a break-up mask, not ground colour, and only the
            # name rule was catching it. A real ground photograph is never neutral to within three
            # levels across every channel (Sand_01_D spreads 28.7, Rubble_01_D 9.6).
            role = 'detail'
        elif correlated > 0.6:
            role = 'colour'
        elif mean_b > 180 and 96 < mean_r < 160 and 96 < mean_g < 160:
            # Blue pinned high with red/green around the midpoint: a tangent-space normal.
            role = 'normal'
        elif (deviations[2] < 1.0 and deviations[3] < 1.0 and mean_b < 8.0
                and 110.0 <= mean_r <= 146.0 and 110.0 <= mean_g <= 146.0):
            # BC5/DXN: two axes in red and green, blue and alpha not stored at all -- blue decodes
            # to a flat ZERO and alpha to a flat 255. That shape is the FORMAT, so it identifies a
            # normal map however shallow its relief is, which the deviation test below cannot:
            # `Decal_Crossing_01_N` is a real BC5 normal whose axes deviate 7.6 and 8.3, just under
            # the 8.0 signal floor, and it was coming out `splat` -- its sum is near-constant
            # because two of its four channels are constants.
            role = 'packednormal'
        elif len(carrying) == 2 and centred:
            # Exactly two channels vary, both centred on the midpoint, and blue is not pinned high:
            # a TWO-CHANNEL normal, the other axes dropped and the flat channels padding. MP_001's
            # `Noise_N` measures R sd 17.9 and A sd 25.2 about 127, against G sd 3.8 and B sd 1.2 --
            # its detail normal, which the sum-spread test below was calling a splat map because
            # two constant channels do make the sum constant.
            role = 'packednormal'
        elif spread / mean_sum < 0.18 if mean_sum else False:
            # Independent channels that nonetheless sum to a near-constant are weights.
            role = 'splat'
        else:
            role = 'data'

        return {
            'role': role,
            # Bumped whenever the rules change, so verdicts cached under the old ones are redone
            # rather than believed forever.
            'rules': cls.CLASSIFIER_RULES,
            'correlation': [round(rg, 3), round(rb, 3), round(gb, 3)],
            'means': [round(m, 1) for m in means],
            'deviations': [round(d, 1) for d in deviations],
            # Which channels carry the signal, for a role whose axes are not where a name says.
            'channels': carrying,
            'sumMean': round(mean_sum, 1),
            'sumSpread': round(spread / mean_sum, 3) if mean_sum else None,
        }

    def classify(self, resource):
        """classify_pixels for a texture resource, extracted and cached on first ask."""
        key = resource.replace('/', '_').lower() + '.class.json'
        path = os.path.join(CACHE, key)

        if os.path.exists(path):
            try:
                cached = json.load(open(path))

                if cached.get('rules') == self.CLASSIFIER_RULES:
                    return cached
            except Exception:
                pass

        dds = self.dds(resource)

        if dds is None:
            return None

        verdict = self.classify_pixels(dds)

        if verdict is not None:
            verdict['resource'] = resource

            with open(path, 'w') as handle:
                json.dump(verdict, handle)

        return verdict

    # `_s` and `_sp` are SPECULAR. They were missing, and MP_001's crane is what that costs: its
    # platform shader streams CraneAlphaMask_D, MetalGate_01_S and MetalGate_01_N, the mask and the
    # normal were both rejected by name, and the specular map was accepted as the platform's base
    # colour. MEASURED over the level's 4341 colour-slot bindings, exactly 2 end in `_s` and both
    # are that mistake, so nothing legitimate is lost by refusing them.
    NOT_COLOUR_SUFFIX = ('_n', '_m', '_nm', '_s', '_sp')
    NOT_COLOUR_WORD = ('mask', 'noise', 'perlin', 'normal')

    @classmethod
    def is_colour_map_by_name(cls, texture):
        """The NAME's opinion. A prior, used before the pixels have been looked at."""
        low = (texture or '').lower()

        return not (low.endswith(cls.NOT_COLOUR_SUFFIX)
                    or any(word in low for word in cls.NOT_COLOUR_WORD))

    def is_colour_map(self, texture):
        """Whether a texture is a COLOUR map -- measured where possible, guessed otherwise.

        The measurement wins because names are wrong in both directions: `Asphalt_01_D` carries a
        diffuse suffix and is a splat map, and a texture with no telling suffix at all can still be
        packed data. The name check stays as the answer for a texture not yet extracted, where
        there are no pixels to look at.
        """
        if not self.is_colour_map_by_name(texture):
            return False

        verdict = self.classify(texture)

        if verdict is None:
            return True

        # 'data' is the classifier's FALL-THROUGH, not a finding: it is what `role` is left at when
        # no rule matched. Treating it as a rejection is treating "no rule matched" as evidence,
        # and it costs real textures -- MEASURED, Litter_01_D (channel correlations .84/.57/.85, a
        # plain brown photograph) and RoofDome_01_D (.81/.60/.93) both land there, because the
        # colour test takes the MINIMUM of the three correlations and a strong colour cast
        # decorrelates one pair below the 0.6 floor. Rejecting them dropped 261 bindings that are
        # unambiguously colour maps.
        #
        # The positive verdicts still refuse: 'splat', 'normal', 'packednormal' and 'detail' are
        # each something a rule RECOGNISED, and Asphalt_01_D -- a splat map wearing a diffuse
        # suffix -- is still caught by the one that named it.
        return verdict.get('role') in ('colour', 'data')

    def is_mesh_colour_map(self, texture):
        """is_colour_map, for a MESH subset rather than for ground, a decal or a road.

        The 'detail' verdict means "neutral greyscale": on terrain that is a break-up mask and
        never the ground's colour, which is what the rule was written for. On a mesh it is
        ordinary -- BF3's concrete, plaster and window maps are frequently neutral to within a
        few levels, and Textures/Generic/Window_01_D is one of them. Refusing it here painted 32
        glass subsets grey to protect a terrain case that cannot reach this path.

        A shape that is not a colour map ANYWHERE -- a splat, a tangent-space normal, a packed
        two-channel normal -- is still refused.
        """
        if not self.is_colour_map_by_name(texture):
            return False

        verdict = self.classify(texture)

        if verdict is None:
            return True

        return verdict.get('role') not in ('splat', 'normal', 'packednormal')

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

    # ------------------------------------------------------------------ #
    # BAKED TERRAIN DECALS
    #
    # A BF3 level's road network is not drawn from the RoadData splines at runtime. The splines
    # are the AUTHORING form; the shipped form is a `.decals` resource holding baked triangles
    # with per-vertex blend weights that fade every edge, end and crossing into the terrain.
    # There are two LODs of the same content: `2d`, keyed on (x, z) alone and draped onto
    # whatever height the ground has, drawn beyond Decal3dFarDrawDistance; and `3d`, which
    # carries its own y and follows the terrain, drawn inside it.
    #
    # Rebuilding ribbons from the control points (RoadRibbons) resamples a two-point spline into
    # a strip and gets the markings roughly right, but it cannot produce anything that was never
    # a ribbon -- the crossings, the tank tracks, the junction fills -- and it has no blend
    # weights, so every strip ends in a hard rectangle.
    # ------------------------------------------------------------------ #

    @staticmethod
    def _half(bits):
        """IEEE half -> float. The per-vertex blend weights are stored as raw 16-bit."""
        sign = -1.0 if bits & 0x8000 else 1.0
        exponent = (bits >> 10) & 0x1F
        fraction = bits & 0x3FF

        if exponent == 0:
            return sign * (fraction / 1024.0) * (2.0 ** -14)

        if exponent == 31:
            return sign * (65504.0 if fraction == 0 else 0.0)

        return sign * (1.0 + fraction / 1024.0) * (2.0 ** (exponent - 15))

    def _decals_resource(self, map_name):
        """The level's .decals resource, named by its terrain rather than guessed.

        The visual terrain dump carries the name outright (`Decals`), which is the only place it
        is stated; the streaming tree's own path with the extension swapped is the fallback for a
        level whose visual dump has not been produced.
        """
        visual = os.path.join(CACHE, map_name + '.visual.json')

        if not os.path.exists(visual):
            # terrain_layers writes it as a side effect; asking for the layers is the cheapest way
            # to make sure it exists.
            self.terrain_layers(map_name)

        try:
            named = json.load(open(visual)).get('Decals')

            if named:
                return named
        except Exception:
            pass

        resource = self._terrain_resource(map_name)

        return None if resource is None else resource.rsplit('.', 1)[0] + '.decals'

    def _decal_paint(self, texture):
        """How a decal texture is COMPOSITED, measured rather than assumed from its name.

        Three cases, and the difference between them is the whole reason road markings currently
        render as rainbow static:

        `alpha`  -- RGB is the colour and the ALPHA channel is the coverage mask. BF3's
                    `Decal_Crossing_01_D` (near-white RGB, alpha sd 118.6) and `T_Tracks_01_D`
                    (near-black RGB, alpha sd 103.5) are both this.
        `mask`   -- alpha is a constant 255 and the coverage is the LUMINANCE: the marking is
                    drawn bright on a black field, and black means "not here". `parkingLines01`
                    is this -- 64x1024, alpha sd 0.0, and its most common pixel by far is pure
                    black. Painted as albedo its per-channel compression noise (r(R,G)=0.54 with
                    each channel's sd near 96) is exactly the iridescent stripe on the ground.
        `opaque` -- a real surface with no cut-out at all: a baked asphalt or gravel road, which
                    is what several other levels put in this resource. Only the per-vertex blend
                    weight fades it.

        The discriminator between `mask` and `opaque` is the BLACK FRACTION. A cut-out mask is
        mostly empty field; a road surface photograph has no pure black in it at all.
        """
        key = texture.replace('/', '_').lower() + '.decalpaint.json'
        path = os.path.join(CACHE, key)

        if os.path.exists(path):
            try:
                cached = json.load(open(path))

                if cached.get('rules') == self.CLASSIFIER_RULES:
                    return cached
            except Exception:
                pass

        dds = self.dds(texture)
        verdict = self.classify_pixels(dds) if dds is not None else None

        if verdict is None:
            return {'paint': 'alpha', 'rules': self.CLASSIFIER_RULES}

        black = self._black_fraction(dds)
        alpha_varies = len(verdict.get('deviations') or [0, 0, 0, 0]) > 3 \
            and verdict['deviations'][3] >= 8.0

        if alpha_varies:
            paint = 'alpha'
        elif black is not None and black >= 0.25:
            paint = 'mask'
        else:
            paint = 'opaque'

        result = {
            'paint': paint,
            'rules': self.CLASSIFIER_RULES,
            'role': verdict.get('role'),
            'black': None if black is None else round(black, 3),
            'alphaDeviation': verdict['deviations'][3] if len(verdict['deviations']) > 3 else None,
            'means': verdict.get('means'),
        }

        try:
            with open(path, 'w') as handle:
                json.dump(result, handle)
        except Exception:
            pass

        return result

    @staticmethod
    def _black_fraction(path, step=4):
        """Share of a texture that is essentially black -- the empty field of a cut-out mask."""
        try:
            from PIL import Image

            image = Image.open(path).convert('RGB')
        except Exception:
            return None

        width, height = image.size
        pixels = image.load()
        black = 0
        total = 0

        for y in range(0, height, step):
            for x in range(0, width, step):
                r, g, b = pixels[x, y]
                total += 1

                if max(r, g, b) < 16:
                    black += 1

        return None if total == 0 else black / float(total)

    def _decal_shader_textures(self, shader, registers):
        """A decal shader's colour and normal, split by MEASUREMENT of what each register holds.

        The registers a decal shader binds are not labelled, and the order differs between the 2d
        and 3d forms of the same material (MP001_Decal_Crossing binds its colour at register 1 in
        2d and at register 2 in 3d, with the normal at 4). Classifying the pixels is what tells
        them apart without a table of shader names.
        """
        bound = registers.get(shader.lower()) or {}
        colour = None
        normal = None

        for register in sorted(bound, key=lambda k: int(k)):
            candidate = bound[register]
            verdict = self.classify(candidate) or {}
            role = verdict.get('role')

            if role in ('normal', 'packednormal'):
                if normal is None:
                    normal = candidate
            elif colour is None:
                colour = candidate

        return colour, normal

    def _shader_registers(self):
        """Every shader's texture registers, from whatever shaderdb dumps exist."""
        registers = {}

        for part in glob.glob(os.path.join(CACHE, '*.shaders.json')):
            try:
                for name, by_register in (json.load(open(part)).get('registers') or {}).items():
                    registers.setdefault(name.lower(), by_register)
            except Exception:
                continue

        return registers

    def decals(self, map_name):
        """The level's baked terrain decals, grouped by the shader that draws them.

        Served as one vertex array per LOD with an index list per shader, which is how the
        resource itself is laid out: block indices are absolute into the geometry's vertex array
        and the blocks of one shader are contiguous runs of it, so nothing has to be re-indexed.
        """
        path = os.path.join(CACHE, map_name + '.decalgeom.json')

        if os.path.exists(path):
            return open(path, 'rb').read()

        raw = os.path.join(CACHE, map_name + '.decals.json')

        if not os.path.exists(raw):
            with self.lock:
                resource = self._decals_resource(map_name)

                if resource is None or not self.rime.terrain_decals(resource, raw):
                    print('[mesh] no terrain decals for %s' % map_name, flush=True)
                    return None

        try:
            source = json.load(open(raw))
        except Exception as e:
            print('[mesh] terrain decals for %s unreadable: %s' % (map_name, e), flush=True)
            return None

        registers = self._shader_registers()
        payload = {
            'level': map_name,
            # Beyond this the engine draws the flat 2d LOD; inside it, the conforming 3d one.
            'far3d': source.get('Decal3dFarDrawDistance', 0.0),
            'near2d': source.get('Decal2dNearDrawDistance', 0.0),
            'cellsPerTile': source.get('DecalCellsPerHeightfieldTileSide', 0),
            'geometries': [],
        }

        for field, kind in (('Geometry2d', '2d'), ('Geometry3d', '3d'), ('GeometryWater', 'water')):
            geometry = source.get(field) or {}
            vertices = geometry.get('Vertices') or []
            indices = geometry.get('Indices') or []
            blocks = geometry.get('Blocks') or []

            if not vertices or not blocks:
                continue

            positions = []
            uvs = []
            fades = []

            for vertex in vertices:
                position = vertex.get('Position') or []

                # 2d carries (x, z) only: its y is whatever the ground is, which is the point of
                # the LOD. Emitted as a zero y and draped by the client.
                if kind == '2d' and len(position) == 2:
                    positions.extend([position[0], 0.0, position[1]])
                elif len(position) >= 3:
                    positions.extend([position[0], position[1], position[2]])
                else:
                    positions.extend([0.0, 0.0, 0.0])

                texcoord = vertex.get('TexCoord') or [0.0, 0.0]
                uvs.extend([texcoord[0], texcoord[1]])

                masks = vertex.get('UserMasks') or [0, 0, 0, 0]
                # All four masks carry the same value on every level measured; one blend weight is
                # what the geometry actually has, and four copies of it is what it stores.
                fades.append(min(1.0, max(0.0, self._half(masks[0]))))

            groups = {}

            for block in blocks:
                shader = block.get('SurfaceShaderName') or ''
                start = int(block.get('StartIndex') or 0)
                count = int(block.get('PrimitiveCount') or 0) * 3
                held = groups.get(shader)

                if held is None:
                    colour, normal = self._decal_shader_textures(shader, registers)
                    paint = self._decal_paint(colour) if colour else {'paint': 'opaque'}
                    held = {
                        'shader': shader,
                        'texture': colour,
                        'normal': normal,
                        'paint': paint.get('paint', 'alpha'),
                        'measured': {k: paint.get(k) for k in ('role', 'black', 'alphaDeviation')},
                        'blocks': 0,
                        'indices': [],
                    }
                    groups[shader] = held

                held['blocks'] += 1
                held['indices'].extend(indices[start:start + count])

            payload['geometries'].append({
                'kind': kind,
                'positions': positions,
                'uvs': uvs,
                'fades': fades,
                'groups': list(groups.values()),
            })

            print('[mesh] decals %s %s: %d vertices, %d group(s) -- %s'
                  % (map_name, kind, len(fades), len(groups),
                     ', '.join('%s=%s' % ((g['texture'] or '?').split('/')[-1], g['paint'])
                               for g in groups.values())), flush=True)

        with open(path, 'w') as handle:
            json.dump(payload, handle)

        return open(path, 'rb').read()

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

            self._resolve_road_shaders(map_name, roads)
            payload = {'level': map_name, 'roads': roads}

            with open(path, 'w') as handle:
                json.dump(payload, handle)

            print('[mesh] roads for %s: %d ribbon(s)' % (map_name, len(roads)), flush=True)

        return open(path, 'rb').read()

    def _resolve_road_shaders(self, map_name, roads):
        """Give each ribbon the texture its OWN shader binds.

        A road names its material as Shader2d, a cross-partition reference. Following it needs the
        partition behind the guid (dump_partition_json_by_guid), which yields the shader's NAME --
        and the name resolves in the shaderdb registers, exactly as the terrain layers do. MP_001's
        roads come out as SP_Earthquake's parkingLines01, which is what the game paints them with;
        matching a road-ish texture by name inside the level gave asphalt instead.
        """
        registers = {}

        for part in glob.glob(os.path.join(CACHE, '*.shaders.json')):
            try:
                for name, by_register in (json.load(open(part)).get('registers') or {}).items():
                    registers.setdefault(name.lower(), by_register)
            except Exception:
                continue

        if not registers:
            return

        names = {}

        for road in roads:
            guid = road.pop('shaderGuid', None)

            if not guid:
                continue

            if guid not in names:
                path = os.path.join(CACHE, 'partition_' + guid + '.json')

                if not os.path.exists(path):
                    self.rime.partition_json_by_guid(guid, path)

                names[guid] = ''

                try:
                    names[guid] = (json.load(open(path)).get('Name') or '').lower()
                except Exception:
                    pass

            by_register = registers.get(names[guid]) or {}

            for register in sorted(by_register, key=lambda k: int(k)):
                candidate = by_register[register]
                low = candidate.lower()

                if not self.is_colour_map(candidate):
                    continue

                road['texture'] = candidate
                break

        print('[mesh] roads for %s: %d of %d ribbons resolved a texture'
              % (map_name, sum(1 for r in roads if r.get('texture')), len(roads)), flush=True)

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

            shader = ((fields.get('Shader2d', {}) or {}).get('$value') or {})

            roads.append({
                'shaderGuid': (shader or {}).get('$partitionGuid'),
                'points': points,
                'widths': widths,
                'uvTile': self._single(fields.get('UvTileFactor')) or 1.0,
                'stick': bool(self._single(fields.get('StickToTerrain'))),
                'order': self._single(fields.get('DrawOrderIndex')) or 0,
            })

        return roads

    def _terrain_layer_textures(self, map_name, info):
        """Layer index -> diffuse texture, read from the terrain's own shaders.

        A level's terrain is drawn by generated shaders, one per layer combination, named
        <terrain>__<layers><flags>__<kind>__<lod>. Each binds its textures to sampler registers, and
        dump_shader_textures reports register -> texture. So the shader name gives the LAYER and the
        registers give what that layer is painted with -- the actual binding, ordered.

        This matters twice over. MP_001 keeps no terrain textures of its own: it draws with
        SP_Sniper's and SP_Earthquake's (Asphalt_01_D, Rubble_01_D, parkingLines01). A scan of
        Levels/<Map>/Terrain/Textures can never find those, and matching ground-ish names in the
        level picked road props instead -- right-looking, wrong textures, and in alphabetical order
        rather than layer order, so the splat map indexed into the wrong ones.
        """
        shader = (info.get('SurfaceShader') or '').rsplit('/', 1)[0].lower()

        if not shader:
            return {}

        by_layer = {}
        candidates = []
        # Textures measured as blend weights rather than colour, with how many shaders bind them.
        splats = {}
        # Per-material normals, in the order their shaders bind them.
        normals = []
        # Colour texture -> the normal map bound alongside it, with how many shaders agree.
        paired = {}
        # Break-up textures (greyscale masks, and packed data that is not THE splat), most-bound
        # first, and the wetness mask.
        details = {}
        # Two-channel detail normals, which are break-up rather than a material's own normal.
        packednormals = {}
        wetness = {}

        for part in glob.glob(os.path.join(CACHE, map_name + '.*.shaders.json')):
            try:
                registers = json.load(open(part)).get('registers', {}) or {}
            except Exception:
                continue

            for name, by_register in registers.items():
                lowered = name.lower()

                if not lowered.startswith(shader):
                    continue

                # The LAYER SEGMENT of the name, not the whole name. Read with a regex over the
                # whole thing, `MP001_Terrain__1MV_2MV__2d__0` matches on `__2d__` and reports
                # layer 2 -- the KIND token, not a layer at all. Every multi-layer shader was
                # landing on its own kind, which is how three layers ended up sharing one texture.
                base = lowered.rsplit('/', 1)[-1]
                parts = base.split('__')

                if len(parts) < 3:
                    continue

                layers = [int(m.group(1)) for m in re.finditer(r'(\d+)m[vd]', parts[1])]

                if not layers:
                    continue

                # Lowest register first: a terrain layer shader binds its colour maps in layer
                # order, before the normals and masks that go with them.
                colours = []
                # This shader's material normals, in the same register order.
                shader_normals = []
                # Everything measured as neither colour nor normal, in register order.
                packed = []

                for register in sorted(by_register, key=lambda k: int(k)):
                    texture = by_register[register]

                    if not self.is_colour_map(texture):
                        # A rejected texture is not necessarily useless. The terrain's SPLAT is
                        # rejected here -- it is the blend weights, not a colour -- and it is the
                        # thing that says where each material goes. The NORMALS are rejected too,
                        # and they are most of what makes ground read as ground rather than as a
                        # flat photograph. Keep both, by measured role.
                        verdict = self.classify(texture)
                        role = verdict.get('role') if verdict else None

                        if role == 'normal':
                            if texture not in shader_normals:
                                shader_normals.append(texture)

                            if texture not in normals:
                                normals.append(texture)
                        elif role == 'packednormal':
                            packednormals[texture] = packednormals.get(texture, 0) + 1
                        else:
                            # Splats, greyscale break-up masks and packed data all land here. Which
                            # is which is decided below across every shader rather than per shader:
                            # the terrain's splat is the one nearly all of them bind, and the rest
                            # are detail.
                            if texture not in packed:
                                packed.append(texture)

                            if role == 'splat':
                                splats[texture] = splats.get(texture, 0) + 1
                            elif role == 'detail':
                                details[texture] = details.get(texture, 0) + 1
                            else:
                                wetness[texture] = wetness.get(texture, 0) + 1

                        continue

                    if texture not in colours:
                        colours.append(texture)

                # WHICH normal goes with WHICH material, by position. Measured, not named: over
                # MP_001's 95 terrain shaders every one that binds normals binds exactly as many as
                # it binds colours, in the same order -- 60 shaders, zero mismatches, and the
                # pairing they agree on (Sand_01_D/SP008_Sand01_N, Rubble_01_D/Rubble_01_N) is the
                # REVERSE of the order a flat list of normals comes out in. Pairing a flat list by
                # index would have put the sand normal on the rubble.
                if shader_normals and len(shader_normals) == len(colours):
                    for colour, normal in zip(colours, shader_normals):
                        key = (colour, normal)
                        paired[key] = paired.get(key, 0) + 1

                candidates.append((len(layers), layers, colours))

        # Fewest layers first: `__0MV__` names layer 0's texture outright, and once that is known
        # `__0MV_1MV__` names layer 1's by elimination. A shader binds each distinct texture ONCE,
        # so a combination whose layers share a texture reports fewer colours than it has layers --
        # that is what says they share, rather than something being missing.
        for _, layers, colours in sorted(candidates, key=lambda c: c[0]):
            known = {by_layer[l] for l in layers if l in by_layer}
            unknown = [l for l in layers if l not in by_layer]
            left = [c for c in colours if c not in known]

            if not unknown:
                continue

            if len(left) == len(unknown):
                for layer, texture in zip(unknown, left):
                    by_layer[layer] = texture
            elif len(left) == 1:
                # One texture left over several layers: they are painted with the same one.
                for layer in unknown:
                    by_layer[layer] = left[0]

        if by_layer:
            print('[mesh] terrain layers for %s from shader registers: %s'
                  % (map_name, ', '.join('%d=%s' % (k, v.rsplit('/', 1)[-1])
                                         for k, v in sorted(by_layer.items()))), flush=True)

        # The most-bound splat is the terrain's own; a stray one bound by a single shader is not.
        self._terrain_splat = max(splats, key=splats.get) if splats else None
        self._terrain_normals = normals

        # Anything else measured as packed is break-up detail -- including a texture whose channels
        # partition like a splat but which is not the one the terrain blends by (MP_001 binds
        # `Noise_N`, three independent channels summing flat, alongside the real splat).
        detail = {}

        for texture, count in details.items():
            detail[texture] = ('grey', count)

        for texture, count in packednormals.items():
            detail[texture] = ('normal', count)

        for texture, count in splats.items():
            if texture != self._terrain_splat:
                detail.setdefault(texture, ('grey', 0))
                detail[texture] = (detail[texture][0], detail[texture][1] + count)

        # Role-tagged rather than ordered: a client that has to guess which of two detail textures
        # is the greyscale mask and which is the normal will get it wrong the moment a level binds
        # them in the other order.
        self._terrain_detail = [
            {'resource': texture, 'kind': kind,
             'channels': (self.classify(texture) or {}).get('channels', [])}
            for texture, (kind, _) in sorted(detail.items(), key=lambda kv: -kv[1][1])]
        self._terrain_wetness = (max(wetness, key=wetness.get) if wetness else None)

        # A material's own normal, by the pairing its shaders agree on.
        best = {}

        for (colour, normal), count in paired.items():
            if count > best.get(colour, (None, 0))[1]:
                best[colour] = (normal, count)

        self._terrain_normal_of = {colour: normal for colour, (normal, _) in best.items()}

        if self._terrain_normal_of:
            print('[mesh] terrain normals for %s paired by register order: %s'
                  % (map_name, ', '.join('%s->%s' % (c.rsplit('/', 1)[-1], n.rsplit('/', 1)[-1])
                                         for c, n in sorted(self._terrain_normal_of.items()))),
                  flush=True)

        if self._terrain_splat is not None:
            print('[mesh] terrain splat for %s: %s (bound by %d shaders)'
                  % (map_name, self._terrain_splat.rsplit('/', 1)[-1],
                     splats[self._terrain_splat]), flush=True)

        return by_layer

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

    # The parameter names a colour map actually arrives under. MeshManager.diffuseFor accepts the
    # same list: BF3 shaders bind Diffuse, MainDiffuse (the base) and TileDiffuse (the detail tile)
    # depending on the surface, and an architecture material routinely has MainDiffuse + TileDiffuse
    # and no plain "Diffuse" at all.
    # Every slot a colour map actually arrives under, most specific first. These are the shader's
    # OWN parameter names, read out of the material -- not filename patterns. A storefront binds
    # DetailTexture, a shop sign binds Background/Logo/BrandTexture, a window frame binds Frame_D.
    DIFFUSE_SLOTS = ('Diffuse', 'MainDiffuse', 'MainTexture', 'TileDiffuse', 'DetailDiffuse',
                      'DetailTexture', 'DiffuseBark', 'DiffuseLeaves', 'AwningTexture',
                      'Background', 'Frame_D', 'BrandTexture', 'Logo', 'InteriorTexture',
                      'EngineTexture', 'ColorTexture', 'diffuseAtlas', 'Texture3')

    @classmethod
    def _has_diffuse(cls, material):
        return any((material or {}).get(slot) for slot in cls.DIFFUSE_SLOTS)

    def _fill_from_shaders(self, map_name, level, merged):
        """Give the meshes with no material textures the ones their SHADER streams.

        A MeshVariationDatabase entry with no texture parameters does not mean an untextured mesh:
        its surface comes from the shader, which names what it streams. Nothing in EBX carries that
        list -- only the shaderdb does.
        """
        shaders = {}
        slots = {}
        registers = {}

        # Every shaderdb dump on disk, not just this level's.
        #
        # A level draws with other levels' assets -- MP_001's wire lights are COOP_009's mesh and
        # its terrain is SP_Sniper's -- and those shaders live in THEIR level's shaderdb. Shader
        # names are full asset paths, so a dump from any level is usable by any other; looking only
        # at this map's dump meant a cross-level asset could never resolve.
        for other in sorted(glob.glob(os.path.join(CACHE, '*.shaders.json'))):
            try:
                dumped = json.load(open(other))
            except Exception:
                continue

            for name, textures in (dumped.get('shaders') or {}).items():
                shaders.setdefault(name.lower(), textures)

            for name, by_reg in (dumped.get('registers') or {}).items():
                registers.setdefault(name.lower(), by_reg)

        for source in self._shaderdb_names(level):
            # Key the cache on the WHOLE source name.
            #
            # split('/')[-2] collapses 'levels/mp_001/shaderdb' and
            # 'levels/mp_001/mp_001/shaderdb' onto the same file -- and the first of those does
            # not exist, so its failed dump wiped the good one on every run. The shader textures
            # then vanished between one request and the next for no visible reason.
            part = os.path.join(CACHE, map_name + '.' + source.replace('/', '_') + '.shaders.json')

            if not os.path.exists(part) and not self.rime.shader_textures(source, part):
                continue

            try:
                found = json.load(open(part)).get('shaders', {})
            except Exception:
                continue

            for name, textures in found.items():
                shaders.setdefault(name.lower(), textures)

            # 'slots' is only present if a dump ever carries slot-labelled bindings. It does not
            # today: a shader's internal textures are listed with a register index and their own
            # resource name, never a semantic slot ("Diffuse"). Only EXTERNAL textures name a
            # parameter. Read it when it appears; never require it.
            for name, bound in (json.load(open(part)).get('slots', {}) or {}).items():
                slots.setdefault(name.lower(), bound)

            for name, by_register in (json.load(open(part)).get('registers', {}) or {}).items():
                registers.setdefault(name.lower(), by_register)

        if not shaders:
            return

        filled = 0

        for mesh, variations in merged.items():
            shader_names = self._shaders_of(mesh)

            # EVERY variation, not just the base.
            #
            # An object placed with a variation (a camo, a dirty pass, a damaged state) is drawn
            # from THAT entry, and only variation '0' was ever filled -- so a car's base looked
            # right while its three variations rendered untextured.
            for materials in variations.values():
                filled += self._fill_one(mesh, materials, shader_names, shaders, slots, registers)

        print('[mesh] shader textures filled %d material(s)' % filled, flush=True)
        return

    def _fill_one(self, mesh, materials, shader_names, shaders, slots, registers):
        """Bind one variation's subsets, using the mesh's shaders in material order.

        Returns how many subsets it bound.
        """
        filled = 0

        # A subset counts as bound only if it actually names a DIFFUSE.
        #
        # This used to be `any(materials)`, i.e. "the dict is non-empty" -- and once the dump
        # started reporting metadata ($material, and $unresolved:<slot> for a binding it could
        # not resolve), every subset became non-empty and the shader fallback stopped running
        # for meshes that still had no texture at all. Diffuse coverage fell from 67% to 59%
        # while the data underneath had strictly improved.
        for index, shader in enumerate(shader_names):
            # PER SUBSET, not per mesh.
            #
            # This skipped the whole mesh when ANY of its subsets had a diffuse, so a mesh with
            # one bound subset and six unbound ones got nothing for the six -- and a level's
            # meshes are mostly mixed like that. It is why filling 556 materials instead of 345
            # moved the bound count by exactly zero.
            # Only where the material named NO colour map under any of its slots. Writing a
            # 'Diffuse' next to an existing 'MainDiffuse' is worse than doing nothing: the
            # client prefers 'Diffuse', so a shader-derived guess would override the material's
            # own binding.
            if index < len(materials) and self._has_diffuse(materials[index]):
                continue

            textures = shaders.get(shader.lower()) or []
            by_register = registers.get(shader.lower()) or {}

            # A shader with no STREAMABLE textures is not a shader with no textures.
            #
            # MP001_SS_BBox_01_WET -- what MP_001's backdrop houses are drawn with -- streams
            # nothing and binds mp01_box_02_D straight to a sampler register. Gating on the
            # streamable list bailed before ever looking at the registers, so those houses
            # rendered as white blocks with their texture sitting right there.
            if not textures and not by_register:
                continue

            # The shader says which of its textures is the diffuse; use that.
            #
            # Falling back to "the filename ends in _d" is what painted the crane with
            # CraneAlphaMask_D -- a cutout mask that BF3 happens to name with a _D suffix.
            bound = slots.get(shader.lower(), {})
            diffuse = bound.get('Diffuse') or bound.get('DiffuseTexture')

            # The shader's own sampler REGISTERS, which is how the GPU binds them: the colour
            # map is bound before the normal and mask that accompany it. Same source that gives
            # the terrain its layers, and the same discipline -- take the first register,
            # stepping over maps that are demonstrably not colour.
            if diffuse is None:
                for register in sorted(by_register, key=int):
                    candidate = by_register[register]
                    low = candidate.lower()

                    # The shared rule, so this path cannot take a normal map as a colour map
                    # the way the terrain and road paths no longer can. A `_nm` suffix slipped
                    # through here and painted destruction meshes, bushes and road props violet.
                    if not self.is_mesh_colour_map(candidate):
                        continue

                    diffuse = candidate
                    break

            if diffuse is None:
                # NEVER textures[0].
                #
                # A shader streams its normal and specular maps alongside the diffuse, and the
                # list is unordered as far as we can tell, so "take the first" paints buildings
                # with their NORMAL map -- an entire level rendered bright blue, with the
                # coverage number going UP while the picture got worse.
                #
                # If nothing here identifies a diffuse, leave the subset unbound. Untextured is
                # honest; blue is not.
                # Through the NAME check at least. Without it this line was the hole the whole
                # file's discipline leaked through: the crane's beams shader streams
                # MetalPaint_t04_Df and CraneAlphaMask_D, the registers walk correctly refused the
                # mask, and then this took it anyway -- because the real diffuse ends `_df`, not
                # `_d`, and the mask does. Painted opaque and DXT1, with no alpha to cut it out,
                # that mask is the solid GREEN lattice the crane renders as.
                #
                # The name check, NOT the full is_colour_map: the pixel classifier is too eager to
                # be a gate on a last resort. MEASURED -- routing this line through it dropped 397
                # bindings that are plainly colour maps (RoofDome_01_D, PlasticCrate_01_D,
                # Litter_01_D, ModernSofa01_D) to buy back the 44 that were wrong. Names are enough
                # to refuse a mask, and refusing a mask is all this needs to do.
                diffuse = next((t for t in textures
                                if t.lower().endswith(('_d', '_df'))
                                and self.is_colour_map_by_name(t)), None)

            if diffuse is None:
                continue

            while len(materials) <= index:
                materials.append({})

            materials[index]['Diffuse'] = diffuse
            filled += 1

            # The CUTOUT, where the shader streams one alongside the colour.
            #
            # BF3's crane beams are Crane_BeamsAlpha_Shader: MetalPaint_t04_Df for the surface and
            # CraneAlphaMask_D for the shape. Binding the mask as the colour is the green lattice
            # this file already warns about, but dropping it entirely is not right either -- the
            # beams then render as SOLID panels instead of open steelwork. Reported separately so
            # a consumer can alpha-test with it, which is what the game does.
            mask = next((t for t in textures
                         if t is not diffuse
                         and any(word in t.lower() for word in ('mask', 'alpha'))), None)

            if mask:
                materials[index]['$alphaMask'] = mask

        return filled

    def _count_unbound(self, map_name, merged):
        """How many subsets ended with no texture binding, so a gap is visible rather than filled."""
        meshes = 0
        subsets = 0

        for variations in merged.values():
            materials = variations.get('0') or next(iter(variations.values()), [])
            empty = sum(1 for material in materials if not self._has_diffuse(material))

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

    #: DX10 dxgiFormat -> the legacy four-CC carrying the identical payload. BC1/2/3 blocks are
    #: byte-for-byte what DXT1/3/5 blocks are; only the header says otherwise. BC4 and BC5 have no
    #: equivalent the browser's loader reads, so they are left for the PNG path.
    DX10_LEGACY = {70: b'DXT1', 71: b'DXT1', 72: b'DXT3', 73: b'DXT3', 74: b'DXT3',
                   75: b'DXT5', 76: b'DXT5', 77: b'DXT5'}

    @classmethod
    def _legacy_dds(cls, data):
        """A DX10-header DDS rewritten to the legacy header the browser's loader understands.

        three.js's DDSLoader knows three four-CCs and no DX10 extension at all, and it fails
        SILENTLY: a DX10 file comes back as a texture with no image, which the client can only
        discard. MP_001's terrain detail normal `Noise_N` is BC3 in a DX10 header -- the same
        blocks as DXT5, behind a header written the other way -- so it was unreadable for the sake
        of twenty bytes. Returns None when the payload genuinely needs decoding (BC4/BC5) or is
        already legacy.
        """
        if len(data) < 148 or data[:4] != b'DDS ' or data[84:88] != b'DX10':
            return None

        four_cc = cls.DX10_LEGACY.get(struct.unpack_from('<I', data, 128)[0])

        if four_cc is None:
            return None

        # Header keeps its length and flags; only the four-CC changes, and the 20-byte DX10
        # extension between the header and the blocks is dropped.
        return data[:84] + four_cc + data[88:128] + data[148:]

    def dds(self, resource):
        """One texture, extracted on demand. Served as DDS: three.js reads it directly, so there
        is no decode step and the GPU keeps it compressed."""
        name = resource.replace('/', '_').lower() + '.dds'
        path = os.path.join(CACHE, name)

        if not os.path.exists(path) and self._request('texture', resource, path) is None:
            return None

        legacy = os.path.join(CACHE, resource.replace('/', '_').lower() + '.legacy.dds')

        if os.path.exists(legacy):
            return legacy

        try:
            with open(path, 'rb') as handle:
                rewritten = self._legacy_dds(handle.read())
        except Exception:
            rewritten = None

        if rewritten is None:
            return path

        with open(legacy, 'wb') as handle:
            handle.write(rewritten)

        print('[mesh] %s served as legacy DDS (DX10 header the browser cannot read)'
              % resource.rsplit('/', 1)[-1], flush=True)

        return legacy

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

        if name.startswith('decals/') and name.endswith('.json'):
            body = Handler.meshes.decals(name[len('decals/'):-5])

            if body is None:
                return self.send_error(404, 'no terrain decals for that level')

            return self._send(body, 'application/json')

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
