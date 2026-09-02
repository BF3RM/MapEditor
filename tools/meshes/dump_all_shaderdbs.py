#!/usr/bin/env python3
"""Dump EVERY shaderdb the game mounts, once, into the mesh cache.

Which shaderdb holds a given shader follows BUNDLE membership, and a level draws with other levels'
assets all the time -- MP_001's terrain is SP_Sniper's, its wire lights are COOP_009's. Guessing a
shaderdb name per level therefore cannot resolve those, and dumping one level at a time only moves
the guess around. There are 49 of them in total; dumped once, the lookup becomes a global index and
the question stops being "which level might have this" entirely.

Slow (minutes each) and meant to be run once, out of band. mesh_server reads whatever is here.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from export_level_meshes import DEFAULT_GAME_PATH, DEFAULT_RIME  # noqa: E402
import mesh_server  # noqa: E402

rime = mesh_server.Rime(DEFAULT_RIME, DEFAULT_GAME_PATH)

if not rime.start():
    raise SystemExit('could not start Rime')

listing = os.path.join(mesh_server.CACHE, 'shaderdbs.json')

if not os.path.exists(listing):
    rime._command('list_resources_of_type_json IShaderDatabase "%s"' % listing, listing, 240)

names = json.load(open(listing)).get('resources', [])
print('[dump] %d shaderdb(s) to do' % len(names), flush=True)

done = 0

for name in names:
    out = os.path.join(mesh_server.CACHE, 'global.%s.shaders.json' % name.replace('/', '_'))

    if os.path.exists(out):
        done += 1
        continue

    ok = rime.shader_textures(name, out)
    done += 1
    print('[dump] %3d/%d %-52s %s' % (done, len(names), name, 'ok' if ok else 'FAILED'), flush=True)

print('[dump] finished; %d dumps in cache' % done, flush=True)
