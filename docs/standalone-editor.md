# The standalone editor — MapEditor in a browser, with no game

The editor runs against real game data with nothing else attached: no VU server, no client, no
engine. It reads levels from WebX and extracts geometry from the game with Rime, on demand.

## Running it

Two processes:

```bash
# 1. geometry, extracted from the game as the browser asks for it
tools/meshes/mesh_server.py            # http://localhost:8091

# 2. the editor
cd WebUI && pnpm serve                 # http://localhost:8080
```

Open <http://localhost:8080>. MP_001 loads by default; the bar at the top picks a game and any of
the 49 levels. The URL carries the choice (`?game=Venice&level=Levels/MP_007/MP_007`), so a level
is linkable and survives a reload.

The mesh server is optional. Without it the editor still loads levels, shows the hierarchy and the
inspector, and lets you select and move objects — it just draws nothing.

## How it fits together

```
WebX (webx.powback.com)          the whole EBX as static JSON
  guidDictionary.json            partition guid -> path
  <Path>.json                    one partition each
        |
        |  WebXSource      transport: fetch, cache (IndexedDB), resolve refs
        |  LevelLoader     walks LevelData.Objects -> worldparts/subworlds -> reference objects
        v
   editor.gameObjects            the same GameObjects the ext produces in-game
        ^
        |  MeshManager     attaches a .glb per object, from the manifest
        |
mesh_server.py                   resolves a level's meshes, extracts what is missing
        |
       Rime                      reads MeshSet resources out of the game's bundles
```

Both realms of the pipeline emit the *same* `SpawnedGameObject` shape the ext sends, so everything
downstream — hierarchy, inspector, gizmos, selection — is the code that runs in-game.

## The mesh server

It keeps **one RimeREPL mounted**. Mounting BF3 takes ~30s and dominates any export, so the server
mounts once at startup and then writes `dump_mesh` commands to the live REPL: a cache miss costs
about 0.3s, a hit 0.003s. Extracted files land in `.mesh-cache/` (gitignored — generated, large,
and game assets rather than source).

Driving that REPL has three requirements, each of which fails silently if missed:

- **A PTY, not pipes.** The REPL reads with `Console.ReadKey()`, which throws outright when stdin
  is redirected.
- **A terminal size.** It draws its prompt against `Console.WindowWidth`; on a PTY reporting 0 it
  dies in `Substring` before reading anything.
- **Answers to `ESC[6n`.** .NET's console echo asks the terminal for the cursor position after
  keystrokes and waits for the reply. With nothing answering, the command line never completes and
  the command simply never runs.

`select_game` is issued *interactively*, not from the boot commands file: `DROP` hands the REPL the
context the file started with, so a `select_game` in the file is undone the moment it drops, and
`dump_mesh` — which only exists inside a game — comes back "Command not found".

To pre-extract instead of waiting on demand:

```bash
tools/meshes/export_level_meshes.py --level Levels/MP_007/MP_007
tools/meshes/export_level_meshes.py --all          # every level, one Rime session
```

## Checking it works

```bash
tools/e2e/standalone_level.py          # needs the dev server up
```

It drives headless Chromium over CDP and fails unless the level loads as a nested hierarchy AND
triangles are actually drawn — an empty scene and a scene of black silhouettes look identical in a
screenshot, which is a mistake this pipeline has already made once.

## Known gaps

- **Prefab internals stay collapsed.** Expanding every placed prop's blueprint is thousands of
  fetches, so browser depth is shallower than the in-game tree (3 vs 6 on MP_001).
- **No textures.** Rime's converter assigns each mesh subset a random colour, so everything renders
  in one neutral material instead. Real materials need the texture pipeline.
- **Objects whose mesh sits deeper** than a direct `Mesh` field get no geometry (531 of 2804 on
  MP_007), along with groups, which have none by nature.
