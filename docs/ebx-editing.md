# EBX editing — add/remove components, array mutation, reference picking

Status: **specification + audit.** Nothing here is implemented. Companion to
`docs/entity-wiring-and-networking.md` (gap analysis G1–G11) and `docs/bake-pipeline.md`.

Goal: Unity-like structural editing in the inspector — add a light to a prefab, delete a component,
append/remove/reorder array elements, and pick a reference target from a list instead of typing a
guid. This document establishes **what the runtime actually permits**, what the data model forces on
us, and where the design has to make a call rather than a guess.

§9 separates **verified** claims (read out of code, dumps, or computed) from **inferred** ones. The
inferred ones are hypotheses. Several of them can only be settled by running the game; those are
listed explicitly in §10 so another session can probe them.

---

## 0. Verdict up front

| Capability | Possible today? | Blocker |
|---|---|---|
| Construct a new container of any Frostbite type at runtime | ✅ **yes**, verified in-repo | — |
| Append to a Frostbite array | ✅ **yes** — `array:add(x)`, verified in-repo | — |
| Empty a Frostbite array | ✅ **yes** — `array:clear()`, verified in-repo | — |
| Remove *one* element / insert at index / reorder | ❓ **no API observed** | must rebuild via `clear()` + `add()`; see §2.2 |
| Assign to an array slot | ✅ `arr[i] = v`, verified in-repo | — |
| Express any of the above through `SetEBXFieldCommand` | ❌ **no** | wire format is field-name recursion to a printable leaf (§3) |
| Resolve a connection `sourceFieldId` to a field **name** | ✅ **already shipped**, unused | `EventHashes.json`, 19 704 entries (§1.5) |
| Compute a field id from a name (to *author* a connection) | ✅ 6 lines of code | `fb::hashQuick`, verified reproduces real ids (§1.5) |
| Enumerate candidate reference targets by type, offline | ⚠️ **blueprints/assets only** | the shipped index records only each partition's *primary* instance type (§6.1) |
| Enumerate candidate targets that are sub-instances (a light inside a prefab) | ❌ offline; ✅ live | needs a server-side scan (§6.2) |

The single most important structural finding: **"add a component" is three different operations in
Frostbite, not one** (§2.1), and only one of them is what a user means by "add a light to a prefab".

---

## 1. What the runtime API can and cannot do

### 1.1 Any container type can be constructed at runtime — verified

Every Frostbite type is exposed to Lua as a global with a no-arg and a `(Guid)` constructor. VU's
generated reference documents this for all 2 492 `fb` types; e.g. `ObjectBlueprint()`,
`PropertyConnection()`, `EventConnection()`, `SpotLightEntityData()`.

MapEditor already relies on it:

- `ext/Shared/Modules/LevelInjector.lua:407` — `local s_Ref = WorldPartReferenceObjectData()`
- `ext/Shared/Modules/LevelInjector.lua:426` — `s_World = WorldPartData()`
- `ext/Shared/Modules/LevelInjector.lua:538,541` — `EffectReferenceObjectData()` / `ReferenceObjectData()`
- `ext/Shared/Modules/GameObjectManager.lua:94,97` — same pair in `CreateRepresentative`
- `ext/Shared/Patches/DynamicModelPatcher.lua:12` — `StaticModelEntityData(p_DynamicModel.instanceGuid)`

> **So "create a fresh `SpotLightEntityData` and attach it" is not blocked by the API.** It is blocked
> by everything downstream of it: which array it goes in, whether it survives the bake, and whether
> the engine will construct an entity for it. See §5.

### 1.2 Array mutation: `add` and `clear` are verified; nothing else is

Two array methods appear anywhere in `ext/`:

```lua
p_World.objects:add(s_Reference)                 -- LevelInjector.lua:574
p_PrimaryLevel.objects:add(s_Ref)                -- LevelInjector.lua:413
p_RegistryContainer.blueprintRegistry:add(s_World) -- LevelInjector.lua:427
s_Instance.propertyTracks:clear()                -- Patches/SequencePatcher.lua:13
s_Instance.customSequenceTracks:clear()          -- Patches/SequencePatcher.lua:14
s_Instance.startPoints:clear()                   -- Patches/LevelPatcher.lua:33
s_Category.mode:add(l_GameMode.GameModeName)     -- Patches/LevelPatcher.lua:29
```

Index **assignment** is also verified — `DataContainerExt:_deepCloneDC` writes
`p_Clone[p_FieldName][p_FieldIndex] = self:DeepClone(...)` at
`ext/Shared/Util/DataContainerExt.lua:389`, and `#array` is used for length at
`LevelInjector.lua:381,412,569`.

There is **no `:remove()`, `:erase()`, `:insert()`, or `:resize()` anywhere in the codebase**, and VU
Docs does not publish a page for the array wrapper type at all (the `fb` reference documents array
*fields* as `T[]` but not the methods on them). Two readings, both consistent with the evidence:

1. Those methods exist and simply were never needed here. (Plausible — `add`/`clear` were discovered
   the same way.)
2. The wrapper is append-and-clear only.

**The design must not depend on which is true.** Treat the API as `add` + `clear` + `arr[i] = v` +
`#arr`, and implement remove/insert/reorder as **read-all → `clear()` → `add()` in the new order**.
That is correct under either reading, and it is the same operation for all three edits, which
collapses three commands into one primitive (§4).

> ⚠️ Rebuild-by-clear is not free of risk. The VU changelog (changeset 18675, 03/05/2022) records:
> *"Fix an issue where frostbite type array operations would sometimes cause memory corruption or
> UB."* A clear+refill on a **loaded, `MakeWritable`'d** container is exactly the kind of operation
> that note is about. Probe it on a runtime clone first (§10, Q3), where a crash costs a respawn
> rather than the level. The VEXT changelog has **no** entry adding or documenting array methods,
> which is why the `add`/`clear` surface has to be established by grep rather than by reading docs.

### 1.3 Writing to loaded data

`DataContainer:MakeWritable()` un-freezes a partition-resident instance; VU Docs calls it *"quite
expensive"* and advises using it only on instances you intend to modify. `EBXManager:SetField` calls
it on every container it walks through (`ext/Shared/Modules/EBXManager.lua:37`), which is already
more than necessary and will matter more once a structural edit walks deeper.

`DataContainer:Clone()` / `Clone(guid)` is a **shallow** copy — struct-valued fields are copied,
container-valued fields keep pointing at the same instance. `DataContainerExt:DeepClone`
(`DataContainerExt.lua:282`) builds a deep copy on top of it. Relevant to §5: adding a component to
a per-instance clone means adding it to a container the clone owns, not to shared stock data — but
only if the *owning* container was itself cloned, which `DeepClone` does not guarantee for
containers it skipped (`_deepCloneDC` explicitly refuses to clone anything whose type is the bare
`DataContainer`, `DataContainerExt.lua:385`).

### 1.4 Reflection is complete enough to drive a type-aware UI

`getFields(typeInfo)` (`DataContainerExt.lua:558`) walks the `super` chain and returns the full field
list, stopping before `DataContainer`'s own members. `TypeInformation` exposes `name`, `super`,
`elementType`, `fields`, `array`, `enum`; `FieldInformation` exposes `name`, `value` (int),
`typeInfo`. That is everything needed server-side to answer "what fields does this concrete type
have, which are arrays, and what is the element type" — i.e. to validate an append and to populate a
field picker.

