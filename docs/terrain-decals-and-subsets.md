# Baked terrain decals, decal compositing, and the subset-order bug

Written while taking the standalone renderer from "roads are approximated ribbons with an
iridescent stripe and the trees are black slabs" to real baked decal geometry and correctly painted
multi-material meshes. Everything here is measured; where something is still open it says so, and
two of my own hypotheses are recorded as disproved because they cost time and would otherwise be
tried again.

---

## 1. Roads are not splines. They are baked geometry.

`Levels/<Map>/TerrainDecals` holds `RoadData` — a centreline, per-cross-section half widths, a UV
tile factor. That is the **authoring** form. What ships, and what the engine actually draws, is a
separate resource:

    Levels/MP_001/Terrain/MP001_Terrain/MP001_Terrain.Decals     (ResourceType 0x15E1F32E)

named in the terrain's visual dump under the field `Decals`, and read by Rime's
`dump_terrain_decals_json`. **The resource name needs its `.decals` extension** — passing the
terrain's own name gets you `is not a TerrainDecals (it is Terrain)`.

It holds three geometries. For MP_001:

| geometry | blocks | vertices | indices | what it is |
|---|---|---|---|---|
| `Geometry2d` | 29 | 864 | 1830 | position is `(x, z)` only — draped onto whatever height the ground has. The FAR LOD. |
| `Geometry3d` | 29 | 1439 | 3846 | position is `(x, y, z)` — conforms to the terrain. Drawn inside `Decal3dFarDrawDistance` (60 m). |
| `GeometryWater` | 0 | — | — | empty on this level. |

Both LODs carry the same content at two tessellations, so **drawing both double-exposes every
marking and z-fights it against itself**. `TerrainDecals.ts` takes the 3d one wherever it exists and
falls back to draping the 2d one.

Block indices are **absolute into the geometry's own vertex array**, and one shader's blocks are
contiguous runs of it, so nothing has to be re-indexed — the server emits one vertex array per LOD
and an index list per shader.

### The per-vertex blend weight

Each vertex carries four `UserMasks` as raw 16-bit halves. **All four hold the same value** on every
vertex measured (2d and 3d, min 0.0, max 1.125, mean 0.93). It is one edge-fade weight stored four
times, and it is what fades every road end, edge and junction into the terrain. The ribbons had
nothing equivalent, which is why every ribbon ended in a hard rectangle.

### What is NOT in MP_001's decals

The brief expected the road SURFACE here. It is not. MP_001 binds exactly three decal shaders:

    MP001_Decal_Crossing_2D/3D  ->  Decal_Crossing_01_D  (+ _01_N on the 3d form)
    MP001_RoadLinesWhite_2D/3D  ->  parkingLines01       (+ _N)
    TracksDark_2d/3d            ->  T_Tracks_01_D

There is **no asphalt among them**. Grand Bazaar's road surface is painted by the terrain's own
material layers (`TerrainMaterial.ts`); the decals are the markings laid over it. Other levels do
bake their surface here — SP_Villa ships `SP_010_AsphaltRoad_Main2d/3d`, MP_012 an airfield sheet —
which is why the compositing below has an `opaque` case at all.

So switching from ribbons to baked decals does not add asphalt on MP_001. What it adds is the
**crossings and the tank tracks**, which were never ribbons and were therefore never drawn, plus
correct geometry and edge fades for the markings that were.

---

## 2. A decal texture's compositing is measured, not named

Three modes, decided server-side from the pixels (`Meshes._decal_paint`):

| mode | test | example |
|---|---|---|
| `alpha` | the alpha channel VARIES (sd ≥ 8) | `Decal_Crossing_01_D` — near-white RGB, alpha sd 117.9. `T_Tracks_01_D` — near-black RGB (mean 27.5), alpha sd 104.1. RGB is albedo, A is coverage. |
| `mask` | alpha is CONSTANT and ≥ 25% of the texture is near-black | `parkingLines01` — alpha sd 0.0, black fraction 0.313. Coverage is the LUMINANCE; albedo is white. |
| `opaque` | alpha constant, little black | a baked asphalt or gravel sheet. Only the vertex fade shapes it. |

