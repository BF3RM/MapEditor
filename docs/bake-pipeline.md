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
python3 LevelLoaderGen/generate.py rm-levelloader 0.1.0 -i ./in -o ./mods --rimepath ./rime
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
| **Per-instance EBX overrides** | ⚠️ see §5 — needs `project_ebx` |
| **Apply-to-blueprint** | ⚠️ see §5 — needs partition shadowing |
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

> ⚠️ **Unverified assumption.** That a later-loaded bundle can override a stock partition of the
> same name has *not* been proven here. If it cannot, the apply path needs a different design.
> Note also that `bundles.py` names partitions `CustomLevels/<map>/<file>`, so shadowing an
> arbitrary stock partition name needs a change there.

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
