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
| Terrain heights, editable | per-node meshes | untouched: **0** changed nodes; 499,230 samples, worst deviation **0**; one edit -> 1 node, bytes exact |

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

1. **TERRAIN'S PAINTED DETAIL IS NOT AUTHORED.** (Heights are done -- see below. This is the
   painted/scattered layer on top of them.) Audited 2026-09-06: 9 types are pure MARKERS
   carrying no fields at all (1897 instances) -- their data lives in resources, so a round-tripping
   instance proves nothing. `TerrainMeshScatteringType` (490), `SingleTerrainLayerData` (268),
   `TerrainColorTree`/`MaskTree`/`MaterialTree`/`DestructionDepthTree` (33 each),
   `EventSyncEntityData` (982). Rime already READS AND WRITES the terrain trees (33/33 x 5
   byte-exact) and models scattering (`MeshScatteringType`: MeshName, Density, LockDensity,
   RandomPositionOffset) -- so this is authoring into USD, not reversing.
2. **USD scene graph is still not the level graph.** Entities nest by partition path, which is
   browsable, but a `WorldPartData` prim does not own its objects and mesh placements sit outside
   the hierarchy entirely.
3. **No completed 49-level sweep against the corrected (post-sub-world) data.**
4. **Havok is one-directional** -- collision can be authored, but the game's existing collision is
   not extracted into USD, so it cannot be edited. Needs half-extents out of `hkpBoxShape` and
   vertices out of `hkpConvexVerticesShape`; `dump_collision.read()` already resolves the graph.
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