The `mask` case is the one that mattered. `parkingLines01` is a 64×1024 strip whose three channels
carry **independent** compression noise — r(R,G)=0.544, r(R,B)=0.487, r(G,B)=0.538, each channel's
sd near 96 — over what is, per channel, the same white line on black. Painted as albedo that noise
lands on the ground as colour, which is the iridescent stripe. Read as coverage (`(r+g+b)/3`, the
mean rather than the max, because the mean is what averages independent per-channel noise out) it
is what it is: a worn white line.

Measured on the marking itself, before → after: **mean chroma 25.8 → 8.4** (−67%), and the marking
covers 1497 → 1970 pixels because the baked geometry is fuller than the resampled ribbon.

### three.js will silently share one shader between them

`onBeforeCompile` does not participate in three's program cache key. Three `MeshStandardMaterial`s
that differ only in what their `onBeforeCompile` injects are **identical** by that key, so the first
one to compile wins and the others silently run its shader. The masked markings were running the
`alpha` group's shader and kept their noise as colour — the exact bug the file exists to fix, with
the fix already written. `material.customProgramCacheKey = () => 'terrain-decal-' + paint` is
required. Measured: mean chroma on the marking 18.7 with the collision, 8.4 without.

---

## 3. Half the level's multi-material meshes were painted from the wrong subset

This was found while chasing "the trees are black slabs" and is much bigger than the trees.

A `.glb` from Rime carries one primitive per mesh subset, in subset order, and names each one's
material from `MeshSubset.MaterialName` (`Leaves`, `Bark`, `Glass`, `Door`, `Rebar`…). The
MeshVariationDatabase also lists one entry per subset. **They are not in the same order.**

Measured over MP_001's 199 multi-subset meshes: **78 have a part whose own material name matches a
DIFFERENT subset's bindings than its position gives it, against 82 where position and name agree.**

The linden tree is the visible case. Isolating its two subsets by visibility proved it outright:

* subset 0 — the leaf cards — was given `treelindenbark_01_d`, DXT1, no alpha, and rendered as
  dark opaque slabs;
* subset 1 — the trunk — was given `treelindenatlas_01_d` and was **cut into leaf shapes** by that
  atlas's alpha, leaving a thin spindle.

### The join

The subset's own authored material name against the names in the same mesh's bindings — the texture
resources and the shader's parameter slots, which echo it (`DiffuseLeaves`, `DiffuseBark`). Authored
name against authored name: an identity join, not an inference about what a texture contains, which
is what the pixel classifier is for.

Two rules keep it safe:

* **Digits are kept** in the comparison token. Stripping them — the obvious way to write it —
  collapses `Wall1`, `Wall2`, `Wall3` to `wall`, which matches every subset and identifies none.
* **A match at the part's own position wins.** Position and name agreeing is the normal case and
  must not be disturbed; a name that matches nothing leaves the part exactly where it was.

That gives a guarantee worth stating: **a part can only move from a subset that does not mention its
material name to one that does.** No move can make a name agreement worse. Measured over the level:
70 parts across 51 meshes re-bound, all 70 in that direction.

A sample of what changed, and why each is a correction rather than a shuffle:

    Kornet_D    Glass_D                    -> kornet_d          (a straight swap with `glass`)
    Rebar       BuildingSite_D             -> rebar_d
    barb        Holes_D                    -> BarbWire_D
    Cables      streetlight_05_d           -> cables_da
    Concrete    tileatlas_01_d             -> concrete_02_d
    Lights      Tire_03_D                  -> Lights
    Interior    Glass_Breaking_01_D        -> Interior01_D

### One subset can hold a whole tree

BF3's linden LOD binds `DiffuseBark` AND `DiffuseLeaves` in a single material. A fixed list of slot
names cannot say which of the two a given part wants; the part's own name does, and it is the same
word the artist put in the slot. `textureFor` therefore tries a slot NAMED after the part's material
before any general slot list — still checking `colourMap` on the result, because a material can bind
a normal under a diffuse-shaped slot.

