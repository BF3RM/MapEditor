# BF3 <-> USD parity: living status

What round-trips today, what does not, and the measurement behind each claim. Every number here
came from a run; anything unmeasured says so. Updated as work lands.

Last updated: 2026-09-06.

## The closure is editable, not just shipped (2026-09-06)

A level export that stops at the level's own partitions exports a fraction of what the level IS.
MP_001 owns 490; the closure it pulls in is 10,396 -- the weapons, soldiers, vehicles, sounds and
voice-over it cannot run without. Those already shipped, so they travelled with a mod either way;
what they could not do was be EDITED.

    closure      10,396 partition(s), 211,765 instance(s), 802 type(s)
    read back    211,765 prim(s) under /World/Library
    fields       776,004 compared, 0 changed
    instances    0 never authored
    names        10,396 partition name(s) carried
    stage        243 MB

Authored under `/World/Library` rather than into the level's world: a soldier blueprint is an asset
the level draws on, not something placed somewhere, and putting it in the spatial hierarchy would
say it was.

**Edits go back.** A closure partition the stage changed now ships with the change applied, on the
same rule the level's own entities follow -- only records that actually differ, so an unedited
closure rewrites nothing. Verified end to end at the stage layer: an `EmitterTemplateData` field
edited 4.0 -> 11.5 in USD comes back as 11.5 keyed to its partition
(`tools/usd/closure_edit_test.py`). One wrinkle worth keeping: the closure is authored under its
guid FILE name and ships under its partition NAME, so the writeback looks under both -- keyed on one
alone, an edit to a weapon silently never lands.

**Verified end to end, into a running game.** A combined level+closure stage (66.6 MB) with one
edited emitter field: emitted, built, booted.

    build   bundles=8  errors=1 (the known rugpile_01_n)  sb=55,050,624
    boot    Level:Loaded

Getting there cost two fixes, both the same root cause -- once the closure is authored into the
stage, `stage_entities` stops meaning "this level's entities":

- **Asset referencing went global.** The emitter referenced every `SoundWaveAsset` it could see --
  tank cannons, sniper layers -- 2,629 resources instead of 1,166, and 992 of them do not resolve.
- **Closure reference objects were copied into our world parts.** That is the arrangement this
  document already records as fatal, and it failed exactly as recorded: the load reaches "Creating
  entities for autoloaded sublevels" and the process exits.

Both are fixed by the same rule: only partitions the LEVEL owns are the level's. The closure is a
library, and its assets resolve from the game's own bundles.

The earlier stage-layer result:

    closure   1 partition(s) rewritten with edits from the stage
    closure   10396 partition(s): 10396 shipped, 0 referenced
    FOUND     DistanceScaleFarValue = 11.5 in
              clo_fx_impacts_metal_emitter_m_em_impact_metal_sparks_01_m.json

Exactly one partition rewritten out of 10,396 -- the rule holds under a real emit, not just in
principle. The level's own 490 partitions and the closure's 10,396 are DISJOINT (measured: 0 in
both), so nothing is authored twice and two prims cannot hold conflicting edits for one instance.

## Are we at 100%? (2026-09-06, updated)

**Complete and measured:**

| | evidence |
|---|---|
| USD representation, whole game | 10,396 partitions, 211,765 instances, 802 types, 776,004 fields, **0 changed** |
| Closure editable end to end | edit -> emit -> build -> **Level:Loaded**, 1 of 10,396 partitions rewritten |
| Level graph, all 49 levels | 558,864 instances, 0 authored twice, 23,526,728 fields, **0 changed** |
| Enlighten | 0 changed across three levels |
| Terrain heights | byte-exact; untouched terrain emits 0 changed nodes |
| Terrain rasters, layers, scattering | 0 changed |
| Collision, unedited | byte-identical, with an edit guard |
| Emitters and scattering | visible GUIDE geometry; 209 markers, 0 that render |
| Art referencing | 527 meshes + 639/640 textures from the player's install; 55 MB; loads |

**Native USD forms:** lights `UsdLux` (Distant/Sphere/Disk + ShapingAPI), physics `UsdPhysics`,
audio `UsdMedia`, skinning `UsdSkel`, animation `UsdSkelAnimation`, roads `BasisCurves`, terrain and
decals real `Mesh`, scattering preview `PointInstancer`. Everything else is typed `bf3:` attributes
with the record in customData.

