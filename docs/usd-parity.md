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

## Referenced vs shipped: the closure was doing both (2026-09-06)

The rule is embed if EDITED, reference if not. Meshes and textures follow it -- 527 mesh resources
and 639 of 640 textures come from the player's own install, the one exception being a flat normal
that is ours. The closure did not: it was referenced AND shipped in the same build, so the
references saved nothing.

    before   add_json_partition 12,114   reference_existing_partition 10,396
    after    add_json_partition  1,718   reference_existing_partition 10,396

The earlier measurement that forced the whole closure to ship ("shipping only the 171 named ones
died during entity creation") was taken when only those 171 blueprints were referenced and the rest
were resolvable from nothing. With all 10,396 referenced the duplicate copy is redundant --
*pending the load test*, which is the only thing that settles it.

Of the 1,718 that remain, 641 are ours (`dust2/...`: mesh partitions, MVDB, world parts) and 1,077
are our own EBX authored under the GAME's names for meshes and blueprints. Referencing those
instead was measured to make the engine reject the bundle, but that measurement predates the
closure being referenced, so it is worth re-running.

Checked before booting: 10,392 referenced against 1,718 emitted, **0 names in both** -- nothing
shadows, which is the one arrangement measured never to work.

## The whole game round trips, not just a level (2026-09-06)

A level's own partitions are a narrow slice of BF3 -- weapons, characters, vehicles, sounds and
voice-over live elsewhere -- so judging the pipeline on one level flatters it. Measured against the
full shipped closure with `tools/usd/partition_coverage_test.py`:

    corpus       10,396 partitions
    authored     211,765 instances across 802 types
    fields       776,004 compared, 0 changed
    instances    0 never authored
    RESULT       PASS

802 types is effectively everything a level pulls in. The first run reported 3 changed fields in
`DataSetNode` and `InstanceOutputNode`; those were the TEST aliasing instances, not the pipeline.
BF3 instance guids are PARTITION-SCOPED and recur across partitions, so indexing by guid alone let a
later prim overwrite an earlier one and three fields came back holding another instance's values --
which looks exactly like three lossy fields. Identity is `(partition, instance)`.

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
| Enlighten bake (probes, databases, systems) | base64 resources + probe points | mp_001 162 res / 377 KB, mp_007 156 / 240 KB, sp_valley 236 / 59.6 MB -- **0 changed** |

## Collision: byte-perfect when unedited (2026-09-06)

    MEHouse01Large    21,304 bytes   identical (preserved)   + edit guard PASS
    BigRadioTower     47,272 bytes   identical (preserved)   + edit guard PASS

The rule is the one the rest of the pipeline already runs on -- terrain emits only the nodes that
changed, meshes reference the player's install -- applied to collision: an unedited resource hands
back the game's own bytes rather than a rebuild. A rebuild can only approximate BF3's baker (object
order, padding and fixup layout are its choices), so regenerating data nobody touched would be
guessing where the real bytes are already in hand.

The digest that decides "unedited" quantises to **float32**, not to a fixed number of decimals: a
half-extent came back 1.011325 against 1.011324, which is one float32 seen through a double, not an
edit.

A preservation test that always preserves proves nothing, so the test also moves a shape and asserts
the original is REFUSED. Both resources pass both halves.

**Still open:** the rebuild path. Our packfile holds 81 objects against the game's 120, so editing
collision produces a correct resource, not BF3's bytes.

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

## Enlighten now round trips (2026-09-06)

A level's global illumination was the last big category the export named and did not carry. It is
not in EBX at all: it is a set of resources -- one `EnlightenDatabase` naming its systems and probe
sets, one `EnlightenProbeSet` each, a `StaticEnlightenDatabase` of baked coefficients, an
`EnlightenShaderDatabase` of per-material colours, and on one level `EnlightenSystem` resources
holding Enlighten's own radiosity data. Across BF3: 7095 probe sets, 72 databases, 72 static
databases, 49 shader databases -- the 7288 Rime already re-encoded byte-exactly -- plus 136
`EnlightenSystem`.

`tools/usd/enlighten.py` authors all of it under `/World/Enlighten`, and
`tools/usd/enlighten_roundtrip_test.py` compares DECODED payload bytes:

    mp_001     162 resource(s)     377,036 bytes    0 changed    162/162 reencode exact
    mp_007     156 resource(s)     240,382 bytes    0 changed    156/156 reencode exact
    sp_valley  236 resource(s)  62,538,770 bytes    0 changed    100/100 reencode exact

Payloads are carried verbatim on purpose, not as a fallback. An Enlighten bake describes light for
the geometry that was there when it was computed, so nothing downstream can regenerate one; a tool
that re-derived it would be inventing lighting the game never had. The parsed header rides along
whole in `customData` rather than as a hundred typed attributes, because it is name lists, lightmap
instances and material tables -- and a per-field translation silently drops whatever Rime has not
been taught to name yet.

Two things are authored as geometry so the bake is visible rather than a number in a header:
probe positions as guide-purpose `UsdGeom.Points` (mp_001 573, mp_007 164, sp_valley 1206, all
exact), and each lightmap instance at its transform's translation (1458 / 591 / 148). The instances
are the record that binds one baked lightmap to one placed object; seeing them is what makes "a
bake cannot survive an edit to the geometry" concrete instead of a claim.

Three measurements worth keeping:

- **Probe positions are not the probe count.** mp_001's database reports 2707 probes, but only 38
  of its 159 probe sets ship any positions at all -- 573 in total. The rest carry only the
  indirection grid. A check that compared points to `probeCount` would fail on every level in the
  game while nothing was wrong.
- **All 136 `EnlightenSystem` resources in BF3 belong to sp_valley**, and they are 50.7 MB of that
  level's 62.5 MB. Nothing in Rime decodes them, so they carry payload and no fields. A dump
  restricted to the four types that DO parse would have dropped 80% of sp_valley's Enlighten bytes
  while truthfully reporting 100/100 re-encoded exactly -- the same shape of trap as a level that
  loads because it emitted nothing.
- **sp_valley ships two `EnlightenDatabase` resources**, not one, so "the level's database" is a
  list. Anything keyed on there being exactly one is wrong on the first sub-levelled map it meets.

The new Rime command is `dump_level_enlighten <level> <dest.json>` (`7b6f6de3`). It exists because
the per-resource `dump_enlighten` cannot be driven from outside: probe-set names are discoverable
only from the database's own `probeSetNames`, so a caller has to have mounted and read before it can
ask for them. One mount now answers the whole level.

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
4. **Havok: byte-perfect UNEDITED; an edited shape rebuilds and is not BF3's bake.** Rime reads the
   shapes, planes and Frostbite wrapper, and an untouched resource now hands back the game's own
   bytes -- MEHouse01Large 21,304 and BigRadioTower 47,272, **identical**, with a guard proving a
   moved shape refuses preservation and forces a rebuild. What is NOT solved is the rebuild itself:
   our packfile holds 81 objects against the game's 120, so an EDITED collision resource is correct
   but not byte-identical to what BF3 would bake. Reproducing the packfile exactly (object order,
   padding, fixups, and the object types we do not model) is the remaining work.

5. **Ant clips carry indexed joints** (`dof037`). Values are exact; names need
   `AntAnimationSetAsset` -> `SkeletonAsset` + actor channel maps resolved.
6. ~~**Enlighten** probe data referenced, not authored.~~ **DONE 2026-09-06** (above): every
   Enlighten resource a level ships is authored into USD and round trips with 0 changed bytes on
   three levels. What is NOT done is re-baking: the data is carried, never recomputed, so a level
   whose geometry is edited keeps lighting for the geometry it used to have. That is a limit of the
   format, not of the carrier -- nothing outside Enlighten itself can bake it -- but it means an
   edited level's GI is stale rather than wrong-and-detectable.
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