What reflection does **not** give: a subtype index. There is no "list all types assignable to
`GameObjectData`" call. That has to be shipped as static data (§6.3).

### 1.5 Field-id hashes are already solved — this is the surprise

`docs/entity-wiring-and-networking.md` lists **G6** ("field-id hashes shown raw, no hash→name
table") as an open gap with a suggested fix of grepping Venice-EBX. It is already solved twice over,
and neither half is being used.

**Forward (name → id).** Rime implements `fb::hashQuick` at
`/tmp/rime-src/RimeLibLite/Frostbite/Utils.cs:13-30` — an FNV-1 variant with **non-standard**
constants (basis `0x1505`, prime `0x21`, *not* the textbook `0x811C9DC5`/`0x01000193`):

```csharp
private const uint c_FnvOffsetBasis = 0x1505;
private const uint c_FnvPrime = 0x21;
public static uint HashQuick(string p_String) {
    var s_Hash = c_FnvOffsetBasis;
    for (int i = 0; i < p_String.Length; ++i)
        s_Hash = (s_Hash * c_FnvPrime) ^ p_String[i];
    return s_Hash;
}
```

Reinterpreted as a signed 32-bit int, this **exactly reproduces** every field id quoted in the
wiring doc — computed and checked:

| Name | `(int32)hashQuick(name)` | Source of the expected value |
|---|---|---|
| `Geometry` | `838548383` | `entity-wiring-and-networking.md` §1.1 |
| `AlternativeSpawnPoints` | `-2001390482` | ditto |
| `OnCaptured` | `2099208964` | ditto |
| `CaptureRadius` | `1043301209` | ditto |

So **authoring** a connection from a field name is a six-line function on either realm. Note the
`uint`→`int` reinterpret is required (`PropertyConnection.sourceFieldId` is `int`).

**Reverse (id → name).** `WebUI/public/data.zip` already ships `EventHashes.json` with **19 704**
entries, and `FrostbiteDataManager` already loads it into `this.eventHashes`
(`WebUI/src/script/modules/FrostbiteDataManager.ts:18`). All four ids above resolve through it
correctly. The file is loaded and then never read — `_HandleFile`'s switch
(`FrostbiteDataManager.ts:102-122`) has cases for `superbundles`, `bundles`, and `partitions` only;
`eventhashes`, `assethashes`, and `interfaceids` fall through to the empty `default`.

> **G6 is a WebUI-only change of maybe 20 lines**: add the three missing `case` arms, then have the
> inspector render `838548383 (Geometry)` instead of the bare number. No new data, no ext change,
> no Venice-EBX scraping. It should be re-scored from "Med" to "trivial".

Also in `data.zip`: `AssetHashes.json` (23 055), `InterfaceIDs.json` (2 744, mapping an interface
field id to a `"<Type> <value>"` default string), `Partitions.json` (70 093 — see §6.1),
`Bundles.json` (1 159), `SuperBundles.json` (64).

---

## 2. The data model — what "a component" is

### 2.1 Three different arrays, three different meanings

This is the crux, and conflating them will produce a feature that appears to work and silently
edits the wrong thing.

| Field | Declared type | Meaning |
|---|---|---|
| `GameEntityData.components` | `GameObjectData[]` | **the Unity analogue.** Components attached to one entity. |
| `ComponentData.components` | `GameObjectData[]` | nested components under a component. |
| `EffectEntityData.components` | `GameObjectData[]` | same, on effects. |
| `PrefabBlueprint.objects` | `GameObjectData[]` | the *contents* of a prefab — sibling objects, not components. |
| `ObjectBlueprint.object` | `GameObjectData \| nil` | **singular.** An `ObjectBlueprint` wraps exactly one object. |

Sources: VU Docs `fb` reference (`gameentitydata.md`, `componentdata.md`, `effectentitydata.md`,
`prefabblueprint.md`, `objectblueprint.md`) and Rime's generated classes —
`/tmp/rime-src/RimeLib.Serialization.Frostbite2_0/fb/PrefabBlueprint.cs:24-25`:

```csharp
[ContainerField(32), JsonProperty(Order = 32)]
public RefArray<GameObjectData> Objects { get; set; } = new();
```

versus `fb/ObjectBlueprint.cs:25`:

```csharp
[ContainerField(32), JsonProperty(Order = 32)]
public CtrRef<GameObjectData> Object { get; set; } = new();
```

`Objects` is declared **once**, on `PrefabBlueprint`. `SpatialPrefabBlueprint`, `WorldPartData`,
`SubWorldData`, `WorldData`, and `LevelData` all inherit it unchanged and never redeclare it.

MapEditor already has to handle both shapes: `GameObjectManager.lua:641` iterates `s_Blueprint.objects`
"For prefabs" and `:650` reads `s_Blueprint.object` "For blueprints".

**Why this matters for the feature request.** 7 998 of the 70 093 indexed partitions have an
`ObjectBlueprint` as their primary instance — that is the single most common *blueprint* kind a user
will have selected in the editor. An `ObjectBlueprint` **has no `objects` array to append to.**
"Add a light to this prefab" against an `ObjectBlueprint` means one of:

- (a) append to `blueprint.object.components` — if `blueprint.object` is a `GameEntityData`
  descendant. This is the true "add a component".
- (b) convert the `ObjectBlueprint` into a `PrefabBlueprint` so it can hold siblings. Structurally
  invasive; changes the type the ROD points at. **Not recommended.**
- (c) wrap: create a new `PrefabBlueprint` containing the original object plus the light, and
  repoint the instance's ROD at it. Viable but it is really "replace the blueprint", not "edit it".

**(a) is the design.** (b) and (c) are recorded so they aren't rediscovered.

### 2.2 Which concrete types are legal where

`Objects` and `components` are both `GameObjectData[]`, so the legal element set is identical:
**every subtype of `GameObjectData`.** Counted independently from two sources that agree:

| Root | Direct | Transitive | Source |
|---|---|---|---|
| `GameObjectData` | 8 | **475** | VU Docs `fb/*.md` inheritance graph; Rime `fb/*.cs` |
| `EntityData` | 144 | 310 | ditto |
| `SpatialEntityData` | 21 | 146 | ditto |
| `GameEntityData` | 65 | 114 | Rime |
| `ComponentData` | 96 | 117 | Rime |
| `Blueprint` | 2 | 20 | Rime |
| `DataContainer` | 284 | 1 663 | Rime |

The 8 direct children of `GameObjectData`: `BaseShapeData`, `CameraData`, `ComponentData`,
`EntityData`, `PhysicsConstraintData`, `ReferenceObjectData`, `RigidBodyConstraintData`,
`UICombatAreaEntityData`.

Light types, for the motivating example: there is **no `LightEntityData`**. The chain is
`SpatialEntityData → LocalLightEntityData → {PointLightEntityData, SpotLightEntityData}`, plus
`LightComponentData` / `OutdoorLightComponentData` on the component side.

> **475 entries is not a usable flat picker.** Group by direct parent, or default the list to
> `ComponentData` descendants (117) for the `components` arrays and `SpatialEntityData` descendants
> (146) for `objects` arrays, with "show all" as an escape hatch.

### 2.3 Type safety is advisory, and the file format will not catch a mistake

A reference is a `(partitionGuid, instanceId)` pair with no type tag. Rime's typed accessor
downcasts with `as T` and returns `null` on mismatch
(`/tmp/rime-src/RimeLib.Serialization/CtrRef.cs:26-31`), and the EBX writer only records the
*declared* field type. So appending a wrongly-typed container to `objects` produces a file that
compiles, loads, and resolves to nothing. **The editor must validate the append itself** — nothing
downstream will.

---

## 3. What the current edit pipeline can and cannot express

### 3.1 The wire format

An edit is a nested chain of `{ field, type, value }` descriptors, built by the WebUI
(`WebUI/src/script/components/EditorComponents/Inspector/EBXComponents/Property.vue:120-129`) and
consumed by `EBXManager:SetField` (`ext/Shared/Modules/EBXManager.lua:22`). `SetField` recurses on
`p_Instance[p_Field.field]` until `isPrintable(p_Field.type)` is true, then assigns
`ParseType(type, value)`. It returns the dot-path it walked; `GameObject:SetOverride`
(`ext/Shared/Types/GameObject.lua:487-499`) stores the whole descriptor under that path in
`self.overrides`.

**Consequences, all structural:**

1. **Every edit terminates in a primitive.** There is no descriptor shape that says "append", "remove
   at 3", or "set this reference to that guid". The grammar has no verb other than *assign a scalar*.
2. **Overrides are keyed by a dot-path string** (`GameObject.lua:494`). Paths through arrays contain
   **indices** — the WebUI names array elements `"1"`, `"2"`, … (`types/ebx/Field.ts:33-46`). An
   insert or remove renumbers every later element, silently repointing every stored override past
   the edit. **This is the hardest single problem in the whole design** and §4.2 is about it.
3. **Array element edits index with a *string*.** `Field.fromJSON(\`${i + 1}\`, …)` produces field
   name `"1"`, and `SetField` does `p_Instance[p_Field.field]` — i.e. `array["1"]`, never
   `tonumber`'d (`EBXManager.lua:49`). Whether VU's array wrapper coerces a string key is
   **unverified**; there is no e2e test that edits an array element (`tools/e2e/mapeditor_e2e.py`
   has 7 tests, none touching arrays). See §10 Q1 — if this does not coerce, *existing* array
   editing is already broken and nobody has noticed.
4. There is exactly one server-side entry point, `CommandActions:SetEBXField`
   (`ext/Shared/Modules/CommandActions.lua:299`), dispatched by name from
   `CommandActions:RegisterVars` (`:14-26`). Adding a command means adding a field there, a class in
   `WebUI/src/script/commands/`, and a `CARType` if the result needs to fan out.

### 3.2 The serializer side

`PartitionSerializer:_EncodeArray` (`ext/Server/PartitionSerializer.lua:456`) emits
`{"$type": <elementTypeName>, "$array": true, "$value": [...]}` and sets `"$ref": true` if *any*
element turned out to be a container. Element encoding branches on `isPrintable` / `enum` / has-an-
`instanceGuid` / else-inline-struct (`:478-499`).

Two facts that matter downstream:

- **Connection endpoints serialize with the DECLARED type, not the concrete one.**
  `_EncodeField` uses `p_TypeInfo.name` for the `$type` of a reference (`PartitionSerializer.lua:433`).
  `PropertyConnection.source` is declared `DataContainer` — confirmed on both sides:
  VU Docs `fb/propertyconnection.md` (`source: DataContainer | nil`) and Rime
  `fb/PropertyConnection.cs:25` (`CtrRef<DataContainer> Source`). Only **9** fields in the entire
  2 497-type set are declared `CtrRef<DataContainer>`, and 6 of them are the Source/Target pairs of
  the three connection structs. So a connection endpoint carries **zero** type information in the
  serialized output, and the reference picker cannot infer a candidate set from the field type
  (§6.4).
  *Partial fix, already noted as G5 in the wiring doc:* emit `p_Value.typeInfo.name` when the value
  is a live container. One line. It does not help the picker decide what is *legal*, only what is
  *currently there*.
- `$array` values are **positional** and carry no identity, so the WebUI cannot tell an element that
  moved from an element that changed.

### 3.3 The inspector side

- `ArrayProperty.vue` renders `N elements`, collapsible; connection arrays default collapsed rather
  than hidden (`ArrayProperty.vue:84-87`). It has **no** add/remove/reorder affordance at all.
- Its `getOverrides(field)` does `this.overrides[Number(field)]` (`ArrayProperty.vue:76-80`) — an
  **index-keyed** override lookup, the same fragility as §3.1(2), now on the display side.
- `ReferenceProperty.vue` renders a reference as a read-only chip with expand-in-place. It resolves
  zero-partition-guid refs against the containing partition and falls back to a global instance
  search (`ReferenceProperty.vue:141-224`). **This is the component a picker would extend** — it
  already knows how to display a target's type, path, name, and nested blueprint name.
- `ExplorerComponent.vue` is a searchable, icon-decorated, type-labelled list over
  `fbdMan.partitions`. **This is the picker UI, already built** — it needs a modal host and a type
  filter, not a rewrite.

---

## 4. Design: generic array mutation

### 4.1 One primitive, not three

Because remove/insert/reorder all reduce to rebuild (§1.2), implement **one** ext-side operation:

```
MutateArrayCommand {
  guid          : editor GameObject guid      -- which instance
  path          : [ {field:"object"}, {field:"components"} ]   -- container-only chain, NO indices
  op            : "append" | "remove" | "move" | "duplicate"
  elementKey    : element identity (see 4.2)  -- for remove/move/duplicate
  toIndex       : int                          -- for move
  newElement    : { $type, seedFrom? }         -- for append; see §5
}
```

Ext side, after resolving `path` to the array:

```
1. snapshot = { arr[1..n] }              -- Lua table of the live members
2. apply the op to the snapshot          -- pure Lua, no engine calls
3. arr:clear()
4. for each v in snapshot: arr:add(v)
```

Step 2 is trivially undoable; steps 3–4 are the only engine mutation and are identical for every op.
If a future VU exposes a real `:remove(i)`, only steps 3–4 change.

**`path` must not contain array indices.** It is a chain of *field names* only, terminating at the
array field itself. Nesting an array inside an array (`a.b[2].c`) is real in Frostbite (e.g.
`ComponentData.components` inside `GameEntityData.components`); handle it by making each path node
optionally carry an `elementKey` rather than an index.

### 4.2 Element identity — the load-bearing decision

Index-keyed overrides break under insert/remove. Three candidate identities:

| Identity | Works for | Fails for |
|---|---|---|
| **Index** (today) | nothing structural | any insert/remove renumbers later paths |
| **`instanceGuid`** | container elements (`objects`, `components`) — every element is a DC with a guid | inline-struct elements (all three connection arrays) have **no guid** |
| **Content hash / synthetic id** | inline structs | must be stable across a re-serialize |

There is no single answer, because the two array kinds are genuinely different — which
`_EncodeArray` already knows, since it sets `$ref` only for the container case
(`PartitionSerializer.lua:506-508`).

**Proposal — dual identity, chosen by array kind:**

- **Container arrays** (`$ref: true`): key by `instanceGuid`. Stable, already serialized, survives
  reorder and the bake. Migrate `GameObject.overrides` paths from `objects.2.radius` to
  `objects{A1B2…}.radius`.
- **Inline-struct arrays** (`$ref` absent): mint a **synthetic per-element id at serialize time** and
  emit it as a reserved key (e.g. `"$elem": 3`) alongside the struct's field map in
  `_EncodeArray`'s inline branch (`PartitionSerializer.lua:493-498`). The id is the element's
  position **at serialize time**, and the WebUI must round-trip it verbatim rather than recomputing
  it. On the ext side, resolve the id back to a position before mutating, and **re-serialize the
  whole array after any mutation** so the client's ids are refreshed. That makes the id valid only
  between a serialize and the next mutation, which is exactly the window an interactive editor needs.

  ⚠️ `docs/bake-pipeline.md` §8 records that Rime **rejects** unexpected keys on inline struct
  members: *"Could not find member '$type' on object of type 'EventConnection'"*. A `$elem` key would
  hit the same wall. It must be **stripped** in whatever converts inspector JSON to Rime JSON, or
  carried out-of-band in a parallel array (`"$elemIds": [1,2,3]`) rather than inside the members.
  The parallel-array form is safer and is the recommendation.

**Migration cost.** Existing saves store override paths in the index form. A save written before this
change and loaded after it will mis-target. Either version the override format and translate on
load, or accept that structural editing invalidates old overrides and say so in the release note.
This is a real cost and it should be paid deliberately.

### 4.3 Undo

`History.execute` merges consecutive commands only when both are `updatable` and share a `mergeKey`
(`WebUI/src/script/libs/three/History.js:33-52`). Structural commands must set `updatable = false` —
merging two appends into one would lose an element. Each op's inverse:

| op | undo |
|---|---|
| `append` | `remove` the element by the key the ext returned |
| `remove` | `append` the removed element, then `move` it back to its old index |
| `move` | `move` back |
| `duplicate` | `remove` the copy |

`remove`'s undo needs the **whole removed element**, not just its key — for a container element that
is a live DC the ext must keep alive (a table of tombstones on `GameObjectManager`, cleared on
`Level:Destroy`); for an inline struct it is the serialized field map, which the WebUI already has.
Do **not** rely on the DC still being reachable: nothing else references it once it leaves the array.

---

## 5. Design: add / remove component

### 5.1 The two semantics, and which one each operation gets

`docs/prefab-overrides.md` and `docs/bake-pipeline.md` §5 establish the split. Restated for
structural edits:

**Per-instance (default).** The first EBX edit deep-clones the blueprint
(`GameObject:SetOverrides`, `ext/Shared/Types/GameObject.lua:357-394`) with a **deterministic** guid
derived from the editor guid, registers it on `GameObjectManager.m_InstanceClones`
(`GameObjectManager.lua:1066`), and re-instantiates through `RequestReinstantiate`
(`GameObjectManager.lua:151`, debounced). A structural edit fits this unchanged: mutate the clone's
array, respawn from the clone. Siblings are untouched by construction.

**Apply-to-Blueprint.** `GameObjectManager:ApplyOverridesToBlueprint` (`:1191`) replays the stored
overrides onto the **shared** partition-resident DC, records the blueprint in `m_AppliedBlueprints`,
then rebuilds every instance. **A structural edit cannot be replayed this way today**, because
replay is `for _, l_Field in pairs(s_Applied) do EBXManager:SetField(s_Shared, l_Field, '') end`
(`:1214-1216`) — a loop over field-assignment descriptors. Structural ops are not in that vocabulary.

> **Design call:** `GameObject.overrides` must become an *ordered list of operations*, not a
> path-keyed map of field assignments — or at minimum, structural ops must be stored in a second,
> ordered list that Apply replays before the field map. Ordering matters: appending a component and
> then editing its `radius` only works if the append is replayed first. The current map is
> order-free (`pairs()`), so this is a required change, not a nicety.

### 5.2 Remove must not destroy vanilla entities

`docs/entity-wiring-and-networking.md` §4.1 and `GameObject:Destroy`
(`ext/Shared/Types/GameObject.lua:218-222`) are unambiguous: destroying an entity that came with the
level crashes the game. The current code destroys **only** entities tagged `isEditorSpawned`
(`GameObject.lua:242-248`) and disables everything else.

Removing a component is not the same operation — it removes *data*, and the entity is rebuilt from
that data by the debounced respawn. But the two interact:

- **On a per-instance clone: safe by construction.** The array being mutated belongs to a runtime
  clone. The live entities are torn down by the existing respawn path, which already discriminates
  correctly. **This is the only removal path Phase 1 should ship.**
- **On a shared/vanilla blueprint (Apply): not safe by construction.** Every instance of that
  blueprint is rebuilt, including vanilla objects the editor tracks. The existing rebuild loop
  (`:1236-1263`) uses `Disable/Enable` for clone-less objects, which does not destroy anything — so
  it is probably fine — but a removal changes what `Enable` reconstructs, which is a different
  situation from a value change. **Unverified. Probe before shipping Apply-with-structural-ops.**
- **Vanilla `ReferenceObjectData`s the editor never enumerates** are reached only through partition
  shadowing at bake time (`bake-pipeline.md` §5), never live. So an applied removal is invisible in
  the editor for those objects and only appears after a bake — which is already true for value
  edits, but far more surprising for a removal.

### 5.3 Prefer `excluded = true` over deletion where the type allows it

Exactly **three** Frostbite types declare an `excluded` field: `ReferenceObjectData`,
`ComponentData`, and `SocketData` (grep over all 2 492 `fb/*.md`). Through inheritance that covers
**126 of the 475** `GameObjectData` descendants — the `ComponentData` closure (117) plus the
`ReferenceObjectData` closure (9). `LevelInjector` already uses it as the vanilla-delete mechanism
(`LevelInjector.lua:469-471`).

> **Recommendation: for any element that has an `excluded` field, "remove" should set
> `excluded = true` rather than shrink the array.** It is a scalar assignment — expressible in the
> *existing* override format, undoable for free, index-stable, replayable by Apply today, and it
> bakes today. It is strictly less risky than array mutation.

The 126 covered types are, usefully, exactly the ones a user most often means by "component"
(everything under `ComponentData`) and by "object in a prefab" (everything under
`ReferenceObjectData`).

**But `EntityData` descendants have no `excluded`** — all 310 of them, including
`SpotLightEntityData` and `PointLightEntityData`. So a light added as a raw entity cannot be
soft-removed, while a light added as a `LightComponentData` can. That is a real argument for
preferring the **component** form in the picker's defaults (§6.3, §12 item 12): it makes the object
soft-removable, which makes the whole Phase-1 shortcut apply to it.

Reserve true array removal for elements with no `excluded` field — which includes all three
connection structs (§7.2).

### 5.4 What a newly added component needs

An appended container is not enough on its own. From vanilla defaults recorded in
`entity-wiring-and-networking.md` §1.6 and the type definitions:

- If it derives from `GameObjectData`: `indexInBlueprint`, `isEventConnectionTarget`,
  `isPropertyConnectionTarget`. `Realm_None` (3) is the correct "not a connection target" value —
  that doc verified it against vanilla data and explicitly corrects the earlier belief that it was
  a bug. Use `3` unless the new element is actually wired.
- If it derives from `SpatialEntityData`: `transform` (a `LinearTransform`). Default it to identity
  *relative to the parent*, not to world.
- If it derives from `ReferenceObjectData`: `blueprint`, `blueprintTransform`, `excluded = false`,
  and `castSunShadowEnable` (vanilla is `True` for 261/317 RODs in `Buildings.txt`).
- **VEXT's constructor defaults for a fresh instance are not verified** — this is G9 in the wiring
  doc and it applies identically here. Seed explicitly; do not trust the constructor.

**Seed-from-existing is the better UX and the safer engineering.** Rather than constructing a bare
`SpotLightEntityData()`, offer "add a copy of an existing one": resolve a donor instance from the
Venice-EBX-shaped corpus (or from another loaded partition), `DeepClone` it, and append the clone.
That inherits every default the shipping data uses, including fields nobody documented. It also
makes the picker in §6 do double duty.

---

## 6. Design: the reference selector

Unity's object picker: click a reference field, get a filtered searchable list of candidate targets,
choose one, done. Three sub-problems: **enumerate candidates**, **know what is legal**, **make the
assignment**.

### 6.1 Offline enumeration — 70 093 partitions, but only their primary instance

`WebUI/public/data.zip` → `Partitions.json` has **70 093** entries, loaded at startup into
`FrostbiteDataManager.partitions` / `.partitionGuids`
(`WebUI/src/script/modules/FrostbiteDataManager.ts:104-111`). Each entry is exactly:

```json
{ "bundlesReferencedIn": ["levels/mp_001/conquest"],
  "guid": "C98941E6-B300-4D5F-BC2E-ECA03DBF855D",
  "instanceCount": 7,
  "name": "Levels/MP_001/Conquest",
  "primaryInstance": "539342BE-2504-4D4F-A60B-8EC27DB005C2",
  "typeName": "SubWorldData" }
```

`typeName` is the type of the **primary instance only**. There is no per-instance list. 268 distinct
primary types; the top of the distribution:

```
12356 TextureAsset   8835 ShaderGraph   7998 ObjectBlueprint   6546 RigidMeshAsset
 6495 SoundWaveAsset 4182 EmitterTemplateData 3542 WorldPartData 2542 UnlockAsset
 2423 CompositeMeshAsset 2270 ObjectVariation 1492 SpatialPrefabBlueprint 1413 EffectBlueprint
```

**The consequence is sharp:** `SpotLightEntityData` and `PointLightEntityData` appear as the primary
instance of **zero** partitions. Lights (and components generally) always live *inside* a prefab
partition, never as its primary. So:

> **The offline index can answer "pick a blueprint / mesh / variation / effect" completely, and
> cannot answer "pick a light" at all.**

That is the right split anyway: it covers `ReferenceObjectData.blueprint`,
`.objectVariation`, `StaticModelEntityData.mesh` — the reference fields users actually want to
repoint — using data already in the browser, with no game round-trip.

### 6.2 Live enumeration for everything else

For sub-instance targets (connection endpoints, components, anything inside a partition), candidates
must come from the game. Two scopes, cheapest first:

1. **Within the currently inspected partition.** `PartitionSerializer` already serializes every
   instance of a partition (`SerializePartition`, `:78-115`), and the WebUI already holds them in
   `FBPartition.instances`. **A picker scoped to "instances in this partition, filtered by type" needs
   no ext change whatsoever.** This covers the overwhelmingly common case for connections, because
   a bus's connections reference objects in its own blueprint (to be confirmed against the corpus —
   §10 Q6).