Measured on the tree, before → after: green (foliage) pixels **0.1% → 2.4%**, near-black **72.7% →
64.5%**, background visible through the canopy **22.5% → 26.6%** (the alpha cut-out now works).

---

## 4. Classifier: BC5 normals with shallow relief were read as splat maps

`Decal_Crossing_01_N` is a genuine BC5 normal whose two axes deviate 7.6 and 8.3 — just under the
8.0 signal floor — so only one channel counted as "carrying", the two-channel-normal test failed,
and the sum-spread test then claimed it as a `splat` (its sum is near-constant because two of its
four channels are constants).

The fix is a shape test on the FORMAT rather than on the relief: blue and alpha with **zero**
deviation, blue's mean near 0, red and green centred on 128. That is BC5/DXN and nothing else, at
any relief depth. `CLASSIFIER_RULES` bumped to 4; the established verdicts are unchanged
(`Asphalt_01_D` splat, `Perlin` detail, `Noise_N` packednormal, `Decal_Crossing_01_D` colour,
`T_Tracks_01_D` detail, `parkingLines01` data).

---

## 5. Terrain normals, detail break-up and the sun — all working, and how I briefly convinced myself otherwise

The brief listed terrain normals and detail maps as "bound and unused". They are fully implemented
in `TerrainMaterial.ts` and they work end to end. Measured standing on open, unoccluded ground at
world (200, -200):

| | |
|---|---|
| sun's share of the ground's light | **24%** (luminance 73.4 with it, 55.7 without) |
| per-material normals alone | change **7.7%** of ground pixels (mean delta 2.66) |
| detail grey + bump alone (`Perlin`, `Noise_N`) | change **3.6%** (mean delta 2.45) |
| both together | change **13.8%** (mean delta 3.72) |

Everything is bound: `uNrm0/1/2` (three distinct 1024px maps), `uGrey` (`Perlin`, 512px), `uBump`
(`Noise_N`), `uNrmMask` (1,1,1), tiling 32 m from `TextureSamplesPerMeterMax`. `uDebug 1` paints a
proper tangent normal, `uDebug 3` shows it reaching the shading normal, and zeroing the strengths
flattens both to exactly (128,128,255) and flat green.

### The wrong turn, written down because it was expensive

I first measured all of this from a street view and an aerial view and concluded that the sun
supplied **0%** of the ground, that the shadow factor was a hard 0.000 at every bias, and that this
"points at the shadow matrix rather than at bias or content". Every one of those measurements was
real. The conclusion was wrong.

**Both cameras happened to sit on genuinely occluded ground.** The street is under an elevated
walkway; the aerial's target had ten occluders between it and a 17-degree-elevation sun. Every
symptom follows from that and none of it needed a bug:

* no shadow EDGES in view -- correct, because the whole visible ground was inside one shadow;
* raising the sun 2.2 -> 20 not changing the image -- correct, because 20 x 0 is still 0;
* every bias and normalBias giving exactly 60.8 -- correct, because the occluders are metres-thick
  geometry and no bias in that range moves a shadow that deep.

What settled it was a **direct probe instead of an outcome**: for a ground point, raycast toward the
sun to establish ground truth, then compute the shadow coordinate exactly as the fragment shader
does (`P.applyMatrix4(light.shadow.matrix)` after `light.shadow.updateMatrices(light)`), read the
packed-RGBA texel at that uv with `readPixels`, unpack it with three's own `UnpackFactors`, and
compare:

    (200, -200)   0 occluders   coord z 0.3933   stored 1.0000   -> LIT       (map cleared: nothing above it)
    (8,   -60)    9 occluders   coord z 0.4103   stored 0.4016   -> SHADOWED  (correct)
    (-100, -85)  10 occluders   coord z 0.4126   stored 0.4009   -> SHADOWED  (correct)

