#!/usr/bin/env python3
"""Dump a level's shader databases so the terrain can find its layer textures.

Run this OUT OF BAND (it takes minutes to tens of minutes). mesh_server reads whatever it leaves
in the cache; it never dumps inline, because /terrainlayers is on the browser's critical path.

    tools/meshes/dump_terrain_shaders.py MP_001
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from export_level_meshes import DEFAULT_GAME_PATH, DEFAULT_RIME  # noqa: E402
import mesh_server  # noqa: E402

MAP = (sys.argv[1] if len(sys.argv) > 1 else 'MP_001')
LEVEL = 'levels/' + MAP.lower()

rime = mesh_server.Rime(DEFAULT_RIME, DEFAULT_GAME_PATH)

if not rime.start():
    raise SystemExit('could not start Rime')

print('[dump] Rime up; dumping shader databases for %s' % MAP, flush=True)

# A shaderdb sits beside each MeshVariationDatabase, one per subworld -- the plain
# '<level>/shaderdb' name Rime rejects outright. The cached mvdb dumps name the subworlds, so
# derive the candidates from those (mesh_server._shaderdb_names does the same from EBX).
import glob as _glob

subs = sorted({os.path.basename(f).split('.')[1]
               for f in _glob.glob(os.path.join(mesh_server.CACHE, MAP + '.*.mvdb.json'))})
sources = [LEVEL + '/' + sub + '/shaderdb' for sub in subs] + [LEVEL + '/shaderdb']
print('[dump] candidates: %s' % ', '.join(sources), flush=True)

for source in sources:
    out = os.path.join(mesh_server.CACHE, '%s.%s.shaders.json' % (MAP, source.split('/')[-2]))

    if os.path.exists(out):
        print('[dump] already have %s' % os.path.basename(out), flush=True)
        continue

    print('[dump] %s -> %s' % (source, os.path.basename(out)), flush=True)
    ok = rime.shader_textures(source, out)
    print('[dump] %s: %s' % (source, 'ok' if ok and os.path.exists(out) else 'FAILED'), flush=True)

    if ok and os.path.exists(out):
        stale = os.path.join(mesh_server.CACHE, MAP + '.layers.json')

        if os.path.exists(stale):
            os.remove(stale)
            print('[dump] cleared %s.layers.json so it rebuilds with textures' % MAP, flush=True)