2. **Across loaded partitions.** Requires a new server RPC — walk `PartitionSerializer.m_Partitions`
   (populated on every `Partition:Loaded`, `:58-64`) and return `(partitionGuid, instanceGuid,
   typeName, name)` for instances matching a type predicate. This is a fresh scan over every loaded
   partition and must be **paged and cached**; the existing chunked transport
   (`_QueueChunked`, `:755`, 8 000-byte chunks, 10 messages/tick) is the model to copy.
   `PartitionSerializer` is **server-only** (G11), so client-only partitions — `VisualEnvironments/`,
   `Lighting/*`, effect blueprints — are invisible to this scan until G11 is fixed.

### 6.3 Knowing what is legal requires shipping a type graph

To filter "types assignable to `GameObjectData`", the WebUI needs the inheritance graph. Neither
VEXT reflection (no subtype index, §1.4) nor Rime (`DataContainerTypeRegistry` exists only in the
`Frostbite2013_2` assembly, not `Frostbite2_0` — `/tmp/rime-src/RimeLib.Serialization.Frostbite2013_2/DataContainerTypeRegistry.cs:7-44`)
provides one for BF3.

**Generate it and ship it in `data.zip`.** A flat `{ "TypeName": "SuperName" }` map over 2 492 types
is ~60 KB uncompressed and a few KB gzipped — trivial next to the existing 10 MB archive. Two
independent sources that already agree on every spot-check in this document: the VU-Docs generated
`fb/*.md` pages (`Inherits from [X]` on line 5) and Rime's `fb/*.cs` class declarations (line 21-22).
Generating from VU-Docs is the lower-friction option (no .NET build in the loop) and it is the same
API surface VEXT exposes at runtime.