The shadow system is correct. **There is no shadow-matrix bug.** The lesson is one this project
already had: a measurement of an outcome, over a region whose ground truth you have not established,
is not a measurement of the mechanism. Raycasting toward the light first would have cost two minutes
and saved an hour.

One real observation survives: the ground is lit 72% by the hemisphere light, which in three r147
uses the **unperturbed** `geometryNormal`, and 28% by a roughness-0.95 environment lookup, which is
near-uniform. So in shadow the terrain's relief genuinely cannot show -- that is three's lighting
model, not a defect -- and the relief appears where the sun reaches, which is where it should.

## 6. What MP_001's terrain shader actually does, read from its shipped bytecode

`dump_shader_solutions levels/mp_001/mp_001/shaderdb MP001_Terrain__0MD_3MD_4MD_5MD__3d__0 <dir>`
yields 32 permutations; reflecting the largest with `tools/meshes/dxbc_reflect.py` gives the
resource table below. This is the shader's own declaration, not an inference.

    bind texture   texture_virtualTextureIndirection  register 1
    bind texture   texture_virtualTextureAtlas0       register 2
    bind texture   texture_virtualTextureAtlas1       register 3
    bind texture   texture_Texture15                  register 4
    bind texture   texture_Texture                    register 5
    bind texture   texture_maskMap                    register 6
    bind texture   texture_NormalMap                  register 7
    bind texture   texture_Texture30                  register 8
    bind texture   texture_Texture28                  register 9
    bind texture   texture_heightfieldAtlas           register 10
    bind texture   texture_Texture4                   register 11
    bind texture   texture_irradianceChroma           register 12
    bind texture   texture_irradianceLuma             register 13

    cbuffer externalConstants (176 bytes)
      external_virtualTextureAtlasTileCount / BorderTransform / IndirectionUnpack
      external_worldToMask0UvTransform, external_worldToMask1UvTransform, external_worldToMask2UvTransform
      external_worldToHeightfieldUvTransform, external_heightfieldPixelSizeAndAspect
      external_enlightenUvTransform, external_enlightenUvTranslation, external_enlightenScaleAndOffsetXZ

Consistent across every permutation, and the VERTEX shader binds `texture_heightfieldAtlas` too --
BF3 displaces a flat grid on the GPU rather than shipping terrain triangles.

### Cross-referencing the register numbers names the slots

The shaderdb says which texture sits in which register; the bytecode says what the shader calls that
register. Together, for this shader:

| reg | shaderdb texture | shader's name for it |
|---|---|---|
| 4 | `Asphalt_01_D` | `texture_Texture15` |
| 5 | `Rubble_01_D` | `texture_Texture` |
| 6 | *(nothing in the shaderdb)* | `texture_maskMap` |
| 7 | `Noise_N` | **`texture_NormalMap`** |
| 8 | `Perlin` | `texture_Texture30` |
| 9 | `Rubble_01_N` | `texture_Texture28` |
| 10 | *(nothing)* | `texture_heightfieldAtlas` |
| 11 | `WetGround_01_M` | `texture_Texture4` |

Two things fall out of that:

* **`Noise_N` is bound to the shader's own `NormalMap` slot.** `TerrainMaterial.ts` uses it as the
  fine detail normal on measured grounds (two centred channels in R and A). The shader agrees. That
  is a guess confirmed against the game rather than against pixels.
* **`maskMap` and `heightfieldAtlas` bind to registers the shaderdb names nothing for**, because
  they are not texture resources -- they are the runtime mask and heightfield. That is the
  TerrainMaskTree, and it is the one input to the blend we still cannot read (§ Not attempted).
  The three `worldToMask{0,1,2}UvTransform` constants say there are three mask channels with
  independent world-to-UV mappings, which matches a three-weight blend.

### The virtual texture is a cache, not a shipped asset -- do not chase it

It is tempting to read `virtualTextureIndirection` + two atlases as "BF3 bakes terrain colour into an
atlas, so stop blending layers per pixel". That is half right and the wrong half is load-bearing.
Frostbite 2's terrain virtual texture is composited **at runtime** from these same layer materials
and masks and then cached in the atlas; there is no baked colour atlas in the level data to read.
So blending the layers per pixel, which is what `TerrainMaterial.ts` does, is the correct
reproduction of the source-of-truth -- the VT is the engine's caching of exactly that work. What is
genuinely missing is the **maskMap**, not a baked texture.

