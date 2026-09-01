# The standalone editor — MapEditor in a browser, with no game

The editor runs against real game data with nothing else attached: no VU server, no client, no
engine. It reads levels from WebX as JSON, and extracts geometry, textures and terrain out of the
installed game with Rime, on demand.

Everything downstream of the loader — hierarchy, inspector, gizmos, selection, undo — is the same
code that runs in-game. The standalone path only replaces where the objects come from.

## Running it

Two processes:

```bash
# 1. geometry and textures, extracted from the game as the browser asks for them
tools/meshes/mesh_server.py            # http://localhost:8091

# 2. the editor
cd WebUI && pnpm serve                 # http://localhost:8080
```

Open <http://localhost:8080>. MP_001 loads by default; the bar at the top picks a game and any of
the 49 levels. The URL carries the choice (`?game=Venice&level=Levels/MP_007/MP_007`), so a level
is linkable and survives a reload.

The mesh server is optional. Without it the editor still loads levels, shows the hierarchy and the
inspector, and lets you select and move objects — it just draws nothing.

`WebUI/vue.config.js` proxies both upstreams so the browser sees one origin:
`/webx` → `webx.powback.com` (which sends no CORS header), `/meshes` → `127.0.0.1:8091`.

## How it fits together

```
WebX (webx.powback.com)          the whole EBX as static JSON
  guidDictionary.json            partition guid -> path            (7.2 MB, 70142 partitions)
  <Path>.json                    one partition each
        |
        |  WebXSource      transport: fetch, IndexedDB cache, resolve refs, 8 in flight
        |  LevelLoader     walks LevelData.Objects -> worldparts/subworlds -> reference objects
        v
   editor.gameObjects            the same GameObjects the ext produces in-game
        ^
        |  MeshManager     a .glb per object, plus its materials and textures
        |  StaticModels    the baked layer, from Havok placements
        |  InstancedMeshes one InstancedMesh per mesh subset, matrix per placement
        |  Terrain         heightfield patches
        |  Lighting        the level's sun, sky and environment
        |
mesh_server.py                   resolves what a level needs, extracts what is missing
        |
       Rime                      reads MeshSet/Texture/Havok/Terrain resources out of the bundles
```

## The walk

Exactly what the engine does:

```
LevelData (base WorldData)          <- partition $primaryInstance
  .Objects[]
    SubWorldReferenceObjectData        -> another partition (SubWorldData)
    WorldPartReferenceObjectData       -> another partition (WorldPartData)
      .Objects[] -> ReferenceObjectData
          .Blueprint            -> {$instanceGuid, $partitionGuid} of the prefab
          .BlueprintTransform   -> LinearTransform (right/up/forward/trans)
          .ObjectVariation, .Excluded, ...
```

Subworlds are resolved through `BundleName` rather than `Blueprint` — theirs is null.

### Emit order is a contract, not a detail

`VEXT.HandleResponse` clears `executing` on the batch's *last* element, and
`HierarchyComponent.onSpawnedGameObject` can only attach a node whose parent is already in the tree
or in the same batch. So each subtree goes out as **one batch, children first and root last**.

This is the same rule commit `d1932d0e` established for the in-game server-only path, where
breaking it put all 1700 objects flat under Vanilla. If the hierarchy ever goes flat again, this is
the first thing to check — in either realm.

## Geometry

`MeshManager` reads a per-level manifest (`/meshes/<Map>.json`) mapping blueprint partition guid →
a list of parts, each a `.glb` file plus a composed transform. A blueprint whose mesh sits deeper
than a direct `Mesh` field — inside a prefab — contributes every part it holds, which is what makes
the count come out right; taking only the top-level mesh left 771 objects undrawn.

Meshes attach as children of the `GameObject`, which already extends `THREE.Object3D`. Because
those children are not themselves GameObjects, `GameObject.entityChildren()` filters them out, or
selection and highlighting break on `go.onUnhighlight is not a function`.

### The baked layer

Most of a BF3 level is not placed through EBX reference objects at all: it is baked into
`StaticModelGroupEntityData`, whose transforms live in the level's **Havok** data. Rime's
`dump_level_placements` resolves those without building geometry, and `StaticModels` places them —
4736 of them on MP_001, deduped against the EBX-placed objects by mesh + position (0.1 m).

They hang under one synthetic `StaticModelGroup` node, one group per mesh, emitted last in each
batch. Putting them at the top level instead produced 5337 root nodes and an unusable hierarchy.

### Instancing

Every baked placement of the same mesh becomes one `InstancedMesh` with a matrix per copy —
on MP_001, 4414 placements collapse to 638 instanced meshes over 465 unique meshes, taking draw
calls from 18,640 to 7,713.