**Not complete:**

1. **Terrain's 7-layer splat has no USD form.** Layer 0 is bound as a material and the rest are
   carried; USD has no splat shader, and a faithful preview needs a custom one. The data is all
   there (mask, material tree, palette) -- what is missing is a way to LOOK at it blended.
2. **"0 changed" is not byte-perfect.** It measures USD fidelity, not our bytes against BF3's. Only
   terrain heights, the Havok wrapper and unedited collision are byte-verified against the game.
3. **Refs and nested records stay in customData**, so a reference between objects is not editable
   the way a scalar is.
4. **Edited collision rebuilds to 81 objects against the game's 120.**
5. **Shared object blueprints are not descended into** -- 403,352 instances (72%) stay filed by
   partition path rather than under the object that owns them. Deliberate: a prop used 60 times
   would give 60 prims writing back to one record and 59 edits would vanish.
6. **Update-in-place unproven**; Enlighten is not re-injected into a built bundle.
7. **1,077 partitions** under the game's namespaces are EBX we author rather than reference, and
   referencing partitions is measured to be impossible -- it inflates the superbundle 6x and breaks
   the load.

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

## A level that ships no original art (2026-09-06)

    build   bundles=8  errors=1 (the known rugpile_01_n)  sb=55,050,624
    boot    RESULT LOADED -- LoadingInfo: Running, Level:Loaded name=Levels/REALITYMOD/REALITYMOD

**297 MB -> 55 MB**, and it loads. 527 mesh resources and 639 of 640 textures come from the
player's own install; the single exception is a flat normal map that is ours. What remains in the
bundle is EBX -- the 10,396-partition closure plus 1,718 partitions we author -- and no pixels or
geometry of DICE's.

## Referenced vs shipped: the closure was doing both (2026-09-06)

The rule is embed if EDITED, reference if not. Meshes and textures follow it -- 527 mesh resources
and 639 of 640 textures come from the player's own install, the one exception being a flat normal
that is ours. The closure did not: it was referenced AND shipped in the same build, so the
references saved nothing.

    before   add_json_partition 12,114   reference_existing_partition 10,396
    after    add_json_partition  1,718   reference_existing_partition 10,396

**TESTED, AND IT FAILS.** With all 10,396 referenced and none shipped the build succeeds (its only
error is the known `rugpile_01_n`, a texture BF3 itself never shipped) and then the level dies during
load: 3 ticks, `Level:Loaded=0`, process gone. The superbundle also grew to **1,832,446,064 bytes**,
6x the shipped version, which is the tell -- `reference_existing_partition` is not a pointer. It
pulls the partition AND its resources into our superbundle, so referencing the closure costs more
than shipping it and breaks the load as well.

So the rule "embed if edited, reference if not" holds for RESOURCES (meshes, textures) and does NOT
hold for the closure's partitions. The closure must ship. `reference_closure=True` is kept only so
the experiment can be re-run against a future builder; the default stays off.

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
| Level graph (ownership) | `/World/Level`, world parts own their objects | 49/49 levels; 151,362 owned objects = 151,362 in the EBX; **0 changed** over 23,526,728 fields |
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

## The scene graph is now the level graph (2026-09-06)

Entities nested by partition path, which made a level browsable and left it structurally wrong. A
partition is a FILE; a world part is a CONTAINER, and the two are not the same thing -- so a
`WorldPartData` prim's children were "other instances that happen to live in the same file", you
could not select a layer and get the layer, and the meshes were not in the tree at all. They sat
in a flat `/World/<mesh>/inst_N` list beside it, which meant the geometry and the EBX record that
places it were two separate things a DCC could move independently and disagree about.

BF3 spells its own graph out in the EBX and nothing here had to be guessed:

    LevelData.Objects
      WorldPartReferenceObjectData -> Blueprint    -> a partition whose primary is a WorldPartData
      SubWorldReferenceObjectData  -> BundleName   -> a partition whose primary is a SubWorldData
        ReferenceObjectData        -> BlueprintTransform places an object blueprint