Ship the enum member lists at the same time — `EnumProperty.vue` currently depends on the ext's
`_ReverseEnum` (`PartitionSerializer.lua:606`) doing a linear scan of a Lua global per field.

### 6.4 What the picker can and cannot infer for a connection endpoint

Nothing, from the type. `PropertyConnection.source`/`target` are declared `DataContainer`
(§3.2), which admits 1 663 concrete types. The candidate set has to come from **scope**, not type:

- the objects in the enclosing blueprint (`.objects` / `.object` / `.components`), plus
- the enclosing blueprint itself (buses connect to their own interface), plus
- for a level bus, the world parts it contains.

And the **field** picker on the far side has to come from reflecting the *concrete* resolved target:
`getFields(target.typeInfo)` → hash each name with `hashQuick` → that is the legal `targetFieldId`
set (§1.5). This is genuinely the right way round and it is entirely implementable today.

### 6.5 Gameface constraints on the picker UI

From `WebUI` precedent and the constraints already documented in the components:

- **No CSS Grid** (`Property.vue:245` says so explicitly) — flexbox only.
- **No `:not()`, `:last-child`, `:last-of-type`, `:disabled`** — `ReferenceProperty.vue:338-340`
  works around the missing `:last-of-type` with a top margin instead of a bottom margin.
