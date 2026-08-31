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
    level_roots, resolve_meshes,
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

                # Recognise the end of a command from what the REPL says, rather than waiting for a
                # file that may never appear. Plenty of resources named in a level are not MeshSets
                # at all (FX, for one), and dump_mesh reports that in prose -- waiting out the
                # timeout on each of those stalled every later request behind it.
                if ('extracted ' in lowered or 'placements for ' in lowered
                        or 'failed' in lowered or 'could not' in lowered
                        or 'command not found' in lowered or 'error' in lowered):
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

    def placements(self, level_path, destination, timeout=900):
        """Resolve where every mesh in a level sits, including the baked StaticModelGroup
        instances whose transforms live in the level's Havok physics data rather than EBX."""
        return self._command('dump_level_placements %s "%s"' % (level_path.lower(), destination),
                             destination, timeout)

    def dump(self, mesh_path, destination, timeout=120):
        """Extract one mesh. Serialised: one REPL, one command at a time."""
        return self._command('dump_mesh Glb %s "%s"' % (mesh_path.lower(), destination),
                             destination, timeout)

    def _command(self, command, destination, timeout):
        with self.lock:
            if not self.alive():
                print('[mesh] Rime is not running; cannot run: %s' % command, flush=True)
                return False

            self.done.clear()

            try:
                os.write(self.master, (command + '\r').encode())
            except OSError as e:
                print('[mesh] write to Rime failed: %s' % e, flush=True)
                return False

            if not self.done.wait(timeout):
                print('[mesh] timed out running: %s' % command, flush=True)
                return False

            # Wait for the file rather than parse the REPL's prose: a failed dump reports in words,
            # and a zero-byte file is that same failure.
            # The REPL says it is done before the file is fully flushed, so settle on a stable size.
            deadline = time.time() + 20
            size = -1

            while time.time() < deadline:
                if os.path.exists(destination):
                    current = os.path.getsize(destination)

                    if current > 0 and current == size:
                        return True

                    size = current

                time.sleep(0.05)

            return os.path.exists(destination) and os.path.getsize(destination) > 0


class Meshes:
    """Resolves levels to meshes, and caches both the manifests and the .glb files."""

    def __init__(self, rime):
        self.rime = rime
        self.ebx = Ebx(GAME)
        self.ebx.open(os.path.join('/tmp', 'webx-guiddict.json'))
        self.levels = {p.split('/')[-1].lower(): p for p in level_roots(self.ebx)}
        self.by_file = {}
        self.unavailable = set()
        self.warming = False
        self.lock = threading.Lock()
        self._load_cached_manifests()
        print('[mesh] %d partitions, %d levels, %d meshes known'
              % (len(self.ebx.paths), len(self.levels), len(self.by_file)), flush=True)

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

    def _warm(self, meshes):
        if self.warming:
            return

        self.warming = True

        def run():
            done = 0

            for mesh in meshes:
                name = file_name_for(mesh)

                if os.path.exists(os.path.join(CACHE, name)) or name in self.unavailable:
                    continue

                if self.rime.dump(mesh, os.path.join(CACHE, name)):
                    done += 1
                else:
                    self.unavailable.add(name)

            print('[mesh] warm-up done: %d extracted, %d unavailable' % (done, len(self.unavailable)), flush=True)
            self.warming = False

        threading.Thread(target=run, daemon=True).start()

    def glb(self, name):
        path = os.path.join(CACHE, name)

        if os.path.exists(path):
            return path

        mesh = self.by_file.get(name)

        if mesh is None or name in self.unavailable:
            return None

        print('[mesh] extracting %s' % mesh, flush=True)

        if self.rime.dump(mesh, path):
            return path

        # Remember the miss. A level names plenty of resources that are not MeshSets, and every
        # instance of one would otherwise ask Rime again.
        self.unavailable.add(name)

        return None


class Handler(BaseHTTPRequestHandler):
    meshes = None

    def do_GET(self):
        name = self.path.split('?')[0].lstrip('/')

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
