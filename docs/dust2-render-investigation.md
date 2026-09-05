# Why dust2 does not render — investigation state

Status: **custom geometry still does not draw in-game.** The process-killing crash is fixed and the
fault is narrowed to one step: the engine constructs the entity and never draws it.

Read this before touching the dust2 pipeline again — most of the obvious hypotheses are already
eliminated by measurement, and repeating them costs a rebuild + Rime + server restart each.

## The crash (SOLVED)

Instantiating our ObjectBlueprint terminated the process, every time. The minidump named it:

    exception  0xC0000005 ACCESS_VIOLATION
    params[0]  8              -> DEP / EXECUTE violation
    fault      0x51472861     -> in NONE of the 84 loaded modules
    EIP        ntdll+0xD680   (the raise path, not the fault site)

An execute violation at an address in no module is a call through an uninitialised function
pointer. Cause: `build_dust2.py` emitted **`RigidMeshEntityData` (5 fields)** where BF3 uses
**`StaticModelEntityData` (16 fields)** for placed static geometry. Found by a type census of our
blueprint partition against the shipped `Objects/LoadingPallet_01` one:

    VANILLA: ObjectBlueprint, StaticModelEntityData, PhysicsEntityData, HealthStateData x2,
             RigidBodyData x2, ReferenceObjectData x2, PartComponentData, HavokAsset x2
    OURS:    ObjectBlueprint, RigidMeshEntityData

After the fix: `OURS SURVIVED, entities=1` on **both** realms, where it previously read
`SERVER DEAD` on every run. Note the builder had *tried* StaticModelEntityData before and abandoned
it ("killed the server at Creating material grid") — but that attempt carried the same five fields.
The type was right; the payload was not.

## Seven builder defects fixed (all verified against shipped data)

| field | was | shipped |
|---|---|---|
| entity data type | `RigidMeshEntityData` | `StaticModelEntityData`, 16 fields |
| `StreamRealm` on both placements | `None` | `Both` |
| `aux_vertex_index_data_offset` | `0` (dataclass default) | `0xFFFFFFFF` (98.1% of 2755 LODs) |
| `StreamingEnable` | `false` | `true` |
| `CullScreenArea` | `0.0` | `0.02` |
| shader constants | absent | `FresnelExponent`, `SpecularScale` = 0.5 |
| `MeshVariationDatabase.Name` | absent | present on every shipped MVDB |

None of them made it render. All are still correct and should stay.

## Eliminated by controlled test — do not re-test these

Every run used a control (`Characters/Soldiers/MpSoldier`, 13 entities) that passed throughout.

- **Mesh complexity / material count.** A 10 m, 72-triangle, 4-material Minecraft Steve built
  through the identical pipeline is *equally invisible*. Also tested dust2 at 4 materials vs 91.
- **Placement route.** Four of them: sub-level `SubWorldReferenceObjectData`, a direct
  `ReferenceObjectData` on the level, a runtime `CreateEntitiesFromBlueprint`, and minimal-mod.
- **Other mods interfering.** Ran with only `Blank_Level_Test` + `Dust2` (no MapEditor, no
  CustomComponents/bots). No change.
- **Sub-level structure.** Field-identical to REALITYMOD's own `teamdeathmatch` and `tdm2`, which
  both work. (This is also how we learned the working ones carry `blueprint = nil`.)
- **EBX asset chain.** At runtime: `mesh asset resolves: RigidMeshAsset / lodGroup=MeshLodGroup /
  materials=N`, on both realms.
- **MeshSet geometry.** The corpus-proven decoder validates our output: 0/N subsets with problems,
  no out-of-range indices, no NaNs, no block overruns.
- **Resource meta / relocation table.** `f0+f1+f2 == len(payload)` holds; 1199/1199 corpus
  resources reproduce byte-identically, and the relocation table is part of that payload.
- **Name hashing.** `fnv1` matches shipped `NameHash` exactly on lowercased names (verified against
  two shipped assets). Our names are already lowercase.

