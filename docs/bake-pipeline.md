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
