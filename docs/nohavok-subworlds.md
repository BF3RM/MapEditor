# How NoHavok structures its generated bundles

Research note. Everything below is either **VERIFIED** (read out of generator source, out of the
deployed `.sb` bytes, or out of the Venice-EBX dump of stock BF3 data) or **INFERRED** (reasoning
about engine behaviour that was *not* observed at runtime). Every claim carries a `file:line` or a
data path.

Sources used:

| What | Where |
| --- | --- |
| Generator source | `BF3RM/NoHavokGen` (`ebx_json.py`, `bundles.py`, `templates/`) |
| Deployed mod | `Admin/Mods/NoHavok/` — `mod.json`, `sb/Win32/NoHavok/<MAP>/<MAP>.sb`, `ext/Shared/__init__.lua` |
| Type definitions | Rime, `RimeLib.Serialization.Frostbite2_0/fb/*.cs` |
| Stock BF3 data | `Venice-EBX` text dumps, `Levels/MP_001/` |
| Comparison | `LevelLoaderGen/ebx_json.py` |

---

## 1. Direct answer: one SubWorld, many WorldParts — grouped by asset type, not by space

**VERIFIED.** Per map, NoHavokGen emits exactly **one partition**, containing exactly **one
`SubWorldData`**, which contains **N `WorldPartData`** — one per `StaticModelGroupMemberData`, i.e.
one per *unique source blueprint*. Every instance of that blueprint in the whole map, wherever it
physically sits, goes into that one WorldPart.

```
LevelData (vanilla, patched at runtime)
└── SubWorldReferenceObjectData          <- injected by ext/Shared/__init__.lua:49
    └── SubWorldData  "NoHavok_MP_001"   <- exactly 1
        ├── WorldPartReferenceObjectData -> WorldPartData "Props/StreetProps/CartHand_01_Group"
        │      ├── ReferenceObjectData   (instance 0)
        │      ├── ReferenceObjectData   (instance 1)
        │      └── ...                                     <- all CartHand_01s, map-wide
        ├── WorldPartReferenceObjectData -> WorldPartData "Objects/ConcreteWall_02_Group"
        │      └── ...
        └── ... 379 more WorldParts (MP_001)
```

So the hypothesis *"everything is at depth 0 so all siblings render"* is **literally refuted** — the
objects sit at depth 2 (SubWorld → WorldPart → ROD), and there are hundreds of WorldParts, not one.

But the spirit of the hypothesis survives in a different shape, and it is worth being precise about
why: **the grouping is by asset type, so every WorldPart's spatial extent is the whole map.** A
WorldPart is the worst possible bounding volume — 381 containers that all overlap each other and all
cover the entire level. *However*, see §3: vanilla WorldParts are not spatial either, and §4:
`WorldPartData` carries no bounds field at all, so nothing in the engine was ever going to cull on
this boundary. The container shape is **not** the regression. §6 has what actually is.

### Verified counts

**VERIFIED** — MP_001, cross-checked three independent ways:

| Thing | Count | How verified |
| --- | --- | --- |
| Partitions in the superbundle | 1 (`nohavok/mp_001/mp_001`) | `strings -n 6 sb/Win32/NoHavok/MP_001/MP_001.sb \| grep nohavok/` → 1 hit |
| `SubWorldData` | 1 (`NoHavok_MP_001`) | same `strings` output; `ebx_json.py:265` calls `CreateInitialPartitionStruct` once per level |
| `WorldPartData` | **381** | `strings … \| grep -c '_Group$'` → 381 (names are `<blueprint>_Group`, set at `ebx_json.py:117`) |
| `ReferenceObjectData` | **3646** | see below |
| Source `StaticModelGroupMemberData` in vanilla | **381** | `grep -c '::StaticModelGroupMemberData' Venice-EBX/Levels/MP_001/MP_001.txt` |
| Sum of vanilla `InstanceCount` | **3646** | `grep -oP '(?<=InstanceCount )\d+' … \| awk '{s+=$1}END{print s}'` |