That is now the hierarchy: `/World/Level` is the LevelData, each reference object owns the
blueprint it points at, and each `WorldPartData` owns the objects its `Objects` list names.
`tools/usd/level_graph_roundtrip_test.py`, run over all 49 levels:

    instances       558,864 authored of 558,864, 0 authored twice
    in the graph    155,512 (27.8%), up to 7 containers deep
    containers      151,362 owned objects against 151,362 named by the EBX's own Objects lists
    reference objs  4,103 structural, 4,101 own their blueprint
    placements      55,658 of 334,367 (16.6%) now sit under the object that places them,
                    all 55,658 at the transform they were dumped with, to the bit
    round trip      23,526,728 fields compared, 0 changed

mp_001 alone: 3,566 of its 14,033 instances owned, 5 deep, 1,297 of 6,525 placements anchored,
594,912 fields compared, 0 changed. The prims read like the level did -- `o000_layer0_default`,
`o004_layer4_buildings`, `o005_squad_deathmatch`, and inside a layer `o003_acunit_01_Mesh`.

**No regression, measured against the same run on HEAD before the change:** `level_roundtrip_test`
534/534 prototypes byte-identical and 534/570 placement sets preserved, both before and after;
`import_level_usd --verify` 78,300 floats compared, largest disagreement `0.000000000`, EXACT,
both before and after; `level_entities.read` 14,033 records / 594,912 fields / 0 changed, both
before and after. Same numbers, different tree.

Three things this turned up, all measured:

- **A placement can only be anchored on an EXACT transform match.** `placements.json` is the
  ENGINE's flattened list, so the link back to the reference object that produced it is the
  transform and nothing else. Matching to 1e-9 found 71 more on mp_001 than exact equality did,
  and every one would have parked a mesh on a transform that is not bit-identical to the dumped
  one -- which is the only thing the placement round trip measures. Exact it is; of mp_001's 1,297,
  8 land on a transform more than one reference object shares.
- **The read-back had to become LOCAL.** With Scopes for parents, local and local-to-world were
  the same matrix; with a world part as a real parent they are not, and writing the world
  transform back would fold the owner's placement into every child on every trip. It is a no-op
  today -- **0 of 4,103** world-part and sub-world reference objects across the 49 levels carries a
  non-identity `BlueprintTransform` -- but that is a fact about BF3's data, not about the code.
- **A USD prim name cannot start with a digit.** `AppendChild('000_layer0_default')` returns the
  EMPTY path with no error, and the failure surfaces hundreds of prims later as "Path must be an
  absolute path: <>". Names are `o000_...`.

Two honest limits:

- **Shared object blueprints are not descended into.** A prop used sixty times would be authored
  sixty times, sixty prims writing back to one EBX record, and fifty-nine edits would vanish with
  nothing reported. So 403,352 instances -- the contents of those blueprints -- are still filed by
  partition path under `/World/Entities`, and the 278,709 placements whose mesh is inside one stay
  in the flat per-mesh groups. Both are found by the same key (`bf3:mesh` on the placement prim),
  so nothing is lost; it is the tree that is incomplete, and completing it needs the
  `objects/`/`props/` EBX this corpus does not have.
- **mp_subway names two sub-worlds that are not there** -- `Levels/MP_Subway/ART_PC_only` and
  `Levels/MP_Subway/Conquest_Large`. That is the entire gap behind 4,101 of 4,103, and it is the
  data, not the resolver.

One unrelated bug fell out of running the exporter from a shell: `export_level_usd.py`'s CLI
passed its options POSITIONALLY into a signature they no longer matched, so `--ebx-dir` landed on
`scattering_path` and `--scattering` on `parts_list`. It now passes by keyword.

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

2. ~~**USD scene graph is still not the level graph.**~~ **DONE 2026-09-06** for the level's own
   structure (section above). What is still filed by partition path is the 72% of instances that
   live inside SHARED object blueprints, and with them the 83% of placements whose mesh is inside
   one. Those are not the level's to own -- the honest fix is to author each blueprint ONCE under
   its own scope and have the reference objects point at it the way a mesh prototype is pointed
   at, which needs the object-blueprint EBX (`objects/`, `props/`) dumped; the corpus here holds
   only `levels/`.
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