Two traps, both of which have bitten:

- **Double-drawing.** An instanced object must not also get a cloned mesh. The flag lives in a guid
  set on `MeshManager`, not on `GameObjectTransferData` — that constructor drops unknown fields.
- **Unpainted batches.** Instanced meshes are built after the material pass, so `InstancedMeshes`
  hands each finished batch back through `adopt()` for repainting. Without it, textured coverage
  sat at 349/638 instead of 600/638.

## Textures

The bindings are not on the mesh. Frostbite keeps them in the **MeshVariationDatabase**: mesh →
variation → material → texture parameters. `dump_mesh_textures` walks that, and the server merges
every MVDB a level touches, **richest entry wins** — an empty root entry otherwise beat the
populated gamemode one.

Resolution order for a subset, in `MeshManager`:

1. its material's diffuse binding, under any of the names BF3's shaders use
   (`Diffuse`, `MainDiffuse`, `TileDiffuse`, `ColorTexture`, `diffuseAtlas`);
2. the shader database, via `dump_shader_textures` — a shader's `StreamableTextures`;
3. another subset's texture on the same mesh, rather than leaving this one bare.

**Variations are kept, all of them**, keyed by hash — collapsing to the base appearance cost 101
texture references across 142 meshes that have more than one. Per-object *selection* of a variation
is not wired yet: the client still draws the base.

### Formats

- DXT1/DXT3/DXT5 go to the GPU still compressed, no decode step.
- **BC5 in a DX10-header DDS** — most of BF3's normal maps — is read by three's DDSLoader in
  neither respect. `dds_convert.py` decodes those to PNG (two BC4 channels, Z reconstructed;
  a flat normal decodes to 127/127/254).
- A format the loader rejects still returns a *texture*, just with no image behind it. Handing that
  to the GPU throws inside `uploadTexture` and takes the whole renderer down, so a texture is only
  accepted if `mipmaps[0].width` is real.
- Normal maps are routed **on the four-CC**, read from the header: plain DXT loads off the DDS,
  BC5 goes to the PNG endpoint. Trying the loader first also works but complains to the console
  once per texture, which is where the `Unsupported FourCC code DX10` flood came from.
- Alpha-tested by format: 33777 and 33779 (DXT3/DXT5) get `alphaTest`, so foliage is not a slab.

### The sky as environment

Some surfaces declare no textures anywhere — `MP001_SS_BBox_01_WET`, the backdrop shell, has no
binding in the MVDB, the shader database or the mesh. The level's `SkyComponentData.PanoramicTexture`
binds as `scene.environment` so they take colour the way the engine gives it to them.

It runs **off the critical path**: the sky may still be extracting, and awaiting it blocked terrain
behind it. Nothing below it should wait on a texture that is only ambience.

## Terrain

`dump_terrain_nodes` reads the level's `.streamingtree`. Each node carries a 133×133 UInt16
heightfield; a 2-sample border is dropped for a 129×129 grid, and `height = sample * worldScaleY`.

Only the **deepest** nodes are drawn — the tree is a LOD pyramid, so drawing every level stacks
four surfaces on top of each other. On MP_001 that is 20 nodes at depth 3, of 30 with data.

Validated rather than eyeballed: 4627 × 0.015625 = 72.3 m, which matches the placed objects' heights,
and the surface spans y 61–80 against declared bounds of 61.2–80.3.

## Lighting

`OutdoorLightComponentData`, found through the level's `VisualEnvironment` objects: SunColor,
SkyColor, GroundColor, and the sun's rotation. The sun casts shadows; terrain and meshes receive.

## The UI

- **Level picker** — game + level, from `guidDictionary.json` entries matching `Levels/<Map>/<Map>`.
- **Camera** — left drag rotates, right drag trucks, wheel dollies. `frameLevel()` frames on the
  80th-percentile radius, so one stray object at the map edge does not zoom the camera into orbit.
- **Selection** — mesh picking against the attached geometry. SelectionHelper's own drag-select is
  disposed: once the canvas took input it fought the camera and crashed on `removeChild`.
- **Mobile** — under 1000px the panels become drawers behind a bottom tab bar. The dock covers the
  canvas, so the layout hands pointer events back: `#glHolder`, `.fx-main` and `.fx-top` go
  `pointer-events: none`, the panels and dividers `auto`. Guarded on `window.debug`, so the in-game
  editor is untouched.

## The mesh server