The 3646 figure is not an estimate. NoHavokGen derives every instance GUID deterministically
(`ebx_json.py:166`):

```python
reference_object_data_guid = str(uuid.uuid3(og_partition_uuid, member_data['MemberType']['InstanceGuid'] + str(i)))
```

Recomputing all 3646 of those UUIDs from the vanilla dump (namespace = the vanilla level's partition
GUID `8F5E0383-52A4-11DF-AC80-BC6EA2597601`, name = lowercase member GUID + index) and searching the
deployed `MP_001.sb` for their little-endian byte encodings finds **3646 / 3646 present, across
381 / 381 members**. The container GUIDs (`uuid3(og, 'partition' | 'subworlddata' | 'descriptor' |
'registry')`, `ebx_json.py:74-79`) are likewise all present exactly once. Nothing is dropped for this
map by the invalid-scale skip path at `ebx_json.py:209-210`.

Distribution across the 381 WorldParts (**VERIFIED**, from vanilla `InstanceCount`): min 1, max 181
(`Architecture/Me_Storefronts`), mean 9.6, median 4. **101 of the 381 WorldParts contain a single
object.** So the "grouping" layer is mostly overhead: a quarter of the WorldParts group nothing.

### Every map

**VERIFIED** — `WorldPartData` count per deployed superbundle (`grep -c '_Group$'` over each `.sb`):

```
MP_Subway 499   XP2_Palace 401   XP2_Office 388   MP_001    381   XP2_Factory 359
XP4_Rubble 347  XP4_Parl   341   XP4_Quake  339   XP1_001   328   MP_011      292
XP4_FD    291   MP_017     285   XP1_003    261   XP1_002   251   COOP_007    233
MP_013    232   XP2_Skybar 218   MP_003     211   XP5_003   179   XP3_Valley  178
XP3_Desert 177  MP_018     175   MP_012     174   XP5_002   173   XP5_001     172
MP_007    170   XP5_004    156   XP3_Shield 135   XP1_004   135   XP3_Alborz  101
COOP_006   69   COOP_003    30   SP_Tank_b   10   COOP_009    8   SP_Earthquake 7
COOP_010    6   SP_Bank      4   SP_Earthquake2 3 COOP_002    3   SP_Sniper    2
SP_Paris    2
```

Same shape everywhere: one SubWorld, N type-keyed WorldParts.

### One bundle per *map*, not per gamemode

**VERIFIED.** `ebx_json.py:291`:

```python
if path_array[1].lower() != path_array[2].lower():
    continue
```

`util.HavokNames.names` holds paths like `levels/mp_001/rush/staticmodelgroup_physics_win32`. This
guard drops every path whose level folder and partition name differ — i.e. **all gamemode subworlds
are skipped**, only the base `levels/<MAP>/<MAP>` static model group is processed. `bundles.py:29-49`
then makes one superbundle per map folder containing one bundle per emitted file, and there is only
ever one file per folder (`ebx_json.py:326-331`).

This matters: stock MP_001 has `StaticModelGroupEntityData` in six partitions, not one —
`MP_001.txt`, `Rush.txt`, `Team_Deathmatch.txt`, `Squad_Deathmatch.txt`, `Squad_Rush.txt`,
`Lightcasters.txt`. NoHavok converts only the first. The others are small (4/1/1/1/2 members;
14/20/3/23/51 instances) and are left as intact baked groups, because the runtime clear at
`ext/Shared/__init__.lua:117-122` is gated on `p_Partition.name == s_LevelPath:lower()`
(`__init__.lua:99`). **INFERRED:** those gamemode props therefore stay non-editable and keep their
baked havok — a known, minor blind spot.

---

## 2. Comparison with LevelLoaderGen

**VERIFIED.** `LevelLoaderGen/ebx_json.py:80-123` (`create_initial_partition_struct`) builds one
`SubWorldData` **and one `WorldPartData`** per generated partition, and `process_save_file` pushes
every object into that single `wpd['Objects']` list (`ebx_json.py:130-136`).