- **No `dashed` borders.**
- **Native checkboxes do not toggle** — use a clickable span (`controls/BoolControl.vue`).
- **No `element.click()`** — dispatch a `MouseEvent` sequence (this is what
  `tools/e2e/mapeditor_e2e.py` has to do).
- **`scrollIntoView` is unreliable** — a 70 000-row list must be **virtualized with explicit scroll
  maths**, and "scroll to current value" cannot lean on the browser.
- **Unicode arrows render as tofu** — `ReferenceProperty.vue:313` draws its caret as a CSS triangle.
- **`localStorage` does not survive a client restart** — so "recently picked" / "favourites" must
  round-trip through the ext (the project DB) or be accepted as session-only.

The list is large enough that search-first is not a preference but a requirement: default the modal
to an empty result set with focus in the search box, exactly as `ExplorerComponent.vue` already
behaves.

---

## 7. Connections and events

### 7.1 What add/remove does to existing connections

Connections reference endpoints **by pointer**, and they are inline structs on the bus rather than
containers (`entity-wiring-and-networking.md` §1.1, confirmed by Rime: `PropertyConnection`,
`LinkConnection`, `EventConnection`, and `EventSpec` all derive from `EbxSerializable` and *not*
from `fb.DataContainer` — `/tmp/rime-src/.../fb/PropertyConnection.cs:20-22` etc.).

