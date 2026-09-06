# BF3 <-> USD parity: living status

What round-trips today, what does not, and the measurement behind each claim. Every number here
came from a run; anything unmeasured says so. Updated as work lands.

Last updated: 2026-09-06.

## The one-line state

**The complete configuration loads.** mp_003: 53,121,744 bytes, 0 errors, 0 unresolved, 35/35 world
parts live in the engine, full 10396-partition closure shipped, objects reaching the level through
BF3's OWN world parts. Terrain's painted detail (below) is the remaining category.

## Where the completeness gap actually is (measured 2026-09-06)

Three configurations, same level (mp_003), same corpus:

| configuration | content | verdict |
|---|---|---|
| reduced (self-contained types only) | 660 instances | LOADED |
| full closure, reference objects NOT authored | 10396 partitions, 53 MB | LOADED, 0 errors, 35/35 |
| full closure + every reference object COPIED into our world part | 3609 instances | **EXITED** in entity creation |
| full closure + the level's OWN world parts, copies dropped | 32 real world parts + 660 ours | **LOADED**, 0 errors, 35/35 |

The closure is harmless. What the engine refuses is **a copy of the level's ReferenceObjectData
inside a world part we invented**. Pointing our sub-level at the level's own
`WorldPartReferenceObjectData` instead -- their `WorldPartData` partitions ship with the closure --
instantiates the arrangement BF3 itself bakes, and 2949 duplicates simply stop being emitted.

## Coverage

| | status | evidence |
|---|---|---|
| Placements | 334,367 across 49 levels | after the sub-world fix; was 223,739 (+1.5x) |
| Levels loading | 46/49 | 3 correctly FAIL as zero-geometry, not passed |
| Meshes / textures | referenced from the player's install | bundle 297 MB -> 7 MB (41x); ships no original art |
| Entity fields, all 440 types | typed USD attributes | 35,298 authored; round trip **0 changed fields** |
| Skinned meshes | UsdSkel | 535/535 byte-identical, 1632/1632 chunks |
| Animation clips | UsdSkelAnimation | 8,136/8,136 channels identical |
| AnimTrackData | time samples + Bezier | 1484/1484 byte-exact |
| Collision | UsdPhysics prims -> HavokPhysicsData | decodes valid: both packfiles, hkpBoxShape/hkpConvexTranslateShape |
| Audio headers | BitWriter + SndPlayer/Chunk serialize | round trip lossless (plain/looping/stream) |
| Lights, volumes, triggers, areas | UsdLux / boxes | ~2000 area+trigger volumes now visible |
| Terrain rasters (mask/material/destruction) | base64 node blocks | mp_001 344 nodes, 2.6 MB, **0 changed**; header 15 fields 0 changed |
| Terrain layer palette + draws | typed prims | mp_001 7/128, mp_007 10/184, sp_valley 10/234 -- **0 changed** |
| Terrain mesh scattering | typed prims per type | MP_007 23 / SP_Valley 22 / MP_001 5 types; 598+572+130 fields, **0 changed** |
| Terrain heights, editable | per-node meshes | untouched: **0** changed nodes; 499,230 samples, worst deviation **0**; one edit -> 1 node, bytes exact |

## Collision can now be read, not only written (2026-09-06)

    BigRadioTower     35 shapes (26 box, 9 convex)   537 values   0 changed
    MEHouse01Large    39 shapes (38 box, 1 convex)   265 values   0 changed

The tower's boxes reach 27 m half-extent over centres spanning 0-33 m; the house tops out at 7.65 m
and 4.5 m. A tower reading as a tower is the check that these are geometry rather than plausible
noise.

Two things this turned up, both invisible until real game data went through:

- **Havok's planes are POST-radius.** They describe the hull after the convex radius inflates it, so
  no vertex lies on any plane: measured 0 vertices at 1e-3 and 3-5 at 1e-2 against a radius of
  0.0085. Fed back raw they match nothing.
- **`convex_layout.faces` used eps=1e-3, which is too tight for the game's own float32 hulls.** Two
  radio-tower hulls came back with 11 of their 12 planes -- silently rounding a face off a shape BF3
  ships. Across 1e-3 .. 2e-2 the kept count is 11 at 1e-3 and a stable 12 from 3e-3 up; a plateau
  that wide says 12 is the true count. Default is now 5e-3.

**This is not yet a 1:1 BF3 -> USD -> BF3 trip.** The rebuild-and-compare-bytes leg is unwritten,
and that is the only evidence that would justify the claim.

## Terrain rasters and layer palette (2026-09-06)

`SingleTerrainLayerData` (268) and the mask/material/destruction trees (33 each) were bare EBX
markers with their data in resources, so a level kept its heights and forgot what the ground was
MADE of.

    mp_001    344 raster nodes, 2.6 MB, 0 changed; tree header 15 fields, 0 changed
    layers    mp_001 7/128 draws, mp_007 10/184, sp_valley 10/234 -- 0 changed

Rasters are base64 sample blocks rather than images, deliberately: a mask node is a quadtree cell at
its own resolution (66/side against 256 material, 133 destruction), so one flattened picture is the
lossy trap the heightfield already taught us. Editable painting is listed above as still open.

Two identity traps worth keeping, both measured:

- Mask nodes are **not** identified by `(level, indexX, indexY)` -- 307 nodes over 6 distinct cells,
  up to 88 sharing one. Naming by the triple collapsed 307 prims into 6, and the round trip caught
  it only because it counts what came back. Ordinal is the identity.
- Raster nodes carry **2D** bounds (`[x, z]`); the heightfield carries 3D. A fixed `Vec3f` drops or
  invents a component, so bounds are float arrays.