So LevelLoaderGen is genuinely flat: SubWorld → 1 WorldPart → all objects. NoHavokGen is *less* flat
than LevelLoaderGen, not more. If a "one big subworld" problem exists, LevelLoaderGen has the purer
version of it.

---

## 3. What vanilla does (the baseline)

**VERIFIED**, from `Venice-EBX/Levels/MP_001/`:

* The root partition `MP_001.txt` contains **34 `WorldPartReferenceObjectData`** and **8
  `SubWorldReferenceObjectData`** (the 8 name `Levels/MP_001/{Conquest, Conquest_Large, Rush,
  Team_Deathmatch, Squad_Deathmatch, Squad_Rush, TDM1, Lightcasters}` via `BundleName`).
* `Levels/MP_001/` holds 73 sibling `.txt` partitions; each contains **exactly one `WorldPartData`**
  (`grep -c '^WorldPartData ' *.txt` → 1 in every file that has one).
* Those WorldParts are named by **content category, not by region**: `StreetProps` (585 RODs),
  `Lights` (336), `Buildings` (317), `Roads` (71), `Trees` (60), `Bushes` (13), `Occluders`,
  `RainOccluders`, `TerrainDecals`, `Art_Above_Large`, `Art_Below_Large`, `Base1_US`, …
* Total plain `ReferenceObjectData` across every MP_001 partition: **1835**.

The important read: **`StreetProps` is one flat `WorldPartData` holding 585 objects scattered across
the entire map.** Vanilla does *not* subdivide world parts spatially either. DICE grouped by
department/discipline so artists could work in parallel, not so the renderer could cull.

So the answer to "is NoHavok's shape degenerate?" is: **no, not by the container-shape metric.**
Vanilla: 34 categorical WorldParts averaging ~54 objects. NoHavok: 381 type-keyed WorldParts
averaging ~10. Neither is spatial.

What *is* striking is the volume. NoHavok adds 3646 RODs to a level that natively has 1835 — it
roughly **triples the level's ReferenceObjectData count** (**VERIFIED** arithmetic on the two counts
above).

---

## 4. Spatial / culling metadata on the containers: there is none

**VERIFIED** from Rime's generated types. The full inheritance chain and every field:

* `WorldPartData : SpatialPrefabBlueprint` — `RimeLib.Serialization.Frostbite2_0/fb/WorldPartData.cs:21-31`.
  Adds only `HackToSolveRealTimeTweakingIssue` (GUID), `UseDeferredEntityCreation` (bool),
  `Enabled` (bool).
* `SubWorldData : SpatialPrefabBlueprint` — `fb/SubWorldData.cs:21-37`. Adds only `RegistryContainer`,
  `IsWin32SubLevel`, `IsXenonSubLevel`, `IsPs3SubLevel`, `RememberStateOnStreamOut`.
* `SpatialPrefabBlueprint` — `fb/SpatialPrefabBlueprint.cs:20-29`. **Declares no fields at all** — the body is a bare `Serialize` override.
* `PrefabBlueprint` — `fb/PrefabBlueprint.cs:22-26`. Declares only `RefArray<GameObjectData> Objects`.

**There is no bounding box, no extent, no radius, no LOD distance, no streaming distance, and no
visibility field anywhere on `SubWorldData` or `WorldPartData`.** This is not "left at defaults" —
the fields do not exist in the type. Nothing in the engine can cull on a WorldPart boundary because
the boundary is not expressed in the data.

Where culling metadata actually lives (**VERIFIED**):

* `fb/MeshAsset.cs:25-52` — `LodGroup`, `LodScale`, `CullScale`, `OccluderMeshEnable`,
  `OccluderHighPriority`, `StreamingEnable`. **Per mesh asset.**