## What is NOT yet known

Whether a **draw call is submitted** for our mesh. That single bit splits the remaining space:

- not submitted -> resource registration or MVDB binding
- submitted but invisible -> shader, transform, or culling

A RenderDoc frame capture answers it directly. Nothing else measurable from Lua or the logs
distinguishes the two, which is why the field-by-field search stalled.

## The method that worked

Diffing our EBX against the shipped equivalents in `/home/powos/Projects/Venice-EBX` (full vanilla
EBX text tree, 831 MVDBs among it). A **type census** found `StaticModelEntityData`; a **field
census** found the MVDB `Name`. Both were invisible to field-value guessing.

Still not diffed that way: the world/sub-level partition, and the mesh partition's relationship to a
*shared* lodgroup (vanilla references `lodgroups/Xenon_SkipAndStreamNoLODs`; we author a private
`MeshLodGroup` to avoid a cross-bundle dependency — deliberate, unverified).

## Reproducer

`/tmp/dust2/steve.obj` — 48 verts, 72 tris, 4 materials, built by the generator in the session log.
Runs the whole OBJ -> MeshSet -> EBX -> bundle -> in-game loop in seconds instead of minutes. Use
this, not the 3 MB map, when testing the render path.

    DUST2_MAX_MATERIALS=N   caps material groups in build_dust2.py, for scale tests.

## Process note

Five rebuild-and-restart cycles were spent guessing individual field values before anyone opened
the crash dump that named the fault in one step. The dump is written on every crash to
`…/AppData/Local/VeniceUnleashed/dumps/*.dmp`. Read it first.

## The shaderdb hypothesis (STRONGEST OPEN LEAD — test is built and unread)

A Frostbite material is only drawable if a **compiled shader permutation** for it exists in a
shaderdb the level loads. Our bundle ships a MeshSet, EBX and textures but **no shaderdb** — it only
`reference_existing_partition`s the shader *graph*, which is the authoring asset, not the compiled
permutation.

MEASURED:

    Objects/Shaders/PropPreset            -> present in ALL 49 shipped level shaderdbs
    levels/realitymod/realitymod/shaderdb -> "Could not find shaderdb resource"

That fits every symptom, including the ones that defeated the field-level search: the entity
constructs, the asset chain resolves, the geometry is valid, the textures load, and nothing is
rasterised — independent of mesh size, which is why a 72-triangle Steve behaved exactly like the
41570-triangle map. Moving to MP_001 does not fix it on its own: that level's shaderdb holds
permutations for *its* materials, not for the brand-new `MeshMaterial` instances we author.

### The test that is built but not yet observed

`DUST2_BORROW_MATERIAL=1` makes `build_dust2.py` point `RigidMeshAsset.Materials` and every MVDB
entry at a **shipped** MeshMaterial —
`objects/loadingpallet_01/loadingpallet_01_mesh` instance `12441907-0289-11de-abc3-810b95555a08` —
and adds `reference_existing_partition objects/loadingpallet_01/loadingpallet_01_mesh`. MP_001
places that prop, so its permutation is compiled into the level's shaderdb.

    DUST2_BORROW_MATERIAL=1 python3 tools/usd/build_dust2.py \
        /tmp/dust2/steve.obj /tmp/dust2/refs/tires.meshset /tmp/dust2/mat <out> mp001

Currently deployed on MP_001 with a 10 m Steve placed at (0, 74, 20) — the spawn point itself, so
facing cannot hide it.

- **Steve visible** -> the missing shader permutation was the cause. Custom meshes then need either
  a shaderdb in the bundle, or materials that reuse an already-compiled permutation.
- **Steve absent** -> the shaderdb is ruled out too, and the next step is a RenderDoc capture to see
  whether a draw call is submitted at all.

Screenshot capture is unreliable here: the game is a native Wayland window (invisible to xdotool /
wmctrl), and the fixed crop region used earlier goes stale whenever the desktop layout changes —
it silently captures whatever else is on screen instead.
