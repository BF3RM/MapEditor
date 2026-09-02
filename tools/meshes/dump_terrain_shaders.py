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

# The shaderdb names come from the level's own EBX, not from a guess.
#
# Each MeshVariationDatabase has a shaderdb beside it, one per subworld, and mesh_server already
# derives that list by walking the level partition's Objects (Meshes._shaderdb_names). Guessing
# them from cached filenames found exactly one of nine and reported the rest as FAILED, which reads
# as "Rime cannot dump these" when the names were simply wrong.
meshes = mesh_server.Meshes(rime)

# The level's PARTITION path, not its directory: 'Levels/MP_001/MP_001', which is what the EBX walk
# needs. Passing 'levels/mp_001' resolves to no partition, so the walk finds no subworlds and only
# the base shaderdb name comes back -- which is exactly what made eight of nine names look like
# Rime failures.
level_partition = meshes.levels.get(MAP.lower()) or LEVEL
print('[dump] level partition: %s' % level_partition, flush=True)
sources = meshes._shaderdb_names(level_partition)

print('[dump] %d shaderdb name(s) from the level EBX:' % len(sources), flush=True)

for s_Name in sources:
    print('        ' + s_Name, flush=True)

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