* `fb/OccluderVolumeEntityData.cs` — MP_001 ships 56 of these in its `Occluders` WorldPart
  (`grep -c '^OccluderVolumeEntityData ' Occluders.txt` → 56), plus a `RainOccluders` part.

**INFERRED (strong):** Frostbite 2 culls per render object against the frustum and the occluder set,
using a runtime-built spatial structure, not against the authoring container hierarchy. The
authoring hierarchy is an *organisational* structure. That is why vanilla can afford a 585-object
`StreetProps` WorldPart spanning the map.

NoHavok's RODs reference the **original, unmodified** object blueprints (`ebx_json.py:176-177`):

```python
reference_object_data['Blueprint']['InstanceGuid'] = partition['PrimaryInstanceGuid']
reference_object_data['Blueprint']['PartitionGuid'] = partition['PartitionGuid']
```

so each instantiated object keeps its own `MeshAsset` with its own `LodScale` / `CullScale` /
occluder flags. **Per-object LOD and frustum culling are preserved.**

### `StreamRealm` is a red herring

**VERIFIED.** `templates/ReferenceObjectData.json` and `templates/WorldPartReferenceObjectData.json`
both set `"StreamRealm": 0`, which is `StreamRealm_None` (`fb/StreamRealm.cs`: `None=0, Client=1,
Both=2`). That looks alarming until you check vanilla: `StreetProps.txt` has **585/585 RODs at
`StreamRealm_None`**, and the MP_001 root has 38 `StreamRealm_None` vs 8 `StreamRealm_Both` — and the
8 `Both` are exactly the 8 `SubWorldReferenceObjectData`. NoHavok matches this precisely: its
injected SWROD is set to `StreamRealm.StreamRealm_Both` at `ext/Shared/__init__.lua:57`.

`StreamRealm` on NoHavok's data is **identical to vanilla's convention**. Not a regression. (I did
not determine the runtime meaning of `StreamRealm_None`; it does not matter here, because both sides
agree.)

### Load behaviour

**VERIFIED.** `ext/Shared/__init__.lua:61` sets `s_SWROD.autoLoad = true` and `:60` sets
`inclusionSettings = nil`. Vanilla's 8 subworld RODs carry `SubWorldInclusionSettings` (8 instances
in `MP_001.txt`) that gate them by gamemode.

**INFERRED:** NoHavok's subworld therefore always loads in full at level start with no inclusion
gating. That is however the same effective behaviour as the vanilla `StaticModelGroupEntityData` it
replaces, which also lives in the root partition and loads with the level. So "loads all at once" is
not a change — the *cost* of what is loaded is (§6).

---

## 5. What `StaticModelGroupEntityData` provided, and what replaces it

The deployed ext logs `Found StaticModelGroupEntityData, excluding` at
`ext/Shared/__init__.lua:117-122`. What it does (**VERIFIED**, `__init__.lua:117-122`):

```lua
if l_Object:Is('StaticModelGroupEntityData') then
    print('Found StaticModelGroupEntityData, excluding')
    local s_StaticModelGroup = StaticModelGroupEntityData(l_Object)
    s_StaticModelGroup:MakeWritable()
    s_StaticModelGroup.memberDatas:clear()
end
```

It does not exclude the entity — it **empties `memberDatas`**, so the group entity survives with zero
members and instantiates nothing. The generated subworld supplies the replacements.

### What the original carried

**VERIFIED**, `fb/StaticModelGroupMemberData.cs:21-56`. Each member holds:

| Field | Purpose |
| --- | --- |
| `MemberType : CtrRef<GamePhysicsEntityData>` | the physics-bearing source entity |
| `MeshEntityType : CtrRef<EntityData>` | **the mesh entity to instance** |
| `InstanceCount : uint` | how many |
| `InstanceTransforms / InstanceScale / InstanceObjectVariation / InstanceCastSunShadow` | per-instance arrays |
| `PhysicsPartRange : IndexRange`, `PhysicsPartCountPerInstance` | slice into the **baked group havok file** |
| `NetworkIdRange : IndexRange`, `NetworkIdCountPerInstance` | slice into the group's network id block |
| `HealthStateEntityManagerId` | shared health-state manager slot |