### The fidelity gap nobody has costed yet: Enlighten

`texture_irradianceChroma` and `texture_irradianceLuma` with `external_enlightenUvTransform` /
`UvTranslation` / `ScaleAndOffsetXZ` are Enlighten's baked global illumination, sampled per pixel on
every terrain fragment. We substitute a single hemisphere light. That is very likely a larger
contributor to "it does not look like the game" than any remaining texture binding, and it is a
whole subsystem rather than a fix.

### Wetness stays unimplemented, deliberately

`WetGround_01_M` measures as three independent masks (means 10.0 / 20.1 / 5.1, deviations 30.8 /
67.7 / 33.8, alpha constant) -- mostly black with sparse signal in each channel. The shader binds it
to the generic slot `texture_Texture4`, which does not say which channel means what or how it
modulates. Applying it now would be inventing two constants and a channel choice, which is exactly
the class of guess this project has been removing. It needs the shader BODY translated
(`tools/meshes/dxbc_to_glsl.py`), not just its resource table.

---

## 7. The `mask` decision, verified against the shipped decal shader

§2 decided `parkingLines01` was a coverage mask from its pixel statistics. That decision can now be
checked against BF3's own code. `dump_shader_solutions levels/mp_001/mp_001/shaderdb
MP001_RoadLinesWhite_3D <dir>` yields one permutation; `tools/meshes/dxbc_to_glsl.py` translates it
completely (52 of 52 instructions). Its resource table:

    bind texture   texture_outdoorLightSkyEnvmap   register 1
    bind texture   texture_Texture2                register 2   <- parkingLines01   (from the shaderdb)
    bind texture   texture_heightfieldAtlas        register 3
    bind texture   texture_Texture5                register 4   <- parkingLines01_N
    outputs: SV_Target0 only

and the four lines that matter, verbatim from the translation:

    r0.x = texture(t2, (v3.xyxx).xy);                    // ONE channel, into a scalar
    r2.xyz = r0.xxxx * vec4(0.774, 0.562, 0.134, 0);     // that scalar times a constant TINT
    r0.x = r0.x * v1.w;                                  // times the per-vertex weight
    o0.xyz = r0.xxxx * r0.yzwy;
    o0.w   = r0.x;                                       // and it IS the output alpha

Four things are confirmed outright, from the game rather than from statistics:

1. **The texture is read as a scalar, never as albedo.** The sample lands in a single component.
   Painting its RGB as colour -- which is what produced the iridescent stripe -- is not something
   the engine ever does.
2. **The output colour is the LIGHTING, not the texture.** `r1.xyz` is an interpolation of
   `outdoorLightTopColor` and `outdoorLightBottomColor` plus a sky-envmap term; the texture only
   scales it. `TerrainDecals.ts` keeping `diffuseColor.rgb` at the material colour and letting
   three light it is the same shape.
3. **The per-vertex weight multiplies the coverage** (`r0.x * v1.w`) and the product is the output
   alpha. That is exactly `diffuseColor.a *= coverage * vDecalFade`, and it independently confirms
   that the `UserMasks` half-floats are a blend weight rather than anything else.
4. **One render target, and the constants are `outdoorLight*`.** A decal is drawn in a forward,
   blended pass doing its own lighting -- not into the terrain's four-target G-buffer. So
   `transparent: true, depthWrite: false` compositing over the ground is the right pass, and
   alpha-TESTING it would have been wrong.

The vertex shader's `externalConstants` are `heightmapDecalOffsetY` and `worldToVirtualTextureUv`.
The engine has a named constant for precisely the small Y lift that `LIFT` approximates -- the
mechanism is real, only the value is ours.

### Two places where we differ from the shipped shader, both recorded rather than fixed

* **Coverage channel.** The shader reads ONE channel; we use the mean of RGB. On this texture the
  three channels are the same line with independent compression noise, so the mean is a denoised
  estimate of the channel the shader picks -- defensible, and arguably better-looking, but it is a
  difference and should be called one.
* **Albedo tint.** The shader multiplies coverage by a constant `vec4(0.774, 0.562, 0.134)` -- a
  sandy cream, not white -- applied consistently to both the envmap and the coverage term, so it is
  the decal's albedo. We draw the markings white. Using the real tint means translating each decal
  shader and lifting that immediate into the payload; the constant above is the value for
  `MP001_RoadLinesWhite_3D` specifically. That is a clean, bounded next step and it is not done.

---

## Disproved hypotheses, recorded so they are not tried again

* **"Foliage is black because three's DDSLoader drops DXT1 punch-through alpha."** Plausible — three
  reports DXT1 as `RGB_S3TC_DXT1_Format` (33776) unconditionally, and transparent texels decode as
  black. Measured across all 1411 cached DDS files with the strict test (`color0 < color1` **and** a
  texel actually using index 3): **zero** textures use punch-through. A weaker `color0 <= color1`
  test claims 647 of them, but that includes every solid-colour block, where `c0 == c1`. The real
  cause was the subset order (§3).

* **"Terrain normals are washed out by ambient light."** Measured by removing the environment and
  dropping the hemisphere light to 0.05: normals still changed 0.0% of pixels. That test was
  worthless and I should have checked before believing it -- it rendered the ground at luminance
  **2.1**, i.e. black, so there was nothing left to change.

* **"The sun is being zeroed by a broken shadow matrix."** My own conclusion, drawn from a large and
  self-consistent set of real measurements, and wrong. See section 5: both test cameras sat on
  genuinely occluded ground, and a direct probe of the shadow lookup shows it returning LIT on open
  ground and SHADOWED only where a raycast toward the sun actually finds occluders.

---

## Not attempted

* **Terrain mesh scattering.** Confirmed present: `dump_partition_json
  levels/mp_001/terrain/mp001_terrain/mp001_terrain` returns exactly six instances — one
  `TerrainData` and five `TerrainMeshScatteringType`. Every one of them dumps as `{"$type": ...}`
  and nothing else, so it is not only `TerrainData` that is a field-less stub in Rime's schema
  (`[ContainerType(4,12)] class TerrainData : Asset {}`) — `TerrainMeshScatteringType` has no
  fields either. Reading the mesh, density and per-cell build channels needs both schema classes
  written, guided by the EBX file's own TypeDescriptor/FieldDescriptor tables (`dump_ebx_layout`).
  Nothing short of that gets a single scattered instance out.

* **Destruction depth.** Confirmed present and intact — the terrain's raster tree slot 4 is
  `DestructionDepthTree`, declared 17186 bytes and 17186 read. Nothing decodes it yet; it would
  follow the same path as the material tree in `DumpTerrainNodesCommand`.

* **The TerrainMaskTree** (slot 1, 1353895 bytes declared and read) is still undecoded — Rime's
  parser consumes 39 bytes of it. It is the per-texel blend weights and is already plumbed through
  to the client as `maskNodes`.

---

## Where the code is

| what | where |
|---|---|
| `dump_terrain_decals_json` wrapper | `tools/meshes/mesh_server.py` — `Rime.terrain_decals` |
| decals payload, shader→texture, paint mode | `mesh_server.py` — `Meshes.decals`, `_decal_paint`, `_decal_shader_textures`, `_black_fraction` |
| endpoint | `GET /meshes/decals/<LEVEL>.json` |
| renderer | `WebUI/src/script/modules/TerrainDecals.ts` |
| wiring (baked decals preferred, ribbons as fallback) | `VEXTemulator.ts`, at the `RoadRibbons` call site |
| subset name-join | `MeshManager.ts` — `subsetOrder`, `token`, `said`, `textureFor(…, hint)` |
| BC5 classifier rule | `mesh_server.py` — `classify_pixels`, `CLASSIFIER_RULES = 4` |