| Structural edit | Effect on connections |
|---|---|
| **Append** a component | none — nothing points at it yet. It is inert until wired (this is exactly **G1**: internal wiring ships with a prefab, external wiring does not). |
| **Remove** a component that is *not* an endpoint | none. |
| **Remove** a component that *is* an endpoint | **dangling connection** — the bus keeps a `Source`/`Target` pointing at a container that is no longer in the blueprint. This is **G4**, whose consequence the wiring doc records as arising demonstrably but never observed. |
| **Reorder** `objects` | no effect on connections (they are by pointer, not index) — but see §7.4 on `indexInBlueprint`. |
| **Repoint** a reference via the picker | if the reference *is* a connection endpoint, this is connection authoring and is the whole of **G5**. |

### 7.2 Dangling-endpoint handling — the design

Removal must not be allowed to silently create a dangling connection.

**Detection is cheap and entirely local.** Before removing element `E` from an array on bus `B`,
scan `B.propertyConnections`, `B.linkConnections`, `B.eventConnections` and collect every index
whose `source` or `target` `:Eq(E)`. `DataContainer:Eq(other)` is documented as a reference-identity
check, which is precisely the right predicate.

That covers the bus that owns the array. It does **not** cover the level/subworld bus one level up,
which the wiring doc §1.2 shows is where gameplay wiring actually lives, potentially
**cross-partition** (`Levels/MP_001/MP_001.txt` carries PropertyConnections into
`Levels/MP_001/Buildings/…`). A complete scan is "every loaded bus", which is expensive and
server-only (G11).

**Recommended policy, three tiers:**