And `StaticModelGroupEntityData : GamePhysicsEntityData` (`fb/StaticModelGroupEntityData.cs:21-31`)
itself carries the group's `NetworkIdCount` and — via its base — the single baked physics asset,
`levels/<map>/<map>/staticmodelgroup_physics_win32`, which is exactly the key NoHavokGen looks up in
`util.HavokTransforms` (`ebx_json.py:277`).

**The `MeshEntityType` field is the load-bearing one.** In stock MP_001 there are 381 unique
`MeshEntityType` references, and they resolve 1:1 onto the 381 mesh entity instances in the root
partition — 298 `RigidMeshEntityData` + 83 `CompositeMeshEntityData` = 381 (**VERIFIED**: the set of
unique `MeshEntityType` GUIDs and the set of Rigid/Composite mesh entity GUIDs in `MP_001.txt`
intersect in all 381 elements). That is the signature of an **instanced renderer**: 381 distinct
render representations, each stamped out `InstanceCount` times from a transform array.

### What NoHavokGen substitutes

**VERIFIED.** `ProcessMember` (`ebx_json.py:99-253`) **never reads `MeshEntityType`.** It reads
`MemberType`, loads that entity's partition, and points each ROD at that partition's
`PrimaryInstanceGuid` (`ebx_json.py:176-177`) — which is the prop's **`ObjectBlueprint`**, not its
mesh entity.

Worked example (**VERIFIED**, member 0 of MP_001): `MemberType` is
`Props/StreetProps/Meat_Hung_01/Meat_SmallPiece_01/3E7DBA00-…`. That partition
(`Venice-EBX/Props/StreetProps/Meat_Hung_01/Meat_SmallPiece_01.txt`) contains an `ObjectBlueprint`
(the primary instance, `Object` → `3E7DBA00…`) wrapping a `StaticModelEntityData`, plus a
`HavokAsset`, two `RigidBodyData`, a `PartComponentData` and a `HealthStateData`.

So each of the 3646 RODs instantiates a **full object blueprint including its own physics**, not a
mesh. Despite the mod's name, the objects are not left collision-less: they get individual havok
from their own blueprint. That is what `GetValidScales` (`ebx_json.py:52-70`) polices — it walks
`PhysicsData.ScaledAssets` and checks each scaled havok asset name against `util.PhysicsContents`
for the level, so an instance is only emitted at a scale whose collision mesh actually shipped, and
instances with no valid scale at all are silently dropped (`ebx_json.py:203-210`).

### Does the replacement preserve what was lost?

| Original provided | Preserved? |
| --- | --- |
| Per-instance transform / scale / variation / sun-shadow flag | **Yes** (`ebx_json.py:179-243`), with scale snapped to the nearest *available* havok scale (`:224-227`) |
| Per-mesh LOD & cull settings | **Yes** — the original blueprint and therefore the original `MeshAsset` is referenced unchanged |
| Any container-level culling volume | **N/A** — never existed (§4) |
| Single baked group havok compound | **No** — replaced by 3646 individual physics entities |
| Instanced mesh rendering off `MeshEntityType` | **No** — replaced by 3646 independent blueprint instantiations |
| `NetworkIdRange` / group `NetworkIdCount` | **No** — `needs_network_id` is hard-coded `False` at `ebx_json.py:144`, overriding the `NetworkIdRange` check commented out on `:143`; the `ObjectBlueprint` clone path at `:146-161` is dead code |
| `HealthStateEntityManagerId` (shared health-state manager) | **No** — not read anywhere in `ebx_json.py` |

---

## 6. Verdict on the depth-0 / flat-siblings hypothesis

**Refuted as stated, and the real cost is elsewhere.**

* Not depth 0 — objects are at SubWorld → WorldPart → ROD, and MP_001 has 381 WorldParts
  (**VERIFIED**).