## Terrain mesh scattering now round trips (2026-09-06)

EBX carries none of it: `TerrainMeshScatteringType` is a bare DataContainer with no fields, so a
level could export and come back with its grass gone while every check passed. The parameters live
per-layer in the VisualTerrain resource.

Rime could read them and no further: every field past `RandomPositionOffset` was private,
`Serialize` threw, and `VisualTerrainInfo` carried nothing about scattering. That is fixed in Rime
(`3180763c`), and `tools/usd/scattering.py` authors each type as a prim with all 26 fields as typed
`bf3:` attributes -- deliberately NOT a PointInstancer, since scattering is procedural and explicit
instances would invent data the game never stored.

    MP_007     23 types over 10 layers   598 fields   0 changed
    SP_Valley  22 types                  572 fields   0 changed
    MP_001      5 types                  130 fields   0 changed

MP_001's 5 is exactly its count of `TerrainMeshScatteringType` markers in EBX -- an independent
check that the parse is right rather than merely self-consistent.

**The trap this hid behind, worth remembering:** the first run reported 0 types on EVERY level
including Caspian Border. That was not the format -- `RimeLib.*.Frostbite2_0` assemblies load at
runtime and are NOT referenced by RimeREPL, so building the REPL alone left the reader STALE while
the interface change in `RimeLib.Terrain` went through. A present-but-empty field reads exactly like
"this level has none", and cost a full byte-level reverse-engineering pass that only proved Rime's
existing layout was already correct.

## Terrain heights round-trip byte-exact (2026-09-06)

The composite at `/World/Terrain` is a VIEW. Editing it could never be lossless: composite -> node
grid needs a resample, and a resample changes samples nobody touched, so an untouched terrain came
back "edited" and would rewrite trees the game ships.

Each node is now authored as its own mesh (`/World/TerrainNodes/node_<d>_<x>_<y>`, `guide` purpose)
at its own interior size -- 129x129 of BF3's 133 grid, 2-sample skirt -- with `Y = sample *
worldScaleY`. That is a pure scale, so the inverse recovers the stored integer exactly.

`tools/usd/terrain_roundtrip_test.py`, on mp_001:

    export       30 node mesh(es) authored
    untouched    0 changed node(s)                    PASS
    samples      499230 checked, worst deviation 0    PASS
    one edit     1 changed node(s)                    PASS
    edited bytes PASS (0 sample(s) differ from expectation)

One correctness fix went with it: the writeback used `astype('<u2')`, which TRUNCATES, so a float32
divide landing on 12344.9999 read as 12344 and an untouched sample reported as an edit. It rounds
now -- that is what makes "unedited terrain emits nothing" true rather than nearly true.

## Open

1. ~~**TERRAIN'S PAINTED DETAIL.**~~ **DONE 2026-09-06.** Heights (byte-exact), mesh scattering,
   the mask/material/destruction rasters and the layer palette with its combination draws all round
   trip on real game data. What is carried is not yet all *editable*: the rasters are preserved
   byte-for-byte but cannot be painted in a DCC, which needs the per-node story heights now have.
   `TerrainColorTree` has nothing to author on mp_001 -- the resource's own slot table reads
   `slot2=null` -- so it is unverified rather than done, and wants a level that populates it.

2. **USD scene graph is still not the level graph.** Entities nest by partition path, which is
   browsable, but a `WorldPartData` prim does not own its objects and mesh placements sit outside
   the hierarchy entirely.
3. **No completed 49-level sweep against the corrected (post-sub-world) data.**
4. **Havok: extraction works, the BYTE round trip is not proven yet.** Rime now reads
   `hkpBoxShape`, `hkpConvexVerticesShape` and the `hkpConvexTranslateShape` that places them,
   including the hull PLANES (`927a9370`), and `dump_collision_shapes` writes them as JSON. Game
   shapes -> USD -> descriptors is verified: BigRadioTower 537 values and MEHouse01Large 265, **0
   changed**. What is NOT done is the leg that matters most -- descriptors -> rebuilt
   HavokPhysicsData -> **compare bytes against the original resource**. Until that runs, "collision
   round trips" means representation is lossless, not that BF3 would bake the same file.

5. **Ant clips carry indexed joints** (`dof037`). Values are exact; names need
   `AntAnimationSetAsset` -> `SkeletonAsset` + actor channel maps resolved.
6. **Enlighten** probe data referenced, not authored.
7. **Update-in-place** unproven. **No equivalence check** against BF3's own bake.

## Not blockers (corrected)

- **Havok MOPP** -- only needed for large mesh shapes; boxes and convex hulls do not use one, and
  `tools/havok/build_collision.py` writes the resource without the SDK, byte-verified.
- **XAS audio encoder** -- already exists (`Xas1.EncodeBlock`). The missing piece was a `BitWriter`.
- **EA Layer3 headers** -- BF3 ships 100% XaSeekable1, so they are off its path entirely.
- **`objects/rugpile_01/rugpile_01_n`** -- does not exist in BF3 (`where_is` -> `found: false`).
  The game's own MVDB binds a texture that was never shipped; the warning is correct.

## Traps that cost real time here

- A level that emits NOTHING loads perfectly. Guard on content, never on the verdict. Four separate
  variants were hit: zero textures, zero meshes, zero placements, zero entities.
- `add_existing_resource` failure prints `Could not find resource (...)` -- no "error", no
  "exception". A build-log error grep must include it.
- A crashed build leaves the PREVIOUS level's `.sb`; booting then measures that. Assert the
  superbundle was rebuilt.
- Scope process checks to your own PID, and assert `ModList.txt` every run.
