# Baking a MapEditor save into a playable level

How a save becomes a loadable Venice Unleashed mod, what survives the trip, and how to run the
whole thing on Linux. Everything here was established by running it, not from upstream docs.

---

## 1. The pipeline

```
MapEditor (in-game)
  └─ save  ──────────────► mod.db          project_header + project_data (+ project_ebx)
       │
       ├─ tools/export_save.py ──────────► in/map_saves/<name>.json   {"header":…, "data":[…]}
       │
       └─ LevelLoaderGen (BF3RM)
            ├─ ebx_json.py    save  ─────► intermediate/ebx_json/<map>/<gamemode>.json
            ├─ bundles.py     EBX   ─────► Rime ─► sb/Win32/CustomLevels/<map>/<map>.{sb,toc}
            └─ mod_generator.py     ─────► mods/rm-levelloader/  (mod.json + ext + sb)
```

The generated mod goes in `Server/Admin/Mods` and is enabled in `Admin/ModList.txt`.

`RMLevelLoaderGen` is the *input data* repo (map saves + `gamemode_map.json`); `LevelLoaderGen` is
the generator, pulled in as a submodule.

---

## 2. Toolchain on Linux — no wine required

The commonly circulated `RimeREPL.exe` is a Windows binary from a personal file host, last modified
**2023-12-31**. Don't use it. Rime is open source and its REPL targets `net8.0` — only the WPF GUI
is `net8.0-windows` — so it builds and runs as a native Linux ELF.

```bash
# .NET 8 SDK, user-local (no root, safe on an immutable OS)
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0 --install-dir "$HOME/.dotnet" --no-path
export DOTNET_ROOT="$HOME/.dotnet"; export PATH="$HOME/.dotnet:$PATH"

git clone --depth 1 https://github.com/ModdersLink/Rime
dotnet build Rime/Utils/RimeREPL/RimeREPL.csproj -c Release      # ~3 min
# -> Rime/bin/Release/RimeREPL   (ELF 64-bit, takes a commands file)
```

`LevelLoaderGen` hardcodes the name `RimeREPL.exe`. Rather than patching upstream, give it a shim
of that name on the `--rimepath`:

```bash
cat > rime/RimeREPL.exe <<'EOF'
#!/usr/bin/env bash
export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$DOTNET_ROOT:$PATH"
exec /path/to/Rime/bin/Release/RimeREPL "$@"
EOF
chmod +x rime/RimeREPL.exe
```

Then:

```bash
# placement only (upstream generator)
python3 LevelLoaderGen/generate.py rm-levelloader 0.1.0 -i ./in -o ./mods --rimepath ./rime

# placement + per-instance EBX overrides (wraps the above, no upstream patch)
tools/bake.py --project MyProject --generator /path/to/LevelLoaderGen --rimepath ./rime
```

---

## 3. Exporting a save

MapEditor stores a project across two tables, while the generator wants one file:

```bash
tools/export_save.py --list
tools/export_save.py --project MyProject --out ./in/map_saves/MP_001_MyProject.json
```

Field names the generator actually reads, and which are easy to get wrong:
`header.mapName`, `header.gameModeName` (**capital M**), and `data` as a **list**.

The object schema needed no changes — `transform` already carries `left/up/forward/trans` (the
generator renames `left` → `right`), and `blueprintCtrRef` already has the guid pair.
`originalRef`/`parentData` being null is fine; they are only read for vanilla objects.

---

## 4. What survives the bake