* "All siblings render" does not follow from the hierarchy either way, because `WorldPartData` has
  no bounds field for the engine to test (**VERIFIED**, §4) and vanilla's own WorldParts are equally
  non-spatial (**VERIFIED**, §3). Container nesting is not a culling mechanism in Frostbite 2.
* Per-object frustum culling and per-mesh LOD **survive intact**, because every ROD points at the
  unmodified original blueprint and its original `MeshAsset` (**VERIFIED**, §4).

**INFERRED (not runtime-observed) — the cost that is real:** the regression is *entity and draw-call
multiplication*, not culling loss. One `StaticModelGroupEntityData` with 381 instanced mesh types and
one baked havok compound becomes 3646 fully independent `ObjectBlueprint` instantiations, each with
its own entity, its own render object, its own rigid body, its own part components and health state.
That is expected to cost:

1. **Draw calls / batching** — 3646 individually submitted render objects instead of 381 instanced
   batches. Frustum culling still works, but everything that *is* visible costs more to submit.
2. **Physics broadphase** — 3646 havok rigid bodies instead of one static compound.
3. **Entity count and level-load time** — this alone roughly triples MP_001's ROD count (1835 → 5481)
   and is the likely reason the mod has to raise `loadedTimeout` / `loadingTimeout` /
   `ingameTimeout` to 50s (`ext/Shared/Config.lua:3`, applied at `__init__.lua:130-146`).
4. **Memory** — per-instance component data instead of shared group data.

This is the price of making static geometry individually addressable, which is the entire point of
the mod. It is not something a different container layout would fix.

### If you want to settle it empirically

The above is inference from data shape; none of it was measured in-engine. To confirm or kill it:

1. Load MP_001 with and without NoHavok and compare the **PerfOverlay / GPU draw-call and primitive
   counts** while standing still and facing the same direction. If draw calls jump by roughly the
   number of visible static props, cost (1) is confirmed.
2. **Point the camera at empty sky** on both. If the with-NoHavok frame cost stays elevated with
   nothing in frame, culling *is* broken and this document is wrong. If it drops to parity, culling
   works and the cost is purely per-visible-object — which is what §4 predicts.
3. Compare `Entity` counts / level-load wall time between the two.

Experiment 2 is the decisive one for the user's hypothesis and takes about a minute.

### A separate real bug worth noting

**VERIFIED from source, consequence INFERRED.** `ebx_json.py:196` sets

```python
reference_object_data['IndexInBlueprint'] = len(subworld_data['Objects'])
```

but the ROD is appended to `world_part_data['Objects']` (`:251`), never to `subworld_data['Objects']`
(which only ever receives WorldPartRODs, `:138`). So within a WorldPart, **every ROD gets the same
`IndexInBlueprint`** — the index of the *next* WorldPart in the SubWorld — instead of `0..n-1` within
its own WorldPart. `GameObjectData.IndexInBlueprint` (`fb/GameObjectData.cs:25`) is a `ushort` meant
to identify an object's slot in its containing blueprint. Consequences for MapEditor's own
`indexInBlueprint`-keyed logic and for entity/connection resolution are **not** established here and
should be checked before relying on that field for NoHavok objects.

---

## 7. Reproducing the numbers

```bash
NH=Admin/Mods/NoHavok/sb/Win32/NoHavok
VE=Venice-EBX/Levels/MP_001

# one partition, one SubWorldData per map
strings -n 6 $NH/MP_001/MP_001.sb | grep -iE 'nohavok/|SubWorldData|NoHavok_MP'

# WorldPartData count == StaticModelGroupMemberData count
strings -n 4 $NH/MP_001/MP_001.sb | grep -c '_Group$'        # 381
grep -c '::StaticModelGroupMemberData' $VE/MP_001.txt        # 381

# total instances
grep -oP '(?<=InstanceCount )\d+' $VE/MP_001.txt | awk '{s+=$1}END{print s}'   # 3646

# vanilla containers
grep -c '^WorldPartReferenceObjectData ' $VE/MP_001.txt      # 34
grep -c '^SubWorldReferenceObjectData '  $VE/MP_001.txt      # 8
grep -c '^ReferenceObjectData ' $VE/StreetProps.txt          # 585, one flat WorldPart

# StreamRealm matches vanilla
grep -oP '(?<=StreamRealm )\S+' $VE/StreetProps.txt | sort | uniq -c   # 585 StreamRealm_None
```

