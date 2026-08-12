# Destruction — making arbitrary objects destructible

Status: **research + feasibility study. Nothing here is implemented, and one third of it cannot be.**

Scope: what it would take to make static geometry in BF3 destructible by reusing the engine's own
destruction systems rather than inventing one. Covers the five distinct destruction mechanisms
Frostbite 2 actually ships, what a destructible asset requires that a static one lacks, whether any
of it can be generated, and what it costs.

Sources: [Rime](https://github.com/ModdersLink/Rime) source (code claims cited `file:line`, paths
relative to a checkout — read here at `/tmp/rime-src`),
the [Venice-EBX](https://github.com/VeniceUnleashed/Venice-EBX) dump of shipped BF3 data (data
claims cited by dump path), [BF3RM/NoHavokGen](https://github.com/BF3RM/NoHavokGen), the VU type
registry in `veniceext.dll`, and the [VU docs](https://docs.veniceunleashed.net/). §7 separates
**verified** from **inferred** — do not act on the inferred items without probing first.

---

## 0. The verdict, in 60 seconds

**"Make everything destructible like DICE did" is not a weekend project and not a year of work — it
is impossible with the current toolchain.** The blocking fact:

> **Rime cannot write mesh resources and cannot GENERATE Havok collision.** (It *can* patch existing
> baked Havok — see `nohavok-subworlds.md` §8 for `RaiseWaterPhysicsCommand`, which shifts vertices,
> MOPP origin and AABB together because the MOPP tree is relative. What is absent is hull generation
> and MOPP compilation, which is what fracture needs.) It can read them, export
> them to glTF for viewing, and package arbitrary bytes into bundles the game loads — but it cannot
> *manufacture* the bytes. `RelocPtr.Serialize` — the pointer primitive every Frostbite mesh layout
> is built from — is `throw new NotImplementedException()`
> (`/tmp/rime-src/RimeLibLite/Frostbite/Core/RelocPtr.cs:38-47`). There is no
> `RimeLib.Mesh/Generation/` directory, though `RimeLib.Texture/Generation/ITextureGenerator.cs`
> shows exactly what one would look like.

Real fracture destruction requires pre-split part geometry (`CompositeMeshAsset`) and a matching
compound Havok shape with a recompiled MOPP tree. We can author neither. So the honest ranking:

| # | Approach | New mesh data? | Effort | Visible payoff | Verdict |
|---|---|---|---|---|---|
| **1** | **Runtime damage/impulse API** — `ApplyDamage`, `ApplyImpulse`, `SetActiveHealthState` on every existing destructible | none | **days** | high on maps that already have destructibles | **Do this first.** Zero new data, entirely unexploited today. |
| **2** | **Static → banger swap** — give a static prop a `Health 0.0` state + `SpawnedBangerBlueprint` so it breaks off and falls | none, if reusing an existing banger mesh | **1–2 weeks** | high, broad | **The pragmatic win.** See §4.2. |
| **3** | **Static → dynamic physics prop** — flip `RigidBodyMotionType_Fixed` → `_Dynamic` pre-spawn | none | days | medium; props become shovable, not breakable | Cheap, but cosmetic. Network cost is the catch. |
| **4** | **Reuse existing breakable blueprints** — swap a static wall for one of the 209 authored breakables | none | 1–2 weeks | high but *narrow* — only where a shape matches | Worth a catalogue. Only 209 exist. |
| **5** | **Generate real fracture destruction** | **yes — and we cannot write it** | **blocked** | highest | **Not possible.** Needs a MeshSet serializer and a Havok MOPP compiler, neither of which exists in any tool we have. |

Approaches 1–4 are all reachable and together get a long way toward "the world reacts when you shoot
it". Approach 5 is the one people picture when they say "make everything destructible", and it is
off the table until somebody writes a Frostbite 2 mesh writer from scratch.

Sizing the ambition against shipped data: BF3 contains **6,577** `StaticModelEntityData` assets, of
which **4,878 are fully static**, **1,697 have a death state**, and only **209** are true breakable
architecture (`/home/powos/Projects/Venice-EBX`, counts in §1.6). DICE hand-authored 209 breakable
buildings across the entire game, totalling **2,561 parts**. That is the scale of the manual labour
this feature would be trying to automate.

---

## 1. How BF3 destruction actually works

These are **five separate systems**, not one. They share almost nothing. Conflating them is the
main reason this feature sounds easier than it is.

### 1.1 Breakable architecture (pre-fractured part destruction)

The "walls blow apart in chunks" system. **209 assets game-wide.**

Root entity is `BreakableModelEntityData` — **not** a `StaticModelEntityData` with extra components.
It is a different type with a different field set. It *loses* `PartLinks`, `PhysicsPartInfos`,
`NetworkInfo`, `BasePoseTransforms`, `Visible`, `ExcludeFromNearbyObjectDestruction`, and it *gains*
`DecalVolumeShader`, `DecalVolumeScaleFactor`, `EdgeModelLightMapData`.

Required containers, hanging off `Components[]`:

| Container | Count | Carries |
|---|---|---|
| `BreakablePartComponentData` (`: DestructionPartComponentData`) | one **per part** | `PartIndex`, `ConnectivityType`, `Fixed`, `Fragile`, `HealthPercentage`, `Collapsable`, `DestroyNearbyStaticEntities`, `Objects[]` → per-part FX |
| `BreakableControllerComponentData` (`: DestructionControllerComponentData`) | exactly 1 | `DebrisClusters[]`, `AttachToNearbyObjects`, `BreakablePartCount`, `NetworkIdCount` |
| `DestructionVolumeComponentData` + `DestructionVolumeData` | 1 | `Asset` → mask atlas, `BoundingBox`, `Impacts[]` (Vec4 = xyz + radius, hand-authored blast holes), `PartToImpactIndices[]` |
| `DestructionEdgeModelComponentData` + `EdgeModelLightMapData` | 0 or 1 (118/209) | `RigidMeshes[]` (rebar/edge decoration), `MaxInstanceCount`, per-instance lightmap UVs |

Required resources: a **`CompositeMeshAsset`** whose sub-meshes map 1:1 to `BreakablePartCount`, a
`HavokAsset` named `<Path>_Destruction_Physics_0_Win32` whose `ExternalAssets` chains to the debris
cluster's physics, and a `DestructionVolumeAsset` — of which **only 4 exist in the whole game**, so
that one is pick-from-list, not synthesise.

Runtime behaviour: damage accumulates per part; a part at 0 health detaches, spawns its FX and its
share of the debris cluster; `ConnectivityType_Full` (2,517 of 2,561 parts) means unsupported parts
above it fall too. The mesh is *cut* at runtime against the `Impacts` spheres, with the hole edges
textured from the volume atlas — this is why `DestructionMaterialEnable` is `True` on exactly **199**
mesh assets and `False` on 9,605.

Canonical example: `/home/powos/Projects/Venice-EBX/Architecture/ME_House01/ME_House01_Medium_Destruction.txt`
— 9 parts, 31 instances, 44 authored impact spheres, `NetworkIdCount 20`.

### 1.2 Bangers (impact-triggered breakaway props)

The cheap mechanism. **152 `BangerEntityData` assets.** A banger is a *separate blueprint* that a
static prop's death state spawns in its place.

```
BangerEntityData
    Scales, Mesh, Explosion, TimeToLive, UseVariableNetworkFrequency, DestructiblePartCount
```

That is the complete field set. The prop stays an ordinary `StaticModelEntityData`; the only
authoring delta on it is **one extra `HealthStateData`**:

```
HealthStateData 962B4DB2-F191-4C75-B0DB-79BE7CC2B562
    SpawnedBangerBlueprint Props/StreetProps/ConstructionFence_01/ConstructionFence_01Banger/E3B64BCE-…
    CopyDamageToBanger True
    PhysicsEnabled True
    Health 0.0
    PartIndex 4294967295          ← 0xFFFFFFFF = "the whole object"
    CanSupportOtherParts False
```
(`/home/powos/Projects/Venice-EBX/Props/StreetProps/ConstructionFence_01/ConstructionFence_01.txt`)

**A banger needs no per-part meshes.** It needs one intact `RigidMeshAsset` on the prop, one banger
`RigidMeshAsset` on the banger blueprint (both plain, `DestructionMaterialEnable False`), and one
dynamic `HavokAsset`. Total cost: two ~4.5 KB partitions. Two spawn shapes exist — via
`SpawnedBangerBlueprint` (27 assets), or via `ReferenceObjectData`s in the death state's `Objects[]`
(e.g. `/home/powos/Projects/Venice-EBX/Objects/Ashtray_01/Ashtray_01.txt`).

This is the single most important finding for §4: **the minimal authoring delta between a static
prop and a breakable one is one `HealthStateData` and one blueprint reference.**

### 1.3 Debris clusters (physics-driven rubble)

**728 `DebrisClusterData` assets.** A shared, reusable pool of pre-simulated rubble chunks, spawned
by breakables (1.1) and bangers (1.2) alike. Keyed fields: `CompositePartCount`,
`MaxActivePartsCount` (typically 50), `ClusterLifetime`, `PartHierarchy[]` of
`DebrisClusterPartInfoData` (each with `PartIndex`, `NumberOfChildren`, `SplitSpeedThreshold`,
`LinearVelocity`, `AngularVelocity`), plus a `Mesh` and a dynamic `PhysicsEntityData` at
`RigidBodyQualityType_DebrisSimpleToi`.

Crucially they are **shared assets referenced by path**, e.g.
`Architecture/FacadeClusters/ConcreteWall_Cluster_01` is used by many walls. A generator can
*reference* these freely — it just cannot make new ones with new geometry.

### 1.4 Death states on static props (the 1,697)

A second, cheaper destructibility axis that does **not** change the root entity type. The prop stays
`StaticModelEntityData` and adds a `Health 0.0` `HealthStateData` whose `Objects[]` point at a ruin
blueprint, a debris cluster, and/or FX. Optionally adds extra `PartComponentData` + `PartLinkData`
(a support graph — 254 assets use this, mostly fences) and flips `IsSupported`/`IsFragile`.

Clean A/B pair in the shipped data:
`Objects/FenceMetalBarbwire_02/FenceMetalBarbwire_02_256b.txt` (destructible: 4 `PartComponentData`,
7 `HealthStateData`, 2 `PartLinkData`) versus
`Objects/FenceMetalBarbwire_02/FenceMetalBarbwire_02_256b_indestructible.txt` (1, 1, 0).

### 1.5 Hero-building collapse (scripted, not simulated)

The set-piece "whole building falls down". Not a system at all — it is a `SpatialPrefabBlueprint`
gluing together three separate blueprints plus logic:

```
ME_House01_Medium_Destruction_Prefab
├─ ReferenceObjectData → …_Destruction        (breakable shell, §1.1)
├─ ReferenceObjectData → …_Destruction_Ruin   (plain StaticModelEntityData + ruin mesh)
├─ ReferenceObjectData → Animations/Characters/MP/Buildings/MEHouse01MediumRuin/…_Prefab
│                                              (the collapse is an ANIMATION)
├─ LogicReferenceObjectData → HavokDestruction/BC2DestructionLogic
├─ 6 × EffectReferenceObjectData (collapse dust/smoke FX)
└─ Delay / EventGate / Sequence / MathOp / Bool / Float entities + DamageAreaTrigger + ClearAreaTrigger
```

The collapse threshold is a plain `IntEntityData` with `Realm_Server, DefaultValue 4` — "four parts
destroyed and the house comes down". There is **no `AnimatedDestructionComponentData` in Venice at
all** (0 occurrences), despite the type existing in the schema. Every hero collapse is hand-wired
logic plus a skinned animation prefab.

### 1.6 Census

Counts are distinct dump files containing the token, over `/home/powos/Projects/Venice-EBX`
(73,475 `.txt` partitions, Venice build 1147186, 2013-02-14).

| Type | Files | Note |
|---|---:|---|
| `StaticModelEntityData` | 6,577 | 4,878 fully static; 1,697 have a death state |
| `PartComponentData` | 7,043 | baseline — on nearly every prop |
| `HealthStateData` | 7,033 | universal health container |
| `DebrisClusterData` | 728 | shared rubble |
| `PartLinkData` | 254 | support graph |
| **`BreakableModelEntityData`** | **209** | **every breakable building in BF3** |
| `BreakablePartComponentData` | 209 files / 2,561 parts | 1:1 with the above |
| `DestructionVolumeData` | 155 | |
| `BangerEntityData` | 152 | |
| `DestructionEdgeModelComponentData` | 118 | optional |
| `PredestructionEntityData` | 110 | **level partitions only**, never in an asset library |
| `DestructionVolumeAsset` | **4** | the entire game shares 4 mask atlases |
| `AnimatedDestructionComponentData` | **0** | schema type, unused in Venice |
| `DebrisSystemAsset` | **0** | schema type, unused in Venice |

Breakable part-count distribution (209 assets, 2,561 parts): 5 assets have 1 part, **37 have 2**,
median ≈ 8, tail out to 53. `NetworkIdCount ≈ 2 × parts + 2` — see §5.3.

---

## 2. What a destructible asset needs that a static one lacks

The exhaustive diff, from the cleanest A/B pair in the shipped data — same wall, same directory,
same author:

- static: `/home/powos/Projects/Venice-EBX/Architecture/WareHouse_System_01/WareHouse_InnerWall_Plain_01_512.txt` (8 instances, 4,878 B)
- breakable: `.../WareHouse_InnerWall_Plain_01_512_Destruction.txt` (16 instances, 11,341 B)

**2.1 The root entity type is replaced, not extended.** `StaticModelEntityData` →
`BreakableModelEntityData`. `RuntimeComponentCount` 1 → 5.

**2.2 Containers that appear only on the destructible:** `BreakableControllerComponentData` (×1),
`BreakablePartComponentData` (×N parts), `DestructionVolumeComponentData` + `DestructionVolumeData`,
`EdgeModelComponentData` + `EdgeModelLightMapData` (optional), `ReferenceObjectData` (×N, per-part
FX), `InterfaceDescriptorData` (so `OnDestroyed` can escape the blueprint), and on collapsing
buildings an `IntEntityData` collapse counter.

**2.3 Containers that disappear:** `PartComponentData` 1 → 0 and `HealthStateData` 1 → 0. The
breakable path has **no `Health` float at all** — it uses a per-part integer `HealthPercentage`.
This is a hard schema switch, not a superset.

**2.4 Values that change on shared types:**

| Field | Static | Destructible |
|---|---|---|
| `PhysicsEntityData.EncapsulatePartsInLists` | `False` | `True` |
| `RigidBodyData` (RBTypeCollision) `.Mass` | `0.0` | `1000.0` (5000.0 on a house) |
| `HavokAsset.ExternalAssets` | `*nullArray*` | → debris cluster's `PhysicsEntityData` |
| `ObjectBlueprint.Descriptor` | `*nullGuid*` | → `InterfaceDescriptorData` |
| `ObjectBlueprint.EventConnections` | `*nullArray*` | one per part, `OnDestroyed` (id `-1452333337`) |
| `ObjectBlueprint.InterfaceHasConnections` | `False` | `True` |
| Mesh asset class | `RigidMeshAsset` | **`CompositeMeshAsset`** |
| Mesh `DestructionMaterialEnable` | `False` | **`True`** |

**2.5 External assets that must exist** — and this is where it dies:

1. a **`CompositeMeshAsset` with N sub-meshes** matching `BreakablePartCount` ← **must be authored**
2. a compound **`HavokAsset`** for the fractured shape ← **must be authored**
3. a `DebrisClusterData` blueprint ← can reference an existing one ✅
4. a `DestructionVolumeAsset` ← only 4 exist; pick one ✅
5. N destruction FX blueprints ← reference existing ✅
6. optional edge-decoration meshes ← reference existing ✅
7. at building scale: a `_Ruin` blueprint, a `_Prefab`, `BC2DestructionLogic`, collapse FX, and an
   animated-collapse prefab ← items 1 and 2 recur here

Items 3–7 are reference rewiring, which we can do. **Items 1 and 2 are new geometry, which we
cannot.**

**2.6 Network replication.** Breakables carry `NetworkIdCount` on the controller (≈ 2 × parts + 2);
statics carry `NetworkIdCount 0` in `StaticModelNetworkInfo.PartNetworkIdRanges` (`First`/`Last` =
`0xFFFFFFFF`). Making an object destructible consumes network IDs from a level-global budget — §5.3.

**2.7 The dump has no geometry.** Venice-EBX is 73,475 text partitions and **zero binary files**.
Grep for `VertexBuffer|IndexBuffer|VertexStride|PrimitiveCount|MeshSubset|hkpRigidBody|hkShape`
across all of it: **0 hits**. A `MeshAsset` file carries LodGroup, materials and shader parameters
and nothing else; a `HavokAsset` carries a *name string* pointing at an `.hkx` in the cat/cas. The
dump specifies the EBX schema a generator must emit, and tells you how many parts a mesh must have —
it cannot tell you how to build them.

---

## 3. Can it be generated? — No. Here is the wall.

The appealing idea: post-process existing meshes, Voronoi-fracture them into parts, emit the
destruction EBX automatically. Step by step, honestly:

| Step | Status |
|---|---|
| 1. Read the source MeshSet + chunk | ✅ Rime does this — **lossily** |
| 2. Fracture the geometry (Voronoi / convex decomposition) | ✅ external, solved problem, not our bottleneck |
| 3. **Write a new MeshSet resource** | ❌ **not started, hard** |
| 4. **Write matching Havok collision per part** | ❌ **not started, harder** |
| 5. Emit the destruction EBX | ✅ Rime does this well |
| 6. Package into a bundle the game loads | ✅ Rime does this well |

### 3.1 Mesh writing: absent

The entire mesh public API is five methods, all Frostbite → interchange
(`/tmp/rime-src/RimeLib.Mesh/IMeshConverter.cs:9-27`): `ConvertToObj`, `ConvertToGltf`,
`ConvertToGlb`, `ConvertToMeshBuilders`, `ConvertToBlenderScript` (itself
`throw new NotImplementedException()` at
`/tmp/rime-src/RimeLib.Mesh.Frostbite2_0/MeshConverter.cs:477-480`), plus `GetChunkGuids`. **There
is no method that takes a mesh and produces a resource.** `MeshSetLoader` has no `MeshSetWriter`
counterpart. Grep for `IMeshWriter`, `MeshSetBuilder`, `ImportMesh`, `ModelRoot.Load`: zero hits —
there is no import path even stubbed out.

The `Serialize` methods that *do* exist on the layout structs are structurally incapable and are
dead code. `/tmp/rime-src/RimeLib.Mesh/Frostbite/Fb2/MeshSetLayout.cs:87-114` writes
`s_Lod.BaseAddress` / `Name.BaseAddress` — i.e. **the raw file offsets it read from the source
file**, with no pointer fixup, no reloc table, no string table. And the pointer primitive itself
cannot serialize:

```csharp
// /tmp/rime-src/RimeLibLite/Frostbite/Core/RelocPtr.cs:38-47  (verified by direct read)
public bool Serialize(RimeWriter p_Writer)
{
    throw new NotImplementedException();
}
```

`RelocArray.Serialize` writes only `Count` and `BaseAddress`, never the array contents
(`/tmp/rime-src/RimeLibLite/Frostbite/Core/RelocArray.cs:151-157`). `MeshSetLayout.Serialize` is
never called by anything in the repository.

Compare textures, which **do** have an authoring path:
`/tmp/rime-src/RimeLib.Texture/Generation/ITextureGenerator.cs:11-20` —
`GenerateFromDDS(RimeReader, TextureAttributes, RimeWriter, out Dictionary<GUID, Stream> chunks)`:
external file in, Frostbite resource + chunks out. **`RimeLib.Mesh/Generation/` does not exist**
(verified: `ls` → no such directory). The template is right there, unimplemented.

The one bright spot: `GeometryDeclarationDesc.Serialize`
(`/tmp/rime-src/RimeLib.Mesh/Frostbite/GeometryDeclarationDesc.cs:230-256`) is real and correct —
16 elements, 4 streams, engine limits enforced, Fletcher32 hash computed. Vertex declarations and
strides **are** writable. Everything around them is not.

Reading is also narrower than it looks: the converter handles LOD 0 only
(`MeshConverter.cs:132-135`), `MeshSubsetCategory.Opaque` only (`:345-346`), 16-bit `TriangleList`
only (`:376-389`), and extracts only Position + TexCoord0 (`:413-457`) — normals, tangents and skin
weights are parsed then discarded. **A fracture pipeline round-tripping through this exporter would
lose normals, tangents and UV1+ before it ever hit the write problem.**

### 3.2 Havok writing: absent, and the MOPP problem is fatal

The entire Havok public API is **one method**:
`IEnumerable<hkpTransform> GetTransforms(...)` (`/tmp/rime-src/RimeLib.Havok/IHavokConverter.cs:5-8`).
Rime's structural understanding of Havok amounts to "where are the instance transforms".

`HavokPhysicsData.Serialize` and `HavokInstance.Serialize` are both
`throw new NotImplementedException()`
(`/tmp/rime-src/RimeLib.Havok.Frostbite2_0/HavokPhysicsData.cs:291-299` and `:118-126`). The
low-level `hk*` classes have **no write methods at all**. The shape data is opaque:
`/tmp/rime-src/RimeLib.Havok/hkpExtendedMeshShape.cs:7-10` is `byte[] Header1 = new byte[200]`,
`int IndexCount`, `byte[] Header2 = new byte[36]`, `List<hkpTransform>` — 200 bytes of un-decoded
header, vertex/triangle arrays never reached. No convex hull generation, no primitive construction,
no MOPP compiler.

The only Havok mutation in the whole toolkit is
`/tmp/rime-src/RimeLib.Cmd/Commands/BundleBuilding/RaiseWaterPhysicsCommand.cs` — heuristic in-place
byte patching that finds vertices by scanning for "the longest run of consecutive 16-aligned Vec4
with w==0 near the water level" (`:216-235`). Its own comment at `:16` states the crux:

> *"The MOPP tree is relative, so it needs no recompile."*

That sentence exists **because Rime cannot recompile a MOPP tree**. Translating existing geometry is
the only Havok edit possible without one. **Fracturing changes topology, which invalidates the
MOPP** — the dodge that command relies on is exactly the dodge fracturing cannot use. MOPP
compilation is a Havok SDK feature. It is not going to be reimplemented in a side project.

### 3.3 What Rime *can* do — and it is a lot

Do not read the above as "Rime is useless". It is a mature *container* toolkit:

- **EBX authoring: VERIFIED YES.** `/tmp/rime-src/RimeLib.Serialization.Frostbite2_0/Ebx/EbxWriter.cs`
  is a complete 483-line serializer — type/string tables, import entries, instance sorting, internal
  vs external ref resolution — with no `NotImplementedException` anywhere in the file. Full
  round trip exists: `dump_partition_json` → edit → `add_json_partition`
  (`/tmp/rime-src/RimeLib.Cmd/Contexts/BundleBuildingContext.cs:298-311`).
- **Bundle / superbundle / cat+cas writing: VERIFIED YES.**
  `/tmp/rime-src/RimeLib.Content/Building/SuperbundleBuilder.cs:66` writes real `.sb`/`.toc`;
  `CasAndCatalogBuilder`, `CasCatalogWriter`, `DeltaBundleWriter` all present and non-stub.
- `replace_resource` will happily ship a MeshSet you built with some *other* tool
  (`/tmp/rime-src/RimeLib.Cmd/Commands/BundleBuilding/ReplaceResourceCommand.cs:28-64`). Rime just
  won't build it for you.
- **`add_dds_texture` is the only "external asset → Frostbite resource" command in the entire
  toolkit.** There is no `add_mesh`, `add_gltf`, `replace_mesh` or `add_collision`.

Caveat on the EBX confidence: there are only four test files in the repository and
`grep -rli roundtrip` returns zero hits. EBX write is rated VERIFIED on code-path evidence and on
NoHavokGen shipping it in production — not on test evidence.

### 3.4 The NoHavokGen precedent — what it actually proves

[BF3RM/NoHavokGen](https://github.com/BF3RM/NoHavokGen) is the closest existing bulk-transformation
precedent, and its lesson is precisely the one above.

It converts BF3's baked `StaticModelGroupEntityData` (thousands of props merged into one entity with
one monolithic collision hull, individually unselectable) into one `ReferenceObjectData` per
instance pointing at that prop's **already-shipped** `ObjectBlueprint`. Offline it emits 41
superbundles (~20 MB, ~131,926 objects, largest map ~7,017); at runtime a ~147-line VEXT script
mounts them, calls `memberDatas:clear()` on the baked group, and injects a `SubWorldReferenceObjectData`.

Generated superbundles contain **only EBX partitions** — `bundles.py:37-43` issues just
`build_bundle` / `add_json_partition` / `build`, never a resource or chunk import. Confirmed on the
deployed artifact: `strings` on the generated `.sb` yields one partition name plus EBX type names
and **zero** mesh/`.res`/havok strings.

The decisive evidence is a *negative*: when the mod needs an object at a scale whose collision hull
was not pre-baked, **it cannot make one** — it snaps to the nearest authored scale or drops the
instance entirely (`ebx_json.py:203-227`). There is a commit whose message is literally
*"fix the addition of assets that don't have any valid scale, resulting in crashes on some maps"*.

> **Verdict: NoHavokGen proves that references to existing assets can be rewired in bulk at the
> scale of ~130k objects. It proves nothing about authoring new geometry, because it authors none.**

Two more transferable lessons: it had to raise client timeouts to 50 s because turning ~7k baked
instances into real entities blows past stock level-load timeouts, and it had to **disable network
IDs entirely** (`needs_network_id` computed then hardcoded `False`, `ebx_json.py:143-144`) after a
commit titled *"fix crash/desync state when destroying nohavok objects"*. Both bear directly on §5.

---

## 4. What is achievable without new mesh data

Ranked by payoff-per-effort. This is the actually-shippable roadmap.

### 4.1 Runtime damage & impulse API — days, high payoff, zero new data

**Completely unexploited today.** None of the six local mods use any of it. The VU type registry
exposes on `ServerPhysicsEntity`:

```lua
PhysicsEntity(entity)
  :ApplyDamage(DamageInfo)                 -- damage/destroy a breakable NOW
  :SetActiveHealthState(HealthStateAction) -- force OnKilled / OnCriticallyDamaged / OnHealthy
  :ApplyImpulse(ImpulseData)               -- position, direction, force, type
  :ReenablePart(partId)                    -- in the binary, absent from the docs
  .internalHealth                          -- read AND write
  :RegisterDamageCallback / RegisterCollisionCallback / RegisterImpulseCallback
```

`DamageInfo()` has 17 writable fields including `shouldForceDamage`, `includeChildren`,
`isDemolitionDamage` and `isExplosionDamage` — exactly the flags needed to push a breakable through
its health states regardless of normal damage arbitration.
`EntityManager:GetIterator("ServerPhysicsEntity")` enumerates every candidate in the level, and
raycasting returns `RayCastHit.rigidBody` directly, so *look at a wall → raycast → damage it* is a
complete loop with no baked data.

What this buys MapEditor: a "destroy this" / "damage by N" / "reset" tool for every object that is
*already* destructible, a `demolish all` command, per-object health inspection in the inspector, and
scripted destruction for map authors. It does not make anything new destructible — it unlocks what
the level already ships. Given 209 breakable assets placed many times across 41 maps, that is a lot
of already-present content nobody can currently trigger.

Note MapEditor's existing lever is the opposite one:
`ext/Shared/Patches/HealthStatePatcher.lua:10-14` sets `health = 10000000` on **every**
`HealthStateData` in the partition — a global "make everything indestructible" switch. Making that
bidirectional and per-object is a natural first slice.

### 4.2 Static → banger conversion — 1–2 weeks, high payoff, broad

The pragmatic win, and it follows directly from §1.2: the authoring delta is **one `HealthStateData`
plus one blueprint reference**.

At `Partition:Loaded`, for a chosen static prop:

1. `MakeWritable()` its `PartComponentData`
2. construct a new `HealthStateData()` with `Health = 0.0`, `PartIndex = 0xFFFFFFFF`,
   `SpawnedBangerBlueprint = <an existing banger ObjectBlueprint>`, `CopyDamageToBanger = true`,
   `PhysicsEnabled = true`, `CanSupportOtherParts = false`
3. `healthStates:add(...)`
4. give the alive state a finite `Health` (statics often ship effectively invulnerable)

Every API in that list is verified-exposed (§4.5). The catch is step 2's blueprint reference: the
banger's mesh should resemble the prop, or the prop visibly morphs when shot. Options in increasing
fidelity:

- reuse the prop's **own** intact mesh on a generated banger blueprint — the whole prop tips over
  and falls as one rigid body. **No new geometry.** Visually this is BF3's own fence/sign behaviour.
- reuse one of the 152 shipped bangers where the silhouette roughly matches — a curated table.
- attach an existing `DebrisClusterData` so it also throws rubble — 728 to choose from, referenced
  by path, free.

The first option is the general one and needs **zero** new mesh data: a `BangerEntityData` needs only
`Mesh`, `Explosion`, `TimeToLive`, `UseVariableNetworkFrequency`, `DestructiblePartCount`, plus a
`PhysicsEntityData` with a `RigidBodyMotionType_Dynamic` body. The prop's existing `HavokAsset` can
be reused as the dynamic body's collision — it is the same shape, just no longer fixed. **That last
sentence is the highest-value unverified claim in this document; see §8, experiment E2.**

⚠ **Known landmine.** `BangerEntityData` blueprints are explicitly blacklisted from MapEditor's
level-injection path as crash-prone:
`ext/Shared/Modules/LevelInjector.lua:513-533` — *"Filter BangerEntityData (crashes when injected
this way), same as MapLoader."* That is the ROD-injection path, **not**
`CreateEntitiesFromBlueprint`, and not the death-state path proposed here — but it is a clear
warning that bangers have sharp edges. Experiment E1.

### 4.3 Static → dynamic physics prop — days, medium payoff

Flip `RigidBodyData.MotionType` from `RigidBodyMotionType_Fixed` to `_Dynamic` (and
`QualityType` to a debris quality) on the prop's `PhysicsEntityData` before instantiation. The prop
becomes shovable and explodable-away rather than breakable. No new data at all.

Caveats: **you cannot add physics to a `StaticModelEntity` after it exists** —
`belongsInPhysicsWorld` is read-only and a `StaticModelEntity` is not a `PhysicsEntity`, so there is
no `physicsEntityBase` to `AddToWorld()`. It must be done pre-spawn, at `Partition:Loaded`. And a
dynamic body needs network sync to stay consistent between clients — see §5.3, and note NoHavokGen's
scar tissue about exactly this.

### 4.4 Reuse existing breakable blueprints — 1–2 weeks, narrow

Swap a static wall for one of the 209 authored breakables of similar dimensions. Fully within
existing capability — it is a reference swap, exactly what NoHavokGen does. Deliverable is a
**catalogue**: for each of the 209, its bounding box, part count, material family and network cost,
plus a matcher. Realistically this covers walls and facades in a handful of material families
(concrete, brick, plaster) at the specific sizes DICE authored, and nothing else. Worth doing as a
MapEditor asset-browser feature ("replace with destructible equivalent"), not as an automatic pass.

Damage-state **material** swaps are *not* an available shortcut, incidentally: BF3 does not do
destruction via material variation. `MeshVariationDatabase` (831 files, 241,617 entries) is a
weapon-camo and vehicle-skin system keyed by `VariationAssetNameHash`; none of its entries are
destruction-state related. `DestructionMaskVolume` appears 246 times and is `*nullGuid*` in **100%**
of them. There are burn/damage shader parameters (`BurnedTexture` ×2,228, `DamageMask` ×34) but they
are surface states, not structural ones.

### 4.5 Verified API surface these rest on

New instances of arbitrary types **can** be constructed — this was the decisive open question, and
there is direct precedent in this repository:

```lua
-- ext/Shared/Patches/DynamicModelPatcher.lua:12,37
local s_ReplacementData = StaticModelEntityData(p_DynamicModel.instanceGuid)
-- ...populate fields...
s_Instance:ReplaceReferences(s_ReplacementData)   -- live type swap of an entity's data
```

Same pattern in `VegetationPatcher.lua:12` and `MeshProxyPatcher.lua:12`. `Type()`, `Type(guid)` and
`Type(other)` constructors exist for every `fb` type; `DatabasePartition` exposes `AddInstance` /
`RemoveInstance` / `ReplaceInstance`; arrays support `:add(x)`, `:clear()` and indexed assignment
(NoHavok's `memberDatas:clear()` deletes all baked static geometry at load time).
`Partition:CreateInstance` does **not** exist — you don't need it, the constructor does it.

Limits, all verified: cannot clone a lazy-loaded instance (hard native error — `RegisterLoadHandlerOnce`
first); cannot change an existing instance's type in place (use new-instance + `ReplaceReferences`
with the same GUID); mutations must happen during `Partition:Loaded` before instantiation, and once
entities exist MapEditor's only recourse is destroy-and-re-instantiate; `MakeWritable` on a shared
instance affects **every** user of it.

**Not exposed — do not plan around these:** `BreakableModelEntity`, `BangerEntity`,
`PredestructionEntity`, `DebrisClusterEntity`, `DestructionVolumeEntity` — **no runtime entity
classes exist for any destruction type, they are Data-only.** No per-part runtime handle. No
`ServerDamageEvent`/`ClientDamageEvent` types. No API to spawn a `DebrisCluster` directly, none to
author `CompositeMeshAsset` or `DestructionVolumeAsset` geometry at runtime, none to add physics to
a `StaticModelEntity` after it exists.

---

## 5. Cost and blast radius

*A design that cannot ship is not a design.* Here is what shipping would cost.

### 5.1 Bundle size — not the problem

NoHavokGen's real numbers: ~131,926 objects → 20 MB of `.sb` total, i.e. **~160 bytes of EBX per
object** (SP_Bank: 10.7 KB / 42 objects; MP_Subway: 1.11 MB / ~6,992). Destruction EBX is fatter —
the minimal breakable wall is 11,341 B versus 4,878 B static (×2.3), and a banger adds two ~4.5 KB
partitions — but a banger conversion pass over even 5,000 props is on the order of tens of MB. **EBX
volume is not the constraint.** New *mesh* data would be, but we cannot make any, which
inadvertently caps this cost.

### 5.2 Level load — the first real wall

NoHavokGen had to raise `loadedTimeout`/`loadingTimeout`/`ingameTimeout`/`timeoutTime` to **50
seconds** because turning ~7k baked instances into real entities blows past stock timeouts, and it
still shipped a release note *"Fixed client timeout when loading on some maps"*. Any destruction
pass runs **on top of** NoHavok on those maps, converting a subset of those same ~7k entities into
heavier ones. Load time is the first thing that will break, and there is not much headroom left.

Mitigation NoHavokGen already demonstrates: bucket objects into one `WorldPartData` per prop type so
Frostbite gets streaming and culling granularity instead of one flat list.

### 5.3 Network — the hard wall

This is what kills the naive "make everything destructible" version.

- Static objects ship `NetworkIdCount 0` with `PartNetworkIdRanges` = `0xFFFFFFFF`. Destructibles
  consume IDs from a **level-global budget**.
- Measured on the 209 shipped breakables: `NetworkIdCount ≈ 2 × parts + 2`. A 2-part wall costs 6;
  the 9-part house costs 20; a 19-part wall costs 40; the tail reaches 78.
- A banger is cheaper — `NeedNetworkId True` on the banger blueprint, `NetworkIdCount 1` on the
  parent prop — but it is not free, and once spawned it is a **dynamic networked rigid body** with
  `UseVariableNetworkFrequency` streaming its transform until `TimeToLive` expires.
- NoHavokGen's scar tissue is directly on point: it computes `needs_network_id` and then **hardcodes
  it to `False`** (`ebx_json.py:143-144`), immediately after a commit titled *"fix crash/desync state
  when destroying nohavok objects"*. Networked-ID objects were the failure mode; the fix was to stop
  issuing network IDs. **A destruction feature cannot take that escape hatch — destruction must be
  networked or clients disagree about what the map looks like.**

**Consequence:** converting all ~4,878 static assets, or all ~7,000 instances on a large map, is
not shippable. Budget-bounded conversion is. The design must be: a per-map budget of N destructible
conversions, spent on the props players actually shoot at, with the count tunable and the rest left
static. Establishing the real value of N requires measurement — experiment E3.

### 5.4 Server CPU and physics

Every converted prop that becomes a dynamic body is a Havok body the server simulates and
replicates. Debris clusters bound themselves (`MaxActivePartsCount` typically 50, `ClusterLifetime`
60 s, `RigidBodyQualityType_DebrisSimpleToi`) — DICE's own tuning is the evidence that unbounded
debris was never viable. Bangers self-limit via `TimeToLive` (20–40 s in shipped assets). Any
generated conversion must inherit these caps rather than invent new ones. Unmeasured locally —
experiment E4.

### 5.5 Interaction with existing systems

MapEditor's `HealthStatePatcher` currently makes **everything** indestructible
(`ext/Shared/Patches/HealthStatePatcher.lua:10-14`, dispatched from `Patches/Patches.lua:39-40`).
Any destruction feature must coordinate with it or it will be silently neutralised. Likewise
`DynamicModelPatcher` / `VegetationPatcher` / `MeshProxyPatcher` already rewrite entity data types at
`Partition:Loaded` — a destruction patcher joins the same queue and ordering will matter.

---

## 6. Phased plan

**Phase 1 — unlock what already exists (days).** A server-side destruction module wrapping
`ServerPhysicsEntity:ApplyDamage` / `SetActiveHealthState` / `ApplyImpulse` / `internalHealth`.
MapEditor tools: damage/destroy/reset an object, "demolish all", health readout in the inspector.
Make `HealthStatePatcher` bidirectional and per-object rather than a global invulnerability switch.
Zero new data, zero risk of the §5 walls. Ship this regardless of what happens to the rest.

**Phase 2 — prove the banger path on one prop (1–2 weeks).** Run experiments E1 and E2 (§8). If a
generated banger blueprint reusing the prop's own mesh and Havok asset works, this is the feature.
If bangers crash the way `LevelInjector` warns, fall back to 4.3 (dynamic-physics props), which is
strictly simpler and shares most of the plumbing.

**Phase 3 — budgeted bulk conversion (weeks).** A MapEditor pass that converts a *selected,
budget-capped* set of static props per map, following NoHavokGen's proven shape: offline-generated
EBX, `WorldPartData` bucketing, mounted at `Level:LoadResources`. Measure load time and network
saturation continuously (E3, E4). The output is a per-map conversion list, not a global switch.

**Phase 4 — breakable catalogue (weeks, optional).** Index the 209 shipped breakables by bounding
box, part count, material family and network cost; offer "replace with destructible equivalent" in
the asset browser. Narrow but high fidelity where it hits.

**Phase 5 — real fracture generation. Blocked.** Requires, in order: a Frostbite 2 MeshSet
serializer (reloc table, pointer fixups, string table, chunk packing — the read-side structs in
`/tmp/rime-src/RimeLib.Mesh/Frostbite/Fb2/` are a genuinely good spec to build against), *and* a
Havok packfile writer with a MOPP compiler. The second is the true blocker and is Havok SDK
territory. Do not start Phase 5 expecting to finish it. A partial escape hatch worth noting: if
fragments reuse the **parent's unmodified collision**, they collide as the whole object — visually
wrong, but it sidesteps MOPP entirely. Whether that is acceptable is a design call, not a technical
one.

---

## 7. Verified vs inferred

**Verified — code read directly, or counted in the dumps:**

- `RelocPtr.Serialize` throws `NotImplementedException`; `RelocArray.Serialize` writes only
  `Count`/`BaseAddress`; `IMeshConverter` has no write method; `IHavokConverter` has exactly one
  method; `RimeLib.Mesh/Generation/` does not exist while `RimeLib.Texture/Generation/` does. **All
  five re-verified by direct file read for this document, not taken on report.**
- `HavokPhysicsData.Serialize` / `HavokInstance.Serialize` throw
  (`RimeLib.Havok.Frostbite2_0/HavokPhysicsData.cs:291-299`, `:118-126`).
- The `RaiseWaterPhysicsCommand.cs:16` comment about the MOPP tree needing no recompile.
- Rime's EBX writer and bundle/cas writers exist and are non-stub; `add_dds_texture` is the only
  external-asset import command.
- All census counts in §1.6, re-run independently: 209 `BreakableModelEntityData`, 152
  `BangerEntityData`, 6,577 `StaticModelEntityData`, 2,561 total breakable parts, part-count
  distribution, `NetworkIdCount` distribution.
- The §2 static-vs-breakable diff, from the `WareHouse_InnerWall_Plain_01_512` A/B pair.
- Venice-EBX contains zero binary files and zero vertex/index/hkShape tokens.
- `AnimatedDestructionComponentData` and `DebrisSystemAsset` have **0** occurrences in Venice;
  `DestructionMaskVolume` is `*nullGuid*` in 100% of its 246 occurrences; only 4
  `DestructionVolumeAsset`s exist.
- NoHavokGen emits EBX-only superbundles (confirmed by `strings` on the deployed `.sb`), hardcodes
  `needs_network_id = False`, and drops instances lacking a pre-baked collision scale.
- The VU exposed/not-exposed API lists in §4.5, from the `veniceext.dll` type registry
  cross-checked against docs.veniceunleashed.net.
- `LevelInjector.lua:513-533` blacklists `BangerEntityData` from ROD injection.
- `DynamicModelPatcher.lua:12,37` constructs a new instance and `ReplaceReferences` it — the
  new-instance-of-arbitrary-type precedent.

**Inferred / not verified — probe before acting:**

- That a prop's existing fixed `HavokAsset` can be reused as a **dynamic** rigid body's collision
  (§4.2). Highly plausible — it is the same shape with a different motion type — but unverified, and
  the whole cheap banger path rests on it.
- That adding a `Health 0.0` + `SpawnedBangerBlueprint` health state to a shipped static prop at
  `Partition:Loaded` actually produces working destruction rather than a crash. The `LevelInjector`
  banger blacklist is a warning sign about a *different* code path; whether it generalises is unknown.
- Whether `BangerEntityData` blueprints survive `CreateEntitiesFromBlueprint` (as opposed to ROD
  injection, where they demonstrably do not).
- The real per-map budget N for destructible conversions (§5.3). Entirely unmeasured.
- Server CPU and bandwidth cost per converted prop (§5.4). Entirely unmeasured.
- Whether `ReenablePart` (present in the binary, absent from the docs) works, and whether it offers
  a "repair" primitive.
- Whether a `BreakableModelEntityData` constructed from scratch at `Partition:Loaded` instantiates at
  all when its `Mesh` is a plain `RigidMeshAsset` rather than a `CompositeMeshAsset`. If it degrades
  gracefully (accepts damage, vanishes, no parts) that is a *third* cheap path worth having. If it
  crashes, the answer is bangers.

---

## 8. Experiments another session should run

None of these were run for this document — the server and client were in use by another session, and
this is a research task. Each is small and decisive.

- **E1 — banger sanity.** Spawn a shipped banger blueprint
  (`Props/StreetProps/ConstructionFence_01/ConstructionFence_01Banger`) via
  `EntityManager:CreateEntitiesFromBlueprint` at a transform in front of the player. Does it appear,
  fall, and despawn after `TimeToLive`? This isolates whether the `LevelInjector` banger blacklist
  is path-specific or fundamental.
- **E2 — the cheap banger path (the decisive one).** At `Partition:Loaded`, take one shipped static
  prop, add a `HealthStateData` with `Health = 0.0`, `PartIndex = 0xFFFFFFFF` and
  `SpawnedBangerBlueprint` pointing at a generated `BangerEntityData` that reuses **the prop's own
  mesh and its own `HavokAsset`** with `RigidBodyMotionType_Dynamic`. Shoot it. If it tips over and
  falls, §4.2 is the feature and Phase 2 succeeds.
- **E3 — network budget.** Convert an increasing number of props on one map (10, 50, 200, 1000),
  destroy them all at once with a scripted `ApplyDamage` sweep, and watch for desync, network-ID
  exhaustion and client timeouts. Produces the value of N in §5.3.
- **E4 — load and CPU.** Measure level load time and server frame time on a large NoHavok map
  (MP_Subway, ~6,992 objects) before and after conversion at the E3 budget levels.
- **E5 — runtime damage sweep.** `EntityManager:GetIterator("ServerPhysicsEntity")` + `ApplyDamage`
  with `shouldForceDamage`/`includeChildren` over an entire map. Confirms Phase 1 in one command and
  incidentally shows how much already-destructible content each map ships.
- **E6 — degenerate breakable.** Construct a `BreakableModelEntityData` from scratch with a plain
  `RigidMeshAsset`. Does it instantiate, and how does it fail? (§7, last inferred item.)

Use `tools/e2e/mapeditor_e2e.py` for anything requiring in-game verification. Note that ext changes
of this kind need a **full server restart**, not `ReloadExtensions`.

---

## 9. Related

- `docs/entity-wiring-and-networking.md` — connection structures, realms, and why spawned objects
  lose their external wiring. Directly relevant: a breakable's `OnDestroyed` escapes its blueprint
  through an `InterfaceDescriptorData`, and hero collapses are level-bus logic.
- `docs/bake-pipeline.md` — how baked content reaches the game; any Phase 3 offline generator ships
  through this path.
- `docs/prefab-overrides.md` — the clone-on-edit override system a per-object destructibility flag
  would live in.
- [BF3RM/NoHavokGen](https://github.com/BF3RM/NoHavokGen) — the bulk-transformation precedent, and
  the source of the load-time and network-ID warnings in §5.
