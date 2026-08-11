# Entity wiring & networking — spec and gap analysis

Status: **specification + audit.** Nothing here is implemented yet except where marked ✅.

Scope: how Frostbite connects entities to each other (link / property / event connections), how it
decides what is networked and on which realm, what MapEditor does today, and what is missing.

Everything in §1 was read out of [Venice-EBX](https://github.com/VeniceUnleashed/Venice-EBX)
(`master`) and the [VU docs](https://docs.veniceunleashed.net/). §5 separates what was **verified**
from what is **inferred** — do not act on the inferred items without probing first.

---

## 1. How Frostbite models this

### 1.1 The three connection structures

All three are **inline structs on the bus**, not DataContainers. They have no `instanceGuid` and no
`MakeWritable`; the EBX dump prints them as `member(0)::PropertyConnection`, the same notation as
`member(0)::Vec3`, as opposed to `member(0) <path>/<GUID>` for a real reference.

```
DataBusData
  .propertyConnections : PropertyConnection[]
  .linkConnections     : LinkConnection[]

EntityBusData (: DataBusData)
  .eventConnections    : EventConnection[]
  .descriptor          : InterfaceDescriptorData
  .needNetworkId       : bool
  .interfaceHasConnections : bool
  .alwaysCreateEntityBusClient / Server : bool

PropertyConnection / LinkConnection {
    Source, Target : DataContainer|nil
    SourceFieldId, TargetFieldId : int      -- name hashes
}

EventConnection {
    Source, Target : DataContainer|nil
    SourceEvent, TargetEvent : EventSpec { Id : int }
    TargetType : EventConnectionTargetType
}
```

`EventConnectionTargetType` = `Invalid | ClientAndServer | Client | Server | NetworkedClient |
NetworkedClientAndServer`. `Levels/MP_001/Rush.txt` uses 12× `_Client`, 4× `_NetworkedClient`,
1× `_Server`.

> **The networking realm of an event is carried on the connection, not on the object.** This is the
> single most important structural fact in this document.

`SourceFieldId` / `TargetFieldId` are name hashes; Venice-EBX prints the resolved name next to them,
e.g. `838548383 (Geometry)`, `-2001390482 (AlternativeSpawnPoints)`, `2099208964 (OnCaptured)`,
`1043301209 (CaptureRadius)`.

### 1.2 Where gameplay wiring lives — prefab-internal vs level bus

This distinction is why "I spawned a flag and nothing happens".

- **Inside the prefab.** `Gameplay/Level_Setups/Components/CapturePointPrefab.txt` contains an
  `InterfaceDescriptorData` (`B5571DDE-…`) exposing properties `InitialOwnerTeam`, `CaptureRadius`,
  `AreaValue` and events `OnCaptured` / `OnLost`, plus internal PropertyConnections wiring that
  interface to the prefab's own children. This ships **inside the blueprint**, so
  `CreateEntitiesFromBlueprint` reconstructs it for free.
- **In the level / subworld bus.** The connections that make a flag *a Conquest flag* live one level
  up. `Levels/MP_001/Conquest.txt` (`SubWorldData 539342BE-…`) holds 49 PropertyConnections plus
  LinkConnections and 17+ EventConnections referencing `Levels/MP_001/CQ_logic/8C5AF081-…`,
  `Levels/MP_001/CQ_logic_US/10A70CA7-…`, etc. `Levels/MP_001/MP_001.txt` (`LevelData CEB62353-…`)
  carries its own PropertyConnections targeting `Levels/MP_001/Buildings/12EC3B03-…` —
  **cross-partition**, into the world parts.

**Consequence:** spawning a gameplay prefab at runtime reproduces its *internal* wiring and none of
its *external* wiring.

**But this only breaks the objects whose behaviour IS external** — observed in practice:

- **Intrinsic behaviour — works when spawned.** A `VehicleSpawnReferenceObjectData` spawns vehicles
  because that is what the entity does; nothing has to tell it. Confirmed working. Consistent with
  the data: it carries `isEventConnectionTarget = 2` (ClientAndServer) where plain props are `3`.
- **Externally wired — does not work when spawned.** A capture-point prefab has no idea it is a
  Conquest flag; that meaning is entirely in the level bus. Spawn one and the game mode never
  sees it.

So G1 is scoped to the wired class (capture points, MCOMs, gamemode logic), not "all gameplay
objects". That also makes *duplicate-with-wiring* the natural first slice: for an object that is
already wired, its level-bus connections reference it by guid, so cloning those connections and
repointing them at the copy is far smaller than a general connection editor.

### 1.3 Realm, and the `isEventConnectionTarget` field

VU's `Realm` enum:

```
Realm_Client = 0   Realm_Server = 1   Realm_ClientAndServer = 2   Realm_None = 3   Realm_Pipeline = 4
```

`GameObjectData.isEventConnectionTarget` / `isPropertyConnectionTarget` are typed `int` and hold
exactly these values. Verified against three known endpoints:

| Instance | Role | `isEventConnectionTarget` |
|---|---|---|
| `Levels/MP_001/Conquest_Full_4_flags/49088C70-…` (`LogicReferenceObjectData`) | target of an EventConnection whose `TargetType` is `_Server` | `1` = `Realm_Server` ✔ |
| `Levels/MP_001/CQ_logic/8C5AF081-…` (capture point ROD) | source only; **is** a PropertyConnection target | `3` = `Realm_None`, `isPropertyConnectionTarget = 2` ✔ |
| every `WorldPartReferenceObjectData` in `MP_001.txt` | wired to nothing | `3` / `3` ✔ |

> **`Realm_None` (3) is the correct value for "not a connection target".** MapEditor's use of it is
> right, not a bug. In `Levels/MP_001/Buildings.txt`, 278 of 317 RODs are `ev=3 pr=3`.

The real issue is that it's a **constant where the data varies, correlated with type**:

```
Buildings.txt: 278× ev=3 pr=3 | 15× ev=0 pr=3 | 10× ev=3 pr=2 | 9× ev=2 pr=3 | 5× ev=1 pr=3
```
- `VehicleSpawnReferenceObjectData` (`CQ_logic_US.txt`) → `ev=2`, `pr=3`
- `CapturePointPrefab`'s inner ROD `91D0D7B6-…` → `ev=3`, `pr=2`
- `LogicReferenceObjectData 49088C70-…` → `ev=1`

### 1.4 There is no per-object realm flag

Searched for and **not found**: any ROD/GameObjectData field expressing client-only / server-only.
`StreamRealm` is uniformly `StreamRealm_None` across `Buildings` / `FX` / `Extra` in MP_001, and
`alwaysCreateEntityBusClient` / `Server` track together (`True/True` for `Conquest` and `MP_001`,
`False/False` for `Buildings` and `CapturePointPrefab`) — neither expresses realm exclusivity.

Realm exclusivity in Frostbite comes from the runtime entity **type** and from **bundle membership**,
not from a field on the ROD. MapEditor's guid-diff handshake between realms is therefore a
reasonable design *given the data*; see G10 for its actual weakness.

### 1.5 `indexInBlueprint`

Level-**global** across world parts, not per-blueprint. Disjoint ranges observed in MP_001:
`CQ_logic` 4–46, `Default` 48–73, `Buildings` 148–469, `FX` 2336–2464, `Extra` 2706–2803.
`LevelData.objects`' own `WorldPartReferenceObjectData` use a separate 0,1,2,… sequence.

### 1.6 Vanilla defaults worth matching

- `castSunShadowEnable` is `True` for 261/317 RODs in `Buildings.txt`.
- `WorldPartData`: `Enabled True`, `UseDeferredEntityCreation False`, non-null
  `HackToSolveRealTimeTweakingIssue`.
- `CapturePointPrefab`: `NeedNetworkId True`, `InterfaceHasConnections True`.
- `Buildings` WorldPartData: `NeedNetworkId False`, `InterfaceHasConnections False`.

---

## 2. What MapEditor does today

| Concern | Location | Behaviour |
|---|---|---|
| Spawn | `ext/Shared/Modules/GameObjectManager.lua` `InvokeBlueprintSpawn` | `networked = s_ObjectBlueprint.needNetworkId`; `parentRepresentative` ✅ |
| Representative ROD | `GameObjectManager:CreateRepresentative` ✅ | sets `blueprint`, `blueprintTransform`, `isEvent/PropertyConnectionTarget = Realm_None`, `excluded = false`. Does **not** set `castSunShadowEnable`, `streamRealm`, `indexInBlueprint` |
| Clone respawn | `GameObjectManager:InvokeBlueprintSpawnFromClone` | **`networked = false` hardcoded**, client-only (see G2) |
| Realm | `GameObject.realm` constant `Realm_ClientAndServer`; `UpdateGameObjectRealm`; `ClientGameObjectManager` client-only-guid handshake | derived by diffing vanilla-guid sets between realms |
| Entity init | `GameObjectManager` `l_Entity:Init(self.m_Realm, true)` | carries a `-- TODO: find out if the blueprint is client or server only` |
| Level injection | `LevelInjector:CreateWorldParts` | `WorldPartData()` with **only `objects`** populated |
| Custom ROD | `LevelInjector:AddCustomObject` | ROD / EffectROD, `blueprint`, `blueprintTransform`, `objectVariation`, `indexInBlueprint`, `Realm_None`, `excluded = false` |
| Vanilla delete | `LevelInjector` | `excluded = true` on the ROD |
| Serializer | `ext/Server/PartitionSerializer.lua` | **does** inline connection structs; `source`/`target` become `$ref` typed `"DataContainer"` (declared type, not concrete) |
| Inspector | `ArrayProperty.vue` | connection arrays are **collapsed by default, not hidden** |
| Destroy | `GameObject:Destroy` | calls `Disable()` on entities; `GameEntity:Destroy` has **zero callers** |

---

## 3. Gaps

| # | Issue | Symptom | Severity |
|---|---|---|---|
| **G1** | **Level-bus connections are never authored.** `CreateWorldParts` builds a `WorldPartData` with only `objects`; spawning wires the new bus into nothing. | Spawn a CapturePointPrefab / vehicle spawner / MCOM: it renders, internal wiring works, but the game mode never sees it. Flags never capture, spawners never spawn. | **High** |
| **G2** | **Clone respawn drops the network id.** Any EBX edit re-instantiates with `networked = false`, client-only. `CapturePointPrefab` is `NeedNetworkId True`. | Edit one field on a networked object → client renders a local non-networked copy while the server still owns the real one. Ghost doubles / non-interactive objects. | **High** |
| **G3** | **Entities are disabled, never destroyed.** `GameEntity:Destroy` is dead code. Each debounced re-instantiation leaks an entity bus. **Disabling is deliberate: destroying a VANILLA entity crashes the game** — that constraint is why the code is the way it is, and any fix must preserve it (see §4.1). | Long editing sessions degrade; deleted custom objects still occupy their bus. | **High, but constrained** |
| **G4** | **Deleting a wired vanilla object leaves dangling connections** (`excluded = true` on a ROD that is a connection endpoint). | Game-mode logic still holds connections to a deleted object. Consequence unverified. | **Med** (uncertain) |
| **G5** | **Connections cannot be authored.** `EBXManager:SetField` has no array append/remove; endpoints serialize as `$ref` typed `"DataContainer"`. | You can see connections and edit a raw `sourceFieldId`, but cannot add/remove/repoint one — so G1 has no manual workaround. | **Med** |
| **G6** | **Field-id hashes shown raw.** No hash→name table. | Rows read `SourceFieldId 838548383` instead of `Geometry`. | **Med** |
| **G7** | **`isEvent/PropertyConnectionTarget` hardcoded** to `Realm_None` where the data varies by type. Correct today; blocks G1/G5. | None now; hard blocker once connection authoring lands. | **Low now** |
| **G8** | **`m_IndexCount` under-estimates.** Scans only each world part's last element, and only if it `:Is("ReferenceObjectData")`; subworld-hosted parts aren't scanned. Vanilla numbering is level-global. | Injected objects can collide with vanilla `indexInBlueprint`; realms can disagree. | **Med** (uncertain) |
| **G9** | **Vanilla ROD/WorldPart defaults not replicated** (`castSunShadowEnable`, `WorldPartData.enabled`, …). | If VEXT's fresh-ROD default is `false`, injected props lose sun shadows — visible lighting mismatch. Default not verified. | **Med** (uncertain) |
| **G10** | **Realm classification is a heuristic** on top of collision-resolved guids: `GetVanillaGuid` retries with an increment, so one client-only object shifts every later increment on that realm only. | Objects mis-labelled client-only/server-only. | **Med** (inferred) |
| **G11** | **`PartitionSerializer` is server-only.** | Client-only partitions (`VisualEnvironments/`, `Lighting/*`, effect blueprints) return "Partition not loaded on server". | **Med** |

---

## 4. Roadmap

Ordered by value / effort. Each item names the function to change.

**Phase 1 — stop the bleeding (small, independent)**
1. **G3** — see §4.1. **Not a one-liner.** Do not simply swap `Disable()` for `Destroy()`.
2. **G2** — decide deliberately. `needNetworkId` cannot simply be restored: the clone DC is not
   registered in `ResourceManager`, so a networked spawn hands the peer an unresolvable blueprint
   guid and crashes it (this is why it is `false`). Options: (a) keep client-only preview and re-sync
   authoritatively on save, (b) register the clone so peers can resolve it, (c) suppress
   re-instantiation for `needNetworkId` objects and fall back to `Disable`/`Enable`. **Needs a call.**
3. **G6** — build a field-id hash→name table. Venice-EBX is the corpus:
   `grep -ohE "Id -?[0-9]+ \([A-Za-z]+\)"` over the dump yields the map. Resolve in
   `PartitionSerializer:_EncodeField` or ship it as static JSON to the WebUI.
4. **G5 (partial)** — emit the **concrete** endpoint type: use `p_Value.typeInfo.name` instead of the
   declared `p_TypeInfo.name` in `PartitionSerializer`.

### 4.1 G3 in detail — why entities are only disabled

**Destroying a vanilla entity crashes the game.** That is the reason `GameObject:Destroy` calls
`l_GameEntity:Disable()` and why `GameEntity:Destroy` has no callers. It is a deliberate constraint,
not an oversight, and it must survive any fix. `GameObject:Destroy` already refuses vanilla objects
outright (`"Cant destroy vanilla object, use disable instead"`), so the guard exists at the object
level — the entity-level call was simply never made safe.

The leak is nonetheless real and now fires far more often than it used to, because per-instance EBX
editing re-instantiates on every (debounced) edit. Each re-instantiation abandons an entity bus.

What makes this genuinely tricky: **an object's origin changes.** The first EBX edit to a *vanilla*
object deletes it and respawns it from a clone, and the respawned object is registered as `Custom`.
So from the second edit onward the "custom" object's entities descend from vanilla level data. Any
fix must be sure it is destroying only entities *we* created via `CreateEntitiesFromBlueprint`, not
entities the level shipped with.

Suggested approach (unverified — probe before shipping):
- Tag entities created by our own spawns (e.g. a flag on `GameEntity` set in the create hook when
  `s_PendingCustomBlueprintInfo ~= nil`), and destroy **only** those.
- Keep `Disable()` for everything else, unconditionally.
- Test specifically: repeatedly edit a *vanilla* object (which becomes `Custom` after the first
  edit) and confirm no crash, then confirm the bus count stops growing.
- The existing e2e leak test (`repeated edits do not leak GameObjects`) covers the GameObject side
  only; an entity/bus-level assertion would need to be added.

**Phase 2 — correctness of injected data**
5. **G9** — set `castSunShadowEnable`, `streamRealm` on created RODs and `enabled` on the injected
   `WorldPartData`. **Probe VEXT's constructor defaults in-game first.**
6. **G8** — scan all objects in every world part (including subworld-hosted), or allocate
   `indexInBlueprint` from a high fixed base both realms agree on.
7. **G11** — mirror `PartitionSerializer` into `ext/Client/`; `PartitionInspector` tries local first,
   falls back to the server.

**Phase 3 — the actual feature: connection authoring (G1 / G5 / G7)**
8. Array append/remove in `EBXManager:SetField`.
9. A `LinkConnection` / `PropertyConnection` / `EventConnection` editor in the inspector, with
   endpoint pickers (object + field, using the G6 name table).
10. `LevelInjector:CreateWorldParts` writes `propertyConnections` / `eventConnections` onto the
    injected `WorldPartData`.
11. Only now make `isEvent/PropertyConnectionTarget` data-driven (G7) — derive it from the
    connections actually authored, not from a table of type names.
12. **Duplicate-with-wiring** (a good first slice of G1): when duplicating a wired vanilla object,
    clone the level-bus connections whose `Source`/`Target` is the original ROD and repoint the copy.
    Moving an existing object is already safe, because the level bus references it by guid.

---

## 5. Verified vs inferred

**Verified** (Venice-EBX dumps / VU docs / grep over `ext/`):
- The `Realm` enum values, and that `isEvent/PropertyConnectionTarget` uses them — cross-checked
  against three endpoints with matching `EventConnectionTargetType`.
- `Realm_None` (3) is vanilla's "not a target" value; matches the majority of RODs and every
  `WorldPartReferenceObjectData` in `MP_001.txt`. **MapEditor is correct here.**
- Field layout of `PropertyConnection` / `LinkConnection` / `EventConnection` / `EventSpec`, and that
  they are structs on the bus rather than per-object DataContainers.
- Gameplay wiring for capture points lives in the level/subworld bus, separate from the prefab's
  internal wiring.
- `CapturePointPrefab.needNetworkId = True`; `Buildings` WorldPartData `= False`.
- `indexInBlueprint` is level-global.
- `castSunShadowEnable` majority `True`; `WorldPartData.Enabled = True`.
- `ArrayProperty.vue` **collapses, does not hide** connection arrays.
- `PartitionSerializer` **does** inline connection structs; `MAX_DEPTH = 24` is irrelevant (they sit
  at depth 1). It loses the concrete endpoint type, not the data.
- `GameEntity:Destroy` has no callers.
- **Destroying a vanilla entity crashes the game** (maintainer knowledge, learned the hard way).
  This is why entities are only ever `Disable()`d — see §4.1. Not something to "fix" naively.

**Inferred / not verified — probe before acting:**
- Engine behaviour when a connection endpoint has `excluded = true` (G4). The situation demonstrably
  arises; the consequence was not observed.
- Whether `indexInBlueprint` collisions actually corrupt network-id derivation (G8).
- VEXT constructor defaults for a fresh `ReferenceObjectData()` / `WorldPartData()` (G9) — all of G9
  hinges on these.
- The guid-collision realm-misclassification path (G10) — read from code, not observed.

**Two premises that turned out to be wrong** (recorded so they aren't re-investigated):
`Realm_None` is *not* a bug, and the inspector does *not* hide connections.

---

## 6. Related

- `docs/prefab-overrides.md` — the per-instance EBX override system (clone-on-edit, Apply-to-Blueprint).
- GH #202 — `parentRepresentative`, implemented ✅. Note it does **not** address G1: a unique
  representative makes per-instance data unique, but does not wire the object into the level bus.
- `tools/e2e/mapeditor_e2e.py` — the harness any of this work should be verified with.