1. **Same-bus dangles: block by default.** Show them in the confirm dialog ("3 connections reference
   this component"), with an explicit **Remove connections too** checkbox that, when ticked,
   removes those connection elements in the *same* command so undo restores both.
2. **Cross-bus dangles: warn, don't scan eagerly.** Offer a "check other loaded buses" button that
   fires the §6.2 scan. Do not make every removal pay for a full-level walk.
3. **Never leave a dangle silently.** If the user proceeds anyway, record it — a
   `danglingConnections` list on the project — so the bake can report it.

Note connection structs have **no `excluded` field**, so the §5.3 shortcut does not apply: removing
a connection genuinely requires array mutation. Setting both endpoints to `nil` is the alternative
(the fields are `DataContainer | nil`) but it leaves a live-but-inert struct on the bus, and
**whether the engine tolerates a null-endpoint connection is unverified** (§10 Q5).

### 7.3 Authoring a connection — now unblocked

With §1.5 (hash a field name) and §6.4 (enumerate legal fields from the concrete target), the
remaining pieces are:

1. `MutateArrayCommand` with `op: "append"` on `propertyConnections` — but the element is an **inline
   struct**, not a container, so `newElement` is a *field map*, not a `$type` + guid. `PropertyConnection()`
   constructs one; assign `source`, `target`, `sourceFieldId`, `targetFieldId`; `arr:add(it)`.
2. For an `EventConnection`, note the event id is **one level deeper** than the property case:
   `conn.sourceEvent.id`, where `EventSpec` is a 4-byte inline struct with a single `int Id`
   (`/tmp/rime-src/.../fb/EventSpec.cs:20-25`). A UI that assumes symmetry with `sourceFieldId` will
   be wrong.
3. `EventConnection.targetType` is the realm carrier — `EventConnectionTargetType_{Invalid,
   ClientAndServer, Client, Server, NetworkedClient, NetworkedClientAndServer}` = 0..5
   (`/tmp/rime-src/.../fb/EventConnectionTargetType.cs:20-31`). **The networking realm of an event is
   on the connection, not on the object** — the wiring doc's central structural claim, and it means
   the connection editor must expose `targetType` prominently, not bury it.
   Note this enum's numbering is **not** the `Realm` enum's; `Realm_Server = 1` but
   `EventConnectionTargetType_Server = 3`. Do not share a dropdown.
4. `isEventConnectionTarget` / `isPropertyConnectionTarget` on the **target** should then be derived
   from the connections that exist (this is **G7**, and the wiring doc is explicit that it should be
   done *last*, after authoring works — not from a table of type names).

### 7.4 `indexInBlueprint` under reorder and append

`indexInBlueprint` is **level-global**, not per-blueprint (wiring doc §1.5, disjoint ranges observed
across MP_001's world parts). `LevelInjector` allocates it as `#p_World.objects + self.m_IndexCount + 1`
(`LevelInjector.lua:569`), and `m_IndexCount` is estimated by scanning only each world part's last
element (`:381-389`) — that under-estimate is **G8**.

For this feature: **appending to a prefab's `objects` must allocate a fresh index, and reordering
must not renumber.** If reorder renumbers, it will collide with vanilla indices and make G8 worse.
Treat `indexInBlueprint` as an identity, not a position.

---

## 8. Bake implications

`docs/bake-pipeline.md` §5 is the contract. Against it:

**Per-instance structural edits bake, with one caveat.** `SerializeCloneSubtree`
(`PartitionSerializer.lua:283-316`) walks `_CollectRuntimeSubtree`, which follows only edges to
containers that are **runtime** (`_IsRuntimeDc`: no partition guid, or the zero guid — `:130-145`).
A freshly constructed `SpotLightEntityData()` has no partition, so it **is** collected and **does**
serialize. Good.

The caveat: `_CollectFieldDataContainers` (`:194-238`) reaches array members
(`:220-231`) and recurses through inline structs (`_TakeDataContainerOrRecurse`, `:242-252`) — a
walk the file's own comment says was added because a top-level-only walk produced *"dangling
pointers in the emitted partition (observed: 5 of 371 refs on a real WallLamp clone)"*. So the walk
is already known to be the fragile part. **Adding containers in new places is exactly the stress
this walk was hardened against, and it should be re-validated on a clone that has an appended
component** (§10 Q4).

**A component seeded by cloning a stock donor becomes part of the emitted partition, not a
reference.** `DeepClone` produces runtime containers, and every runtime container is *collected*
rather than *pointed at*. That is correct — but it means "add a light by copying that one" copies
the light's entire subtree into the instance's partition. For a light that is small. For a donor
with a large subtree it is not. Cap it, or prefer construct-and-seed-scalars for big types.

**Apply-to-blueprint structural edits are the riskier half.** `SaveClonedBlueprints`
(`ext/Server/ProjectManager.lua:466-530`) handles applied blueprints by serializing the **whole
original partition** under its original name and relying on the custom bundle **shadowing** the stock
one — which `bake-pipeline.md` §5 flags as an **unverified assumption**, and additionally notes that
`bundles.py` names partitions `CustomLevels/<map>/<file>`, so shadowing an arbitrary stock name needs
a generator change. A structural edit does not make that worse, but it does raise the stakes: a
value edit that fails to shadow silently keeps the stock value; a *removal* that fails to shadow
silently keeps a component the user deleted. **Do not ship structural Apply until shadowing is
proven.**

**Rime-side constraints that structural output must respect** (all from `bake-pipeline.md` §8, each
found by compiling real data):

- **No `$type` on inline struct members** — Rime resolves them from the field's declared element
  type. So an appended `PropertyConnection` must serialize as a bare field map. This is why §4.2's
  element id must be carried in a parallel array, not inside the member.
- **Omit null fields; never emit `null`** — Rime defaults struct-valued fields to `new()`, and an
  explicit null replaces a working default with a `NullReferenceException` at write time. A newly
  constructed component will have many unset fields; the serializer's existing behaviour (emit
  `{"$type":T,"$ref":true}` for both genuine nulls and read failures, which the converter drops)
  handles this — but only if the converter keeps dropping them.
- **Sound/voice instances serialize empty** — `_SerializeFields` skips types matching `sound`/`voice`
  because reading their fields crashes the game (`PartitionSerializer.lua:356-359`). So **adding a
  sound component is a known-lossy operation**: it will appear in the editor and bake as an empty
  instance. Either block those types in the picker or warn loudly.

---

## 9. Verified vs inferred

**Verified — computed, or read directly out of code / generated definitions:**

- `array:add(v)` and `array:clear()` exist and are used in production paths —
  `LevelInjector.lua:413,414,427,544,574`; `Patches/SequencePatcher.lua:13,14`;
  `Patches/LevelPatcher.lua:29,33`.
- Array index **assignment** works — `DataContainerExt.lua:389`. Array length via `#` —
  `LevelInjector.lua:381,412,569`.
- **No** `remove`/`erase`/`insert`/`resize` call exists anywhere in `ext/`, and VU Docs publishes no
  page for the array wrapper type.
- Any Frostbite type can be constructed from Lua — used at `LevelInjector.lua:407,426,538,541`,
  `GameObjectManager.lua:94,97`, `Patches/DynamicModelPatcher.lua:12`; documented for all 2 492
  `fb` types in the VU reference.
- `fb::hashQuick` (basis `0x1505`, prime `0x21`, reinterpreted as int32) **reproduces**
  `Geometry` → `838548383`, `AlternativeSpawnPoints` → `-2001390482`, `OnCaptured` → `2099208964`,
  `CaptureRadius` → `1043301209`. Computed, not assumed. Source
  `/tmp/rime-src/RimeLibLite/Frostbite/Utils.cs:13-30`.
- `WebUI/public/data.zip` ships `EventHashes.json` (19 704), `AssetHashes.json` (23 055),
  `InterfaceIDs.json` (2 744), `Partitions.json` (70 093), `Bundles.json` (1 159),
  `SuperBundles.json` (64). `EventHashes.json` resolves all four ids above. It is loaded into
  `FrostbiteDataManager.eventHashes` (`FrostbiteDataManager.ts:18`) and **never read** —
  `_HandleFile`'s switch (`:102-122`) has no case for it. **G6 is a WebUI-only fix.**
- `Partitions.json` entries carry `typeName` for the **primary instance only**; no per-instance list.
  268 distinct primary types. `SpotLightEntityData` / `PointLightEntityData` are the primary
  instance of **zero** partitions.
- `ObjectBlueprint.object` is **singular** (`CtrRef<GameObjectData>`); `PrefabBlueprint.objects` is
  the array (`RefArray<GameObjectData>`), declared once and inherited by `SpatialPrefabBlueprint`,
  `WorldPartData`, `SubWorldData`, `WorldData`, `LevelData`. Rime `fb/ObjectBlueprint.cs:25`,
  `fb/PrefabBlueprint.cs:24-25`; VU Docs `objectblueprint.md`, `prefabblueprint.md`. MapEditor
  handles both at `GameObjectManager.lua:641,650`.
- `GameEntityData.components` / `ComponentData.components` / `EffectEntityData.components` are
  `GameObjectData[]` — VU Docs `gameentitydata.md`, `componentdata.md`, `effectentitydata.md`.
- Subtype counts (two independent sources agreeing): `GameObjectData` 8 direct / 475 transitive;
  `EntityData` 144/310; `SpatialEntityData` 21/146; `ComponentData` 96/117; `Blueprint` 2/20;
  `DataContainer` 284/1 663.
- There is no `LightEntityData`. `SpatialEntityData → LocalLightEntityData →
  {PointLightEntityData, SpotLightEntityData}`.
- Exactly **3** types declare `excluded` — `ReferenceObjectData`, `ComponentData`, `SocketData` —
  covering 126 of the 475 `GameObjectData` descendants by inheritance. **No `EntityData` descendant
  has it**, so lights added as raw entities cannot be soft-removed.
- `PropertyConnection` / `LinkConnection` / `EventConnection` / `EventSpec` derive from
  `EbxSerializable`, **not** from `fb.DataContainer` — i.e. inline structs, no guid. Rime
  `fb/PropertyConnection.cs:20-22` and siblings. Independently consistent with
  `entity-wiring-and-networking.md` §1.1.
- `PropertyConnection.source`/`target` are declared `DataContainer` — only 9 fields in 2 497 types
  are declared that way, 6 of them these. `PartitionSerializer` emits the **declared** type
  (`:433`), losing the concrete one.
- `EventConnection.sourceEvent` is an `EventSpec` struct wrapping a single `int Id` — one level
  deeper than `PropertyConnection.sourceFieldId`.
- `EventConnectionTargetType` = 0..5 (`Invalid, ClientAndServer, Client, Server, NetworkedClient,
  NetworkedClientAndServer`) — numbering differs from `Realm`.
- Overrides are keyed by a **dot-path string** (`GameObject.lua:494`) built by `EBXManager:SetField`;
  array steps use the WebUI's `"1"`-based element names (`types/ebx/Field.ts:33-46`) and the ext
  indexes with that **string** (`EBXManager.lua:49`), never `tonumber`'d.
- `ArrayProperty.vue` has no add/remove/reorder UI; it collapses (not hides) connection arrays
  (`:84-87`) and looks overrides up by `Number(field)` (`:76-80`).
- `getFields` walks the super chain (`DataContainerExt.lua:558-574`).
- `History.execute` merges only `updatable` commands sharing a `mergeKey` within 500 ms
  (`History.js:33-52`).
- `tools/e2e/mapeditor_e2e.py` has 7 tests; **none** touch arrays.
- Two gaps from the wiring doc are **already fixed** in the current tree and should be re-scored
  there: **G2** — `InvokeBlueprintSpawnFromClone` now sets
  `s_Params.networked = s_ObjectBlueprint.needNetworkId == true` (`GameObjectManager.lua:1164`),
  no longer hardcoded `false`; **G3** — `GameObject:Destroy` now destroys entities tagged
  `isEditorSpawned` and disables the rest (`GameObject.lua:242-248`).

**Inferred / not verified — do not act on without probing:**

- That the array wrapper has *no* single-element removal. Absence of evidence only.
- That `clear()` + re-`add()` on a `MakeWritable`'d, partition-resident array is safe. The VU
  changelog (changeset 18675, 03/05/2022) records fixing memory corruption / UB in "frostbite type
  array operations", which makes this worth proving rather than assuming.
- That `array["1"]` (string key) resolves in VEXT. If it does not, array element editing is
  **already** broken today.
- That the engine tolerates a connection whose `source`/`target` is nil, or one pointing at a
  container no longer reachable from the bus (**G4**, still unobserved).
- That `SerializeCloneSubtree` captures containers appended after the clone was made. The walk
  reaches array members and inline structs by construction, so it *should* — but the file's own
  history records it missing 5 of 371 refs before it was hardened.
- That partition shadowing works at all (`bake-pipeline.md` §5 flags this) — a precondition for
  structural Apply-to-Blueprint.
- VEXT constructor defaults for a fresh container (**G9**). All of §5.4 depends on these.
- Whether connection endpoints in vanilla data are predominantly same-partition. Assumed in §6.2's
  "scoped picker needs no ext change"; needs a corpus count.

---

## 10. Questions only the running game can answer

Listed so another session can probe them with `tools/e2e/mapeditor_e2e.py`. Each is cheap.

| # | Question | How |
|---|---|---|
| **Q1** | Does `array["1"]` (string key) index a VEXT array, or does it need `tonumber`? | Edit any array element in the inspector on a spawned prop; check whether the value lands. Add an e2e case either way. |
| **Q2** | Does the array wrapper expose `remove` / `erase` / `insert` / `resize`? | On a runtime clone: iterate/inspect the array userdata's metatable, or just call them in a `pcall` and log. |
| **Q3** | Is `clear()` + re-`add()` safe on a `MakeWritable`'d loaded array? | On a per-instance clone first, then on a shared blueprint. Watch for the 1.8.1 corruption class. |
| **Q4** | Does `SerializeCloneSubtree` capture a container appended to a clone's array after cloning? | Append, save, read `project_ebx`, count instances. |
| **Q5** | What does the engine do with a connection whose endpoint is nil / removed? (**G4**) | Null one endpoint of a capture-point connection; observe. |
| **Q6** | Do vanilla connections mostly reference instances in their own partition? | Countable from the Venice-EBX dumps without the game — determines whether the §6.2 scoped picker is sufficient. |
| **Q7** | What are VEXT's constructor defaults for a fresh `SpotLightEntityData()` / `ReferenceObjectData()`? (**G9**) | Construct and dump every field. |
| **Q8** | Does a rebuilt instance pick up an appended component, or does `CreateEntitiesFromBlueprint` cache blueprint structure? | Append, let the debounced respawn fire, check the entity bus contents. |

---

## 11. Phased plan

Ordered so each phase is independently shippable and each de-risks the next. Estimates are
engineering days for someone already fluent in this codebase, and **exclude** the in-game probing in
§10 (budget a day for Q1–Q4 up front — they change the design if they come back the wrong way).

### Phase 0 — free wins, no structural change (≈1.5 d)

1. **G6, properly.** Wire the three unread `data.zip` files into `FrostbiteDataManager._HandleFile`
   and render `838548383 (Geometry)` in the inspector. `EventHashes.json` is already loaded. **~0.5 d.**
2. **Concrete endpoint types.** `PartitionSerializer._EncodeField` (`:433`): use
   `p_Value.typeInfo.name` when the value is a live container. One line, makes every connection row
   readable. **~0.25 d.**
3. **`hashQuick` helper** on both sides (Lua + TS) with unit tests against the four known ids.
   Prerequisite for all connection authoring. **~0.25 d.**
4. **Ship the type graph** (`{type: super}` for 2 492 types) into `data.zip`, generated from the
   VU-Docs `fb/*.md` pages. Enables every type filter later. **~0.5 d.**

*Nothing here can break a level. Ship it first regardless of what the rest of the plan does.*

### Phase 1 — read-only structure + the safe half of removal (≈4 d)

5. **Reference picker, offline scope.** Modal over `fbdMan.partitions` reusing
   `ExplorerComponent.vue`'s list + search, filtered by the type graph, virtualized. Emits an
   existing `SetEBXFieldCommand` — **no ext change**, because assigning a reference is already
   expressible. Covers `blueprint`, `objectVariation`, `mesh`. **~2 d.**
6. **Reference picker, same-partition scope.** Same modal, candidates from
   `FBPartition.instances`. Still no ext change. Covers most connection endpoints. **~1 d.**
7. **`excluded` toggle in the inspector** for elements that have the field, presented as "Remove /
   Restore". This is a scalar edit: undoable, bakeable, replayable by Apply, all today (§5.3).
   **~1 d.** — *this delivers a large fraction of "delete a component" at near-zero risk.*

### Phase 2 — real array mutation, per-instance only (≈6 d)

8. **Element identity.** Add `$elemIds` as a parallel array in `_EncodeArray`'s inline branch;
   switch container-array override keys to `instanceGuid`. Migrate/version stored override paths.
   **~2 d.** *Highest-risk item in the plan — it touches saved data.*
9. **`MutateArrayCommand`** (append/remove/move/duplicate) via the snapshot→clear→re-add primitive,
   ext + WebUI + undo with tombstones. Per-instance clones **only**; refuse on shared blueprints.
   **~2 d.**
10. **`ArrayProperty.vue` affordances** — per-row ✕ / ↑ / ↓ and a footer "+", Gameface-safe (no
    `:last-child`, no native buttons that rely on `:disabled`). **~1 d.**
11. **Dangling-endpoint detection** on the owning bus, with the confirm dialog and the "remove
    connections too" path (§7.2 tier 1). **~1 d.**

### Phase 3 — add component (≈5 d)

12. **Type picker** over the `GameObjectData` closure, grouped by direct parent, defaulting to
    `ComponentData` (117) or `SpatialEntityData` (146) by context. **~1 d.**
13. **Construct-and-seed** a new container with explicit defaults (§5.4), plus **seed-from-donor**
    via `DeepClone` of a picked existing instance. **~2 d.**
14. **Resolve the `ObjectBlueprint` case** — route "add" to `blueprint.object.components` when the
    blueprint has no `objects` array, and say so in the UI. **~1 d.**
15. **Bake validation** — an e2e that appends a component, saves, bakes, and asserts the component
    is in the emitted partition (Q4). **~1 d.**

### Phase 4 — connection authoring (≈5 d) — this is G1/G5/G7

16. **Connection editor**: endpoint picker (Phase 1 #6) + field picker from `getFields` on the
    concrete target + `hashQuick`, and a `targetType` dropdown for events. **~3 d.**
17. **`LevelInjector:CreateWorldParts` writes connections** onto the injected `WorldPartData`
    (G1). **~1 d.**
18. **Derive `isEvent/PropertyConnectionTarget`** from the connections that exist (G7) — last, as
    `entity-wiring-and-networking.md` §4 insists. **~1 d.**

### Phase 5 — blueprint-wide structural edits (≈4 d, gated)

19. **Ordered operation log** replacing the path-keyed override map, so Apply can replay structural
    ops in order (§5.1). **~2 d.**
20. **Structural Apply-to-Blueprint** — **gated on partition shadowing being proven**
    (`bake-pipeline.md` §5). Do not start before that. **~2 d.**

**Total ≈25 engineering days** for the full feature, of which Phases 0–1 (**≈5.5 d**) deliver the
reference picker and a safe "remove component" with no format migration and no new failure mode.

---

## 12. Related

- `docs/entity-wiring-and-networking.md` — connections, realms, and gaps G1–G11. **G2 and G3 are
  fixed in the current tree; G6 is fixable from data already shipped.**
- `docs/prefab-overrides.md` — clone-on-edit and Apply-to-Blueprint.
- `docs/bake-pipeline.md` — §5 (the two override semantics), §7 (the two JSON shapes), §8 (what Rime
  rejects). Any structural output has to satisfy §8.
- `tools/e2e/mapeditor_e2e.py` — the harness for every question in §10.