| | |
|---|---|
| Placement / rotation of custom objects | ✅ |
| Variations (via `VariationMap.json`) | ✅ |
| Deleted vanilla objects | ✅ (recorded as excluded RODs in the generated Lua) |
| Objects that cannot be instantiated (capture points — see #394) | ✅ placeholders bake into real RODs |
| **Per-instance EBX overrides** | ✅ via `tools/bake.py` (see §5) |
| **Apply-to-blueprint** | ❌ skipped — needs partition shadowing (§5) |
| `origin == 3` (custom children) | ❌ skipped: *"custom children not supported"* |
| Vanilla children of `PrefabBlueprint` / `SpatialPrefabBlueprint` | ❌ skipped: *"prefab system not yet implemented"* |

Placeholders are worth calling out: an object the editor deliberately never instantiates still
bakes into a genuine `ReferenceObjectData` with the correct blueprint pair, because the bake only
needs the *reference*, not a live entity. That is the whole point of #394.

---

## 5. The two override semantics — they bake differently

This is the subtle part, and getting it backwards silently corrupts a level.

**Per-instance override — must affect only that instance.**
The first EBX edit deep-clones the blueprint (`GameObject:SetOverrides`). The clone is a runtime
DataContainer belonging to **no partition**, which is exactly what distinguishes it from the stock
content it references: a clone's own members have no partition guid, while everything it points at
that shipped with the game still does, and must stay an *external reference* rather than being
copied into the bundle. `PartitionSerializer:SerializeCloneSubtree` walks from the clone following
only runtime edges and emits a standalone partition, stored in `project_ebx` keyed by editor guid.

At bake time each overridden instance gets its **own partition** and only that object's ROD is
repointed, so isolation holds by construction — siblings keep resolving the stock blueprint.

**Apply-to-blueprint — must affect every instance, including ones the editor never tracked.**
`GameObjectManager:ApplyOverridesToBlueprint` writes the **shared**, partition-resident DC and then
*clears* the instance's overrides. After it runs, no GameObject records the change at all, so it
must be captured separately or it vanishes silently: applied blueprints are recorded in
`m_AppliedBlueprints` and their **original** partition is serialized under its own name, marked in
`project_ebx` by an empty `object_guid`.

Repointing RODs cannot express this. The level contains vanilla `ReferenceObjectData`s referencing
that blueprint which MapEditor never enumerates, so the only way to reach them is to emit the
modified partition under the **original partition name** and let the custom bundle **shadow** the
stock one.

> ✅ **Resolved (2026-08-22).** VU's own custom-content guide
> (https://docs.veniceunleashed.net/vext/guides/custom-content/) states shadowing works and is
> decided by load order -- *"Whatever gets loaded first takes priority"* -- and its texture example
> deliberately reuses a stock resource name to override it. The mechanism is a
> `ResourceManager:LoadBundles` hook at priority 100 that rewrites the bundle list so the custom
> bundle precedes `SharedUtils:GetLevelName()`, then calls `hook:Pass(bundles, compartment)`.
>
> Still to do here: `bundles.py` names partitions `CustomLevels/<map>/<file>`, so shadowing an
> arbitrary stock partition name needs a change there, plus that LoadBundles hook. New partitions
> must also carry fresh guids (the guide is explicit). Superbundle and bundle names must begin with
> `Win32/`, though the runtime mount call omits that prefix.

---

## 5b. Running it — three stages, verified end to end

The pipeline is split so a failure says WHICH half broke; stage 2 needs no game running.

```bash
# 1. in game: make edits and save a project
./.powos-e2e-run.sh bake_save_e2e.py --name BAKETEST

# 2. host: export that project and bake it (needs the Rime shim, see §2)
tools/bake_run.sh BAKETEST

# 3. install the generated mod, enable it in ModList.txt, then verify in game
./.powos-e2e-run.sh bake_verify_e2e.py
```

Verified 2026-08-19 on a 12-object save carrying 6 per-instance EBX overrides: with the generated
mod enabled and **no project loaded**, the six edited lights read back `radius` 16,17,18,19,20,21
against the vanilla 5. That is the whole chain — edit, save, export, Rime, install, load.

The intermediate is worth knowing for debugging: `intermediate/ebx_json/<map>/<gamemode>.json` is
the level partition, `<gamemode>.d/<editor-guid>.json` is one override partition per edited
instance, and the generated `ext/Shared/Levels/<map>/<map>_<gamemode>.lua` is the list of vanilla
ReferenceObjectDatas to EXCLUDE (the originals the overridden copies replace).

**`--rimepath` must be absolute.** `bundles.py` runs Rime with `cwd=rime_path`, so a relative path
is resolved against Rime's own directory and the run dies with `FileNotFoundError`. The same
mechanism used to silently misplace the OUTPUT: a relative `-o` wrote the superbundle to
`<rime>/mods/<name>/sb/` and shipped a mod with an empty `sb/`, with Rime still reporting
"Superbundle successfully built!". Fixed in LevelLoaderGen 75c59a8; `bake_run.sh` fails loudly if
the generated `sb/` ends up empty.

---

## 6. Gotchas

- **Request the running gamemode's subworld.** A server on `ConquestLarge0` loads
  `Levels/<map>/Conquest_Large`, not `Conquest`. Asking for the wrong one returns
  *"Partition not loaded on server"*, which reads like a serializer failure but isn't.
- **`cp -r` into an existing `rm-levelloader` merges.** It also overwrites `mod.json`, and since
  that file lists every superbundle, dropping in a one-level build **disables every other level**.
  Merge the `Superbundles` array instead of replacing it, or install to a clean directory.
- **`powos mods vu server start` can exit 0 without starting anything.** Launch the generated
  script directly under a PTY instead: `setsid script -qfec './.powos-server-launch.sh' logs/server.log`.
  The PTY wrap is load-bearing — VU renders its console through wine's terminal backend, so without
  it the server runs but logs nothing.

---

## 7. EBX JSON format reference

Two different JSON shapes are involved and they are **not** interchangeable. Anything converting
between them needs this table.

`PartitionSerializer` (inspector-facing, `ext/Server/PartitionSerializer.lua`):

```
{ "$guid", "$name", "$primaryInstance",
  "$instances": [ { "$guid", "$type", "$baseClass", "$fields": { "<Field>": <field> } } ] }
```

| kind | PartitionSerializer | Rime |
|---|---|---|
| primitive | `{"$type":"Single","$value":1.0}` | `1.0` |
| bool / string | `{"$type":"Boolean","$value":true}` | `true` |
| enum | `{"$type":"Realm","$enum":true,"$value":3,"$enumValue":"Realm_None"}` | `3` or `"Realm_None"` |
| Vec3 | `{"$type":"Vec3","$value":{"x":{"$type":"Single","$value":1},…}}` | `{"x":1,"y":0,"z":0}` |
| LinearTransform | `$value` = `{right,up,forward,trans}`, each a Vec3 *field* | same keys, plain Vec3s |
| null ref | `{"$type":"T","$ref":true}` (no `$value`) | `null` |
| ref | `{"$type":"T","$ref":true,"$value":{"$instanceGuid","$partitionGuid"}}` | `{"PartitionGuid","InstanceGuid"}` |
| array | `{"$type":"Elem","$array":true,"$value":[…]}` | plain list |
| inline struct | `{"$type":"T","$value":{ <field map> }}` | `{ <plain field map> }` |

Rime instance (what `add_json_partition` compiles), per
`LevelLoaderGen/templates/*.json`:

```json
{ "PartitionGuid": "…", "PrimaryInstanceGuid": "…", "Name": "…",
  "Instances": { "<guid>": { "$type": "ReferenceObjectData", "Field": value, … } } }
```

Note `$instances` is an **array** in one and `Instances` is a **guid-keyed map** in the other, and
field names are PascalCase on both sides.

---

## 8. Converting clone partitions — three things Rime rejects

Found by compiling real data; each produced an unhelpful error.

**Do not put `$type` on inline struct members.** Rime resolves them from the field's declared array
element type and rejects the key outright:
`Could not find member '$type' on object of type 'EventConnection'`. `$type` belongs on instances
only.

**Omit null fields, never emit `null`.** Rime's generated types default struct-valued fields to
`new()`, so an explicit null replaces a working default with nothing and the writer dereferences
it — a bare `NullReferenceException` at `fb.OutputNodeData.Serialize` (audio graph ports).
`PartitionSerializer` emits `{"$type":T,"$ref":true}` both for genuinely null references *and* as
its fallback for any field it could not read, and the two are indistinguishable downstream, so
omitting the key and letting Rime default it is correct for both.

**Sound/voice instances come out empty.** `_SerializeFields` deliberately skips types whose names
match `sound`/`voice` because reading their fields crashes the game, so they serialize with a
`$type` and nothing else. They compile, but a cloned blueprint's audio sub-graph is therefore not
faithfully reproduced. Not yet observed to misbehave at runtime — worth checking if a modified
object loses its sounds.

Building Rime from source pays for itself here: every one of these was diagnosed by reading the
exact line in the stack trace, which a prebuilt binary would not have given.

## 9. Live per-instance editing of networked blueprints (design note, not built)

Per-instance overrides already bake correctly (§5): each overridden instance gets its own partition,
so the shipped level is right. What does NOT work is the **live preview** while editing, and only
for `needNetworkId` blueprints (vehicles). `docs/vehicle-edit-crash.md` has the measurements: a
runtime clone is nobody's primary instance, so a networked spawn from it either builds nothing or
faults, and no VEXT call can fix that.

A pre-baked **placeholder pool** would close the gap without needing runtime partition creation:

* bake N spare partitions, each a full copy of a vehicle blueprint, into the mod's superbundle;
* the client auto-downloads it from the server (per VU's guide), so both realms hold the SAME
  partition guids -- which is precisely the resolvability a networked spawn needs;
* on the first per-instance edit of a vehicle, claim a free placeholder, write the edited fields
  into it, and point that instance at it.

Why this should work, from measurements rather than hope: writing a real partition-resident
blueprint at runtime and then spawning a fresh entity from it is already proven safe
(`MakeWritableRepro` MODE `shared-write` -- entity bus returned, realm alive). A placeholder is
exactly that: a real blueprint that happens to be ours to scribble on. The offline bake also makes
the FULL clone free, so a placeholder can own its whole subtree and edits cannot leak into shared
containers -- the thing that made a runtime full clone unaffordable.

### Measured 2026-08-22: runtime rewiring between BAKED containers works

The pool does NOT need a full baked copy per variant. A baked blueprint can be re-pointed at a
different baked container at runtime, and the result spawns:

    A = Vehicles/BMP2/BMP2      A.vehicleConfig = C884BC5E-E669-4A92-975C-C7E14E03E6EE
    B = Vehicles/LAV25/LAV25    B.vehicleConfig = E2ACA155-9AE9-471D-85F4-DC611CA7D690

    MakeWritable(A.object.components[1]); A...vehicleConfig = B's config
    -> tookEffect = true
    -> CreateEntitiesFromBlueprint(A, networked) -> entity bus returned

Nothing synthesized is involved: both sides are bundle-loaded content, which is exactly the
provenance rule from `vehicle-edit-crash.md`. So the placeholder design is:

* bake a pool of placeholder BLUEPRINT partitions (one claimed per edited instance -- an instance
  needs its own blueprint to reference, or the edit is blueprint-wide), and
* bake spare SUB-CONTAINER partitions for the types actually edited (`vehicleConfig`, etc.);
* at edit time: claim a placeholder, rewire its subtree to a spare, write the edited values into
  that spare, and spawn the instance from the placeholder.

Both steps use only operations already measured safe -- rewiring baked->baked (above) and writing a
baked container then spawning (MODE `shared-write`). No runtime partition creation, no synthesized
containers.

Open questions before building it: pool sizing and exhaustion behaviour; how many spare
sub-container types to bake and for which fields; whether a fully EMPTY placeholder (nil `object`)
can be wired up from scratch, or whether placeholders should be baked as structurally complete
copies and only rewired where an edit lands; and mapping placeholders deterministically across a
save/load so a baked project and a live session agree.

### Measured 2026-08-22: an EMPTY placeholder can be filled at runtime

Proxy for a baked empty placeholder, using only bundle-loaded content:

    A = Vehicles/BMP2/BMP2, B = Vehicles/LAV25/LAV25
    A.object = nil                    -> allowed (A is now a shell)
    A.object = B.object (baked)       -> allowed
    CreateEntitiesFromBlueprint(A)    -> entity bus returned

So the pool can be GENERIC: empty typed blueprint shells, wired up at edit time. It does not need a
baked copy of every vehicle.

⚠️ Spawning a placeholder while it is still empty CRASHES the realm -- a nil `object` is
dereferenced by the engine, measured. The pool must guarantee a placeholder is never spawnable
until it is fully wired.

### The pool, as measured

Bake:
* N **empty typed blueprint shells** (a `VehicleBlueprint` shell serves any vehicle -- shells are
  per blueprint TYPE, not per vehicle);
* M **spare sub-containers** per edited field's type (`vehicleConfig`, ...), since an edited value
  needs a baked container of its own to live in.

At edit time, per instance:
1. claim a free shell;
2. wire it to the stock subtree for everything the edit does not touch;
3. wire the edited path to a claimed spare;
4. write the edited values into that spare;
5. spawn the instance from the shell.

Release both back to the pool when the edit is reverted or the object is deselected.

Every operation is measured: rewiring baked->baked and spawning (bus returned), filling an emptied
reference and spawning (bus returned), writing a baked container and spawning (MODE `shared-write`,
bus returned). Nothing synthesized ever enters the graph, which is the rule
`vehicle-edit-crash.md` arrived at.

Still open: pool sizing and exhaustion behaviour, which field types get spares, and deterministic
placeholder mapping across save/load so a baked project and a live session agree.

### Measured 2026-08-22: the whole pool flow, end to end

Simulated with baked containers only -- LAV25 played the pool entry, BMP2 the edited vehicle:

    copied vehicleConfig fields          ok=41 failed=2
    type mismatch component              VehicleComponentData vs ChassisComponentData  (skipped)
    copied object fields                 ok=84 failed=4
    after fill: pool gravity=-1.0        stock BMP2 gravity=1.6      <- isolation holds
    spawn filled pool entry              -> entity bus returned
    spawn stock BMP2                     -> entity bus returned, untouched

So the flow is:

    spawn stock -> edit -> claim a pool entry -> COPY the edited values into its baked containers
                -> spawn the pool entry

⚠️ COPY, never REPLACE. Putting the runtime clone into the pool entry via `ReplaceInstance`
succeeds and then silently leaves the blueprint unspawnable (see `vehicle-edit-crash.md`). Only
values may cross into the pool; containers may not.

Two constraints this surfaced:

* **Spares must match the CONCRETE type.** BMP2's `components[1]` is `VehicleComponentData` while
  LAV25's is `ChassisComponentData`, so that copy was skipped. The pool needs spares per concrete
  container type appearing on edit paths, not one generic spare per level of the path.
* **A few field copies fail** (2 of 43 on the config, 4 of 88 on the object) -- probably read-only
  fields. Harmless in this test, but an implementation should enumerate them and decide whether any
  matter, rather than swallowing the failures as this harness does.

### Field copying: what actually fails, and why (2026-08-22)

The first pool simulation reported "ok=41 failed=2" / "ok=84 failed=4" and swallowed the details.
Named, the failures were two different things and only one was real:

    FAILED vehicleConfig.stabilizers    array=true   sol: cannot write to a readonly property
    FAILED vehicleConfig.constantForce  array=true   sol: cannot write to a readonly property
    FAILED object.components            array=true   sol: cannot write to a readonly property
    FAILED object.fLIRValue    srcValue=nil   no defined new_index
    FAILED object.fLIRKeyColor srcValue=nil   no defined new_index
    FAILED object.mPMode       srcValue=nil   no defined new_index

1. **Arrays are read-only PROPERTIES.** The whole array cannot be assigned; it must be mutated.
   Available ops, probed: `clear`, `add`, `erase`, `insert`. Same length -> assign element-wise;
   different length -> `clear()` then `add()` each element. Writing ONE slot
   (`components[1] = <baked ref>`) also works.
2. **The other three were a harness bug, not an engine limit.** VEXT lowercases the leading
   ACRONYM RUN, not just the first character: `FLIRValue` -> `flirValue`, `MPMode` -> `mpMode`.
   Lowercasing char 1 produced names that do not exist, so the READ returned nil too and those
   fields were never copied at all.

With both fixed: **vehicleConfig 43/43, object 88/88, zero failures.**

### Why spares must be per CONCRETE type -- demonstrated

Replacing a pool entry's primary instance only yields a distinct BLUEPRINT. `gravityModifier` lives
three levels below it (`blueprint -> object -> components[1] -> vehicleConfig`), and each of those
containers is still shared with the stock vehicle unless substituted. Substitutes cannot be created
at runtime (provenance), so each must be a BAKED container of the same concrete type.

Measured: BMP2's `components[1]` is `VehicleComponentData`; LAV25 has 47 components and not one of
that type. A donor vehicle cannot be assumed to supply what an edit path needs -- the bake must
produce spares for the concrete types that appear on edit paths.

### Primitives, each measured

| Operation | Result |
|---|---|
| Copy fields into a baked container | 43/43 and 88/88, zero failures |
| Resize a baked array (`clear` + `add`) | ok, length 47 -> 29 |
| Write one array slot with a baked ref | ok, took effect |
| Rewire a baked reference to another baked container | ok, spawns |
| Fill a nil'd reference from a baked container | ok, spawns |
| Spawn the filled pool entry | entity bus returned |
| Stock blueprint afterwards | untouched, still spawns |

NOT yet demonstrated: a complete deep-edit with isolation, because MP_001 has only BMP2 and LAV25
resident and neither can supply a `VehicleComponentData` spare. That is exactly what the pool bake
would provide, and it is the first thing to verify once a baked pool exists.

⚠️ The harness originally printed "POOL FLOW WORKS" on a run where the edit had been silently lost,
because it only asserted that the STOCK blueprint was untouched. It now asserts that the edit landed
on the pool entry as well. A test that only checks the negative half will pass while the feature
does nothing.

## 10. CORRECTION: provenance applies to the SPAWN ROOT only (2026-08-22)

Everything above about "spares per concrete type" is WRONG. It generalised from tests that always
put a synthesized container at the spawn ROOT. Measured directly:

    baked root      = Vehicles/LAV25/LAV25 (real primary instance, real partition)
    runtime clone   = ShallowCopy of its vehicleConfig, partitionGuid = nil (synthesized)
    gravityModifier = -1.0 written on the CLONE
    baked component -> runtime clone            tookEffect = true
    CreateEntitiesFromBlueprint(baked root)     -> ENTITY BUS RETURNED

A runtime clone below a baked root is fine. The engine only requires the BLUEPRINT being spawned to
be a genuine resource; everything it references may be synthesized.

### What the pool actually needs

Just **empty baked blueprint shells**. Nothing else.

* No typed spares. No spare per concrete type. No spare `vehicleConfig`.
* Shells are generic: an empty `VehicleBlueprint` serves any vehicle, because its `object` can be
  wired to a RUNTIME clone of whatever vehicle is being edited.
* MapEditor's existing per-instance clone machinery is reused unchanged -- it already produces
  exactly the runtime clone this needs.

Live preview becomes:

    on first per-instance edit of a networked object:
        claim a free baked shell
        wire shell.object -> the existing runtime clone of the edited subtree
        spawn the instance from the shell        (networked, both realms resolve the shell)
    on revert / deselect:
        release the shell back to the pool

The only thing that was ever missing is a baked blueprint to act as the per-instance spawn root.

### Still true

* Never spawn a shell before it is wired -- a nil `object` is dereferenced and kills the realm.
* Never install a runtime clone via `ReplaceInstance` at the ROOT: it reports success and leaves
  the blueprint unspawnable. Wiring a clone into a baked root's FIELDS is a different operation and
  is fine (measured above).

## 11. The shell pool does NOT work for networked objects (2026-08-22)

§9/§10 proposed a pool of baked blueprint shells as per-instance spawn roots, and §10 claimed "only
the spawn root must be baked". The pool was built (`tools/shells/generate_shells.py`, 256 shells,
468 KB, ~0.35 s to bake) and it loads perfectly -- 256/256 every level, on both realms. It still
cannot preview a networked object, and the reason is not any of the things §10 predicted.

Measured in isolation (`Admin/Mods/MakeWritableRepro`, MODE `shell`, no editor involved):

| Test | Result |
|---|---|
| shell + STATIC object, `networked = false` | **entity bus returned** -- shells DO work as spawn roots |
| shell + STATIC object, `networked = true` | nil |
| shell + VEHICLE object, `networked = true` | nil |
| shell added to the level's `entityRegistry`, `networked = true` | nil (the add itself is safe) |
| shell added to the level's `blueprintRegistry`, then spawned | CRASH |
| stock `Vehicles/LAV25/LAV25`, `networked = true` | entity bus returned |

Two conclusions, both contradicting what §10 assumed:

1. **A shell is a perfectly good spawn root.** It builds entities for a non-networked spawn, and
   with `networked = false` and a vehicle object it faults exactly as a stock vehicle blueprint
   does -- the shell is well-formed data, not broken data. Field parity with a real
   `VehicleBlueprint` was verified field by field (entity-bus flags, descriptor,
   interfaceHasConnections all matched).
2. **A networked spawn from a mod-mounted bundle never works**, whatever the object and whatever
   registry it is added to. And it is NOT about registry membership: `LAV25` spawns networked while
   being absent from the level's `blueprintRegistry` (146 entries, verified). So the thing that
   marks a blueprint network-spawnable is established when the LEVEL's own content loads and is not
   reachable from VEXT for a bundle a mod mounted.

`RegistryContainer` has four registries (`entityRegistry`, `assetRegistry`, `blueprintRegistry`,
`referenceObjectRegistry` -- from the server PDB). Two were tried; neither helps.

### Status of the code

`ShellPool` is committed with `SHELL_PREVIEW_ENABLED = false`, so MapEditor behaves exactly as it
did before: vehicles refresh (Disable/Enable) rather than rebuild. The bake tooling, the manifest,
the mount and the pool are all kept and verified -- what is missing is a way to give a mod-mounted
blueprint whatever network marking the level's own content gets.

### The only untested route left

Bake the shells into the LEVEL's own content by shadowing the level partition, rather than shipping
them in a separate superbundle. VU's custom-content guide says a later-loaded bundle takes priority
by load order, and §5 already needs that mechanism for apply-to-blueprint. If shells arrive as part
of the level's own resource set they may inherit whatever stock blueprints have. That is a per-level
bake and a significantly bigger change; it is NOT verified, and nothing above should be read as
evidence that it will work.

## 12. Live preview for networked blueprints, via a temporary shared write

Since a networked entity cannot be built from anything a mod produces at runtime (§11), the live
view is produced the only way that works: `VehiclePreview` writes the instance's overrides onto the
SHARED blueprint and refreshes, then undoes that write.

This is the same path Apply-to-Blueprint uses, and it is measured safe -- `MakeWritableRepro` MODE
`shared-write`: write the shared blueprint, spawn a fresh vehicle afterwards, entity bus returned,
realm alive.

**The trade, which is visible to the user:** while an edit is previewed, EVERY instance of that
vehicle shows it, not just the selected one. Nothing about the saved data changes -- the override
stays per-instance and still bakes per-instance (§5).

Restore points, all wired:

* previewing another object restores the previous one (only one preview is ever active);
* deleting the object (`GameObjectManager:DeleteGameObject`);
* `Level:Destroy`;
* **`ApplyOverridesToBlueprint`, before it writes** -- applying on top of a preview would record
  preview values as the user's intent and serialize them into the bake.

A field is only previewed if its override leaf carries `oldValue`, since that is what puts it back.
Anything without one is left alone: a write we cannot undo would modify the blueprint permanently,
which is worse than showing nothing.
