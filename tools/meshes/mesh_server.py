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

    def textures(self, mvdb, destination, timeout=900):
        """Which texture each mesh subset is painted with. The bindings live in the level's
        MeshVariationDatabase, not on the materials in a mesh's own partition."""
        return self._command('dump_mesh_textures %s "%s"' % (mvdb.lower(), destination),
                             destination, timeout)

    def texture(self, resource, destination, timeout=60):
        return self._command('dump_texture %s "%s"' % (resource.lower(), destination),
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

    def __init__(self, rime):
        self.rime = rime
        self.ebx = Ebx(GAME)
        self.ebx.open(os.path.join('/tmp', 'webx-guiddict.json'))
        self.levels = {p.split('/')[-1].lower(): p for p in level_roots(self.ebx)}
        self.by_file = {}
        self.unavailable = set()
        self.queued = set()
        self.kinds = {}
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
            manifest = {'game': GAME, 'level': level,
                        'blueprints': {g: file_name_for(m) for g, m in mapping.items()},
                        'meshes': {file_name_for(m): m for m in set(mapping.values())}}

            for guid, mesh in mapping.items():
                self.by_file[file_name_for(mesh)] = mesh

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

                    for mesh, materials in found.items():
                        # First database wins: the level's own is asked for first and is the most
                        # authoritative for meshes it knows.
                        merged.setdefault(mesh, materials)

                json.dump({'meshes': merged}, open(path, 'w'))
                print('[mesh] textures for %s: %d meshes' % (map_name, len(merged)), flush=True)

        return open(path, 'rb').read()

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

    Handler.meshes = Meshes(rime)
    print('[mesh] serving on http://localhost:%d (cache: %s)' % (PORT, CACHE), flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()

    return 0


if __name__ == '__main__':
    sys.exit(main())