It keeps **one RimeREPL mounted**. Mounting BF3 takes ~30 s and dominates any export, so the server
mounts once at startup and then writes commands to the live REPL: a cache miss costs about 0.3 s,
a hit 0.003 s. Extracted files land in `.mesh-cache/` (gitignored — generated, large, and game
assets rather than source).

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

Two more things the server has to do, learned the hard way:

- **Type-guard before dumping.** `dump_mesh` on an FX resource hangs for 120 s. `is_mesh` /
  `is_texture` check the EBX type first.
- **Never block a request on an extraction.** Work goes on a background queue and completion is
  detected by the *file appearing*, not by parsing the REPL prompt, which was unreliable enough to
  produce false timeouts. The client re-asks; `FillPendingMeshes` fills geometry in as it lands.

### Endpoints

| Endpoint | Serves |
| --- | --- |
| `/<Map>.json` | mesh manifest: blueprint partition guid → parts (glb + transform) |
| `/placements/<Map>.json` | baked static placements, from Havok |
| `/textures/<Map>.json` | mesh → variation → material → texture bindings |
| `/terrain/<Map>.json` | heightfield nodes, world scale, raster tree inventory |
| `/<file>.glb` | one extracted mesh |
| `/texture/<path>.dds` | one texture, as stored |
| `/normal/<path>.png` | a BC5 normal map, decoded |

To pre-extract instead of waiting on demand:

```bash
tools/meshes/export_level_meshes.py --level Levels/MP_007/MP_007
tools/meshes/export_level_meshes.py --all          # every level, one Rime session
```

## What this needed from Rime

Nine commits in `~/Projects/Rime` (local, unpushed — PR pending confirmation):

| Commit | What |
| --- | --- |
| `dump_level_placements` | a level's mesh placements without building geometry (float[12], engine-agnostic `ConvertLevelPlacements`) |
| `dump_mesh_textures` | mesh → material → texture bindings from an MVDB, every variation, keyed by hash |
| `dump_shader_textures` | a shader's `StreamableTextures` from a shaderdb |
| `dump_terrain_nodes` | heightfields, via a new `ITerrainHeightfield` + `TerrainHeightfieldReader` |
| terrain fixes | `new List<RasterTree>(count)` is capacity, not size — the list was empty where it should have held nulls; plus a resync on the declared raster-tree size |
| MVDB fix | keep entries whose mesh partition does not resolve |

Building `RimeLib.*.Frostbite2_0` for Mesh, Toolkit, Havok, Texture and Shader matters: a missing
implementation silently *unregisters* the command that needs it, which reads as "command not found"
rather than as a build problem.

## Where it stands on MP_001

| | |
| --- | --- |
| objects | 7064 |
| meshes attached | 1574, plus 638 instanced meshes covering 4414 placements |
| baked statics | 4736 |
| materials | 385, of which 240 carry a normal map |
| terrain | 20 patches at the deepest LOD |
| blueprints with no geometry | 83 — all gameplay or lighting (capture points, spawns, conquest logic, voice-overs, visual environments); the three that read like models by name hold lens flares, a point light, sound areas and volume shapes, and no mesh |
| containers | 538 worldparts and subworlds, which own no geometry by nature |

## Checking it works

```bash
tools/e2e/standalone_level.py          # needs the dev server up
tools/e2e/hierarchy_e2e.py             # in-game: fails on a flat tree
```

`standalone_level.py` drives headless Chromium over CDP and fails unless the level loads as a
nested hierarchy AND triangles are actually drawn — an empty scene and a scene of black silhouettes
look identical in a screenshot, which is a mistake this pipeline has already made once.

## Known gaps

- **Terrain has no colour.** The heightfield is drawn with a neutral material. The mask that says
  which material goes where is `TerrainMaskTree` (1.35 MB on MP_001) and Rime has no parser for it;
  `TerrainMaterialTree` (39.5 kB) and `materialPairIndices` are read but not yet resolved to
  textures.
- **Variation selection.** All variations are extracted, but an object does not yet pick its own —
  everything draws the base appearance.
- **Specular maps** are extracted and unbound; three's standard material has no specular slot, so
  this needs a decision rather than a wire-up.
- **No per-shader logic.** One standard material stands in for every BF3 shader.
- **Prefab internals stay collapsed** in the hierarchy. Expanding every placed prop's blueprint is
  thousands of fetches, so browser depth is shallower than the in-game tree (3 vs 6 on MP_001).
- **Guid strategy differs from in-game.** Vanilla objects get `GetVanillaGuid(name, transform)`
  there; here the reference object's own `$guid` is used. Stabler, but the two do not match — write-back
  has to reconcile them or saves will not interop.
