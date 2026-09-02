# How a BF3 surface gets its texture

Written after taking MP_001 from "most of the level is white" to 99.4% of meshes painted with zero
wrong bindings. Everything here was measured, not inferred; where something is still inference it
says so.

## The chain, in the order it must be consulted

1. **MeshVariationDatabase material parameters.** `dump_mesh_textures <mvdb> <out.json>` emits
   `mesh -> variation -> subset -> {ParameterName: texture}`. This is the real binding and it is
   slot-labelled. Roughly two thirds of subsets resolve here.

2. **The mesh's own material**, for a subset whose MVDB entry carries no parameters. Same shape,
   read from the mesh partition.

3. **The shader**, for a material that carries nothing. `dump_shader_textures <shaderdb> <out.json>`
   emits two things and BOTH matter:
   - `shaders[name]` — the textures the shader *streams*.
   - `registers[name]` — `sampler register -> texture`, which is how the GPU binds them.

   A shader with an empty streamable list is **not** a shader without textures. MP_001's backdrop
   houses use `MP001_SS_BBox_01_WET`, which streams nothing and binds `mp01_box_02_D` to a register.
   Gating on the streamable list left eleven buildings white with their texture named in the same
   file.

## Slot names are not always "Diffuse"

A colour map arrives under whatever name the shader gives it. Observed on MP_001 alone:

    Diffuse  MainDiffuse  MainTexture  TileDiffuse  DetailDiffuse  DetailTexture
    DiffuseBark  DiffuseLeaves  AwningTexture  Background  Frame_D  BrandTexture
    Logo  InteriorTexture  EngineTexture  ColorTexture  diffuseAtlas  Texture3

Reading only `Diffuse` scored architecture at 32% when it was actually 92%, and — worse — made the
shader fallback write a `Diffuse` beside a material's real `MainDiffuse`, which the client prefers,
so a guess silently overrode a real binding. `mesh_server.DIFFUSE_SLOTS` and
`MeshManager.diffuseFor` hold the same list and must stay in step.

## Never pick a texture by filename

`_d` is a convention, not a binding. The crane wears `Architecture/Crane_01/CraneAlphaMask_D` — a
cutout MASK whose name ends in `_D` — because "first texture ending in _d" was the rule. It is DXT1,
so it carries no alpha and no downstream alpha-test can rescue it. Likewise "first texture in the
list" paints buildings with their NORMAL map: the level renders bright blue while the coverage
number climbs. If nothing identifies a colour map, leave the subset unbound; untextured is honest,
blue is not.

## Terrain layers

The terrain is a resource, not EBX (`Levels/MP_001/Terrain` is a `WorldPartData`), and its visual
dump names `LayerCount` and a `SurfaceShader` but no textures. The binding is in the generated
per-layer shaders, named `<terrain>__<layers><flags>__<kind>__<lod>`:

- the NAME carries the layer index,
- the sampler REGISTERS carry that layer's textures.

So `layer -> texture` falls out ordered, which matters because the splat map indexes by layer. MP_001
keeps no terrain textures of its own — it draws with **SP_Sniper's** asphalt and rubble and
**SP_Earthquake's** parking lines. No directory scan of `Levels/MP_001/...` can ever find those.

## Roads

Roads are `RibbonData` decals in `Levels/<Map>/TerrainDecals`, not meshes: a centreline (`Points`),
per-point half widths (`RibbonPoints` Left/Right), `UvTileFactor`, `StickToTerrain`. Each names its
material as `Shader2d`, a **cross-partition reference**. Follow it with
`dump_partition_json_by_guid <guid> <out>` to get the shader's NAME, then look the name up in the
registers. MP_001: 102 ribbons on `parkingLines01`, 7 on `Decal_Crossing_01_D` — lines and pedestrian
crossings are different textures, which no name-match could have produced.

## Bundles decide which shaderdb holds what

A level draws with other levels' assets constantly. Which shaderdb holds a given shader follows
BUNDLE membership, so guessing a shaderdb name per level fails exactly where it matters. Two Rime
commands added for this:

- `where_is <name> <out.json>` — the bundle and superbundle a partition or resource lives in.
- `list_resources_of_type_json IShaderDatabase <out.json>` — every shaderdb, to a file.

There are **49**. `tools/meshes/dump_all_shaderdbs.py` dumps them once; the lookup then becomes a
global index and the question disappears. Note the type name is `IShaderDatabase`, not
"ShaderDatabase".

## Traps that silently undid the work

- **`PartitionRegistry` was never populated**, so `CtrRef.Get()` returned null for EVERY material and
  no texture parameters were read at all. Populate it before converting the MVDB — parsing while
  iterating a converted partition closes the shared stream underneath it.
- **The manifest scanner deleted the dumps.** `_load_cached_manifests` walked every `.json` in the
  cache and removed any without a `meshes` key — which is every shader dump, layer list and mvdb
  dump. A dump that takes minutes vanished on the next startup.
- **Two shaderdb names collapsed onto one cache file** (`split('/')[-2]` maps both
  `levels/mp_001/shaderdb` and `levels/mp_001/mp_001/shaderdb` to `mp_001`), so the name that does
  not exist wiped the one that does, every run.
- **`repaint()` could never repaint.** Materials are cached as `resource|normal`, invalidation
  deleted by `resource`, and it ran inside a `.then()` — after the repaint it was meant to enable.
  Geometry never waits for a texture, so this retry is what finishes a level; it had never worked.
- **Shaderdb names were derived from `levels/<map>`**, a directory rather than a partition, so the
  EBX walk found no subworlds and eight of nine names were wrong — reported as Rime failures.

## What is genuinely unbindable

MP_001's wire lights and a few one-offs: material resolves, no texture parameters, no vector
parameters, and their shader `wireLightsBlink` has no compiled entry in ANY of the 49 shaderdbs. One
of the two material references has a partition guid that resolves to nothing. There is no binding to
find — they are drawn from a shader that ships neither texture nor colour constant.

    world subsets bound   95.3%   (every subset the data defines a binding for)
    world meshes painted  99.4%
    wrong bindings        0