Verifying all 3646 emitted ROD GUIDs against the deployed bundle:

```python
import uuid
og = uuid.UUID('8F5E0383-52A4-11DF-AC80-BC6EA2597601')   # vanilla MP_001 PartitionGuid
sb = open('Admin/Mods/NoHavok/sb/Win32/NoHavok/MP_001/MP_001.sb','rb').read()
# parse (MemberType guid, InstanceCount) pairs out of Venice-EBX/Levels/MP_001/MP_001.txt, then:
#   uuid.uuid3(og, member_guid.lower() + str(i)).bytes_le   must appear in sb
# result: 3646/3646 found, 381/381 members hit. GUIDs are stored little-endian.
```

---

## 8. Moving a grouped object without converting it: patch the Havok

**Observed in practice:** editing an entry in `InstanceTransforms` moves the *visual* instance and
leaves its collision behind. So collision is not derived per-instance from the EBX at load — the
group's collision is a baked compound, and those per-instance lists drive rendering only. This is
the constraint that forces NoHavokGen's wholesale swap: it substitutes props whose *own*
blueprints carry their own `HavokAsset`, sidestepping the compound entirely rather than editing it.

That makes selective conversion ("convert only the objects a map actually edits, leave the other
~3600 instanced") unavailable by the obvious route: removing one instance would delete the mesh and
strand an invisible wall.

### But baked Havok is patchable — there is a working precedent

`docs/destruction.md` §3.2 states Rime cannot write Havok. That is **too broad and should be read
as "cannot GENERATE"**. Rime ships a command that mutates baked Havok geometry today:

```
RimeLib.Cmd/Commands/BundleBuilding/RaiseWaterPhysicsCommand.cs:16
"Raises or lowers a water HavokPhysicsData by a Y delta, shifting its vertices, MOPP origin
 and AABB together. The MOPP tree is relative, so it needs no recompile."
```

So writing hull vertices, the MOPP origin and the AABB is proven and shipping. What is missing is
hull *generation* and MOPP *compilation* — a different capability.

### The pieces for "move the object and take its collision with it"

`StaticModelGroupMemberData` supplies the instance → physics mapping:

- `PhysicsPartRange : IndexRange` and `PhysicsPartCountPerInstance : uint`

so instance *N*'s slice of the compound is addressable. Combined with the water command's
technique, the sequence is:

1. shift the instance's entry in `InstanceTransforms` (the visual move)
2. resolve that instance's physics parts via `PhysicsPartRange` / `PhysicsPartCountPerInstance`
3. apply the same delta to those parts' vertices, MOPP origin and AABB

This would keep instancing intact for the whole group and avoid converting anything.

### The boundary: translation yes, rotation and scale probably not

The MOPP tree is a spatial subdivision, and a uniform translation preserves its relative structure —
which is precisely why the water command needs no recompile. Rotating or rescaling a hull changes
which geometry falls in which cell, and there is no MOPP compiler to rebuild the tree. So this
plausibly buys **move**, not **rotate** or **resize**. "Delete" comes free: translate the parts far
below the level.

### Unverified — check before relying on it

- That `PhysicsPartRange` / `PhysicsPartCountPerInstance` index the compound the way the names
  imply, rather than some parallel structure.
- That the water command's approach generalises from "one whole water body, Y only" to "one
  member's parts, arbitrary XYZ".

Both are cheap to settle: patch a single prop and walk into the space it used to occupy. Unlike the
container-shape questions above, this one has an unambiguous physical test.
