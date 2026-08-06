# Prefab / EBX override system — design (Unity-style)

Status: **design only, not implemented.** Captures the plan for per-instance vs.
prefab-wide EBX overrides.

## The problem

Today `GameObject:SetOverride` writes edited fields into the **shared** blueprint
DataContainer (`self.blueprintCtrRef:Get()`, with `:Clone(self.guid)` commented out at
`ext/Shared/Types/GameObject.lua:274`), then only cycles `Disable()/Enable()`. So an
edit to one instance mutates the DC every instance reads → **all instances change**.
We want Unity semantics:

- **Per-instance override (default):** first edit makes that instance *unique* — deep-clone
  the blueprint, apply the override to the clone, repoint just that instance, respawn only
  its entities. Further edits modify the same clone. Sibling instances stay on the shared
  prefab until *they're* first edited.
- **Apply to prefab (explicit button):** push the instance's accumulated overrides onto the
  shared blueprint → affects all instances; then clear the instance's own override.

## Confirmed runtime APIs

- `DataContainer:Clone(guid)` exists and is used here: `DataContainerExt:ShallowCopy` →
  `Clone` (`DataContainerExt.lua:74`); `DataContainerExt:DeepClone(dc, guid)` clones the whole
  nested subtree (`:282`); `DataContainerExt:DeepCopy(dc, pathGuids)` clones only DCs along a
  path (`:157`); `GenerateGuid()` (`:608`).
- **Shallow clone is NOT enough** — `EBXManager:SetField` recurses and `MakeWritable()`s each
  nested DC, so unless every DC along the edited path is cloned, writes still hit shared data
  and leak to siblings. Use `DeepClone` (simple) or `DeepCopy` along the path (scalable).
- `EntityManager:CreateEntitiesFromBlueprint(dc, params)` takes a **DC object directly** — a
  runtime clone is NOT registered in ResourceManager, so spawn from the DC, don't re-resolve
  by guid via `FindInstanceByGuid`.
- `GameObjectManager:SetVariation` (`:745`) is the proven **delete + respawn-same-guid** model
  to mirror for re-instantiation.

## Milestones

**M1 — per-instance clone-on-edit (one scalar, e.g. light radius), client-only, debounced.**
- `GameObject:SetOverrides`: replace shared `internalBlueprint` with a per-instance clone
  (`DeepCopy` along the override path); store `instanceBlueprintGuid`. Apply overrides to the
  clone via the existing `SetField` loop.
- `GameObject:SetOverride`: replace `Disable/Enable` with a re-instantiation of *this* object's
  entities from the clone.
- `GameObjectManager`: add `InvokeBlueprintSpawnFromInstance(...,dc,overrides)` (skips
  `FindInstanceByGuid`, calls `CreateEntitiesFromBlueprint(dc,...)`) + a `ReinstantiateGameObject`
  helper (delete+respawn preserving guid/transform/parentData/variation/overrides). Pending-guid
  map keyed on the clone's unique instanceGuid.
- Keep `blueprintCtrRef` = **original** for identity (WebUI, saves, sibling enumeration).
- **Debounce**: respawn on drag-end, not every keystroke (see `onEndDrag`, `InspectorComponent.vue:376`).
- Acceptance: two lamps of one prefab, edit radius on one → only that one changes, survives reselect.

**M2 — persist per-instance through save/reload.**
- Per-object `overrides` already persist (`GameObjectSaveData.lua:37`); `LevelInjector` re-adopts
  them and the spawn hook re-applies. Ensure the re-apply targets a per-instance clone (falls out
  of M1's SetOverrides change), so two saved instances with divergent overrides don't clobber.
- **Fix the WebUI load gap:** `GameObject.CreateWithTransferData` (`GameObject.ts:104`) does NOT
  copy `overrides`, so a freshly loaded object shows empty overrides in the inspector. Carry
  `overrides` through the constructor/transfer so modified-field indicators survive a reload.

**M3 — apply-to-prefab button.**
- New `ApplyOverridesToBlueprintCommand` (WebUI `commands/`, shared `CommandActions.lua` register
  in `RegisterVars`). WebUI: un-comment the reserved `Apply` button (`InspectorComponent.vue:84-91`),
  wire `onApplyToPrefab` near `onEBXInput`.
- `GameObject:ApplyOverridesToBlueprint()`: write `self.overrides` onto the shared DC
  (`MakeWritable` + `SetField` loop — the intended explicit version of today's behavior).
- `GameObjectManager:GetInstancesOfBlueprint()` + respawn all siblings (clear their per-instance
  clone → pick up the mutated shared DC; instances with their own override keep it). Batch over
  frames for large counts.
- Persistence: **recommended** = a top-level `prefabOverrides` map keyed by blueprint instanceGuid
  in the project save; `LevelInjector` applies it once per shared DC during the load-screen patch;
  clear the source instance's own overrides after apply. (Quick alternative: materialize onto every
  sibling's `overrides` — zero schema change but bloats the save and misses off-tree instances.)

**M4 — polish + export.**
- Modified-field indicator (Unity bold/blue): `GameObject.EBXOverrides` (`GameObject.ts:405`)
  already exposes the per-path override tree the inspector consumes; style overridden rows + add a
  right-click "Revert" (dispatch `SetEBXFieldCommand` with the stored `oldValue`).
- **LevelLoaderGen** currently bakes **no** EBX overrides (grep for "override" in `tools/LevelLoaderGen`
  is empty) — a standalone generated mod drops all EBX edits. Add an override pass to
  `ebx_json.py` (bake values into the generated EBX JSON along each path) or carry the override
  list into the generated `LevelLoader/ext` and re-apply at runtime with a copy of the SetField
  logic. This is the largest unknown; scope separately.

## Risks
- Deep vs shallow clone (nested-DC sharing) — the make-or-break; validate on a real light first.
- Lazy-loaded fields abort cloning (`DataContainerExt.lua:58,300`) — guard/defer.
- Respawn cost per keystroke → debounce.
- Server-realm spawn from an unregistered clone + net-sync of the clone guid — validate client-only
  first (inspector is already flagged "Experimental").
- Apply-to-prefab mutates streamed vanilla level data — only survives a level restart via the M3
  re-apply pass.

## Critical files
`ext/Shared/Types/GameObject.lua`, `ext/Shared/Modules/GameObjectManager.lua`,
`ext/Shared/Util/DataContainerExt.lua`, `ext/Shared/Modules/CommandActions.lua`,
`WebUI/src/script/components/EditorComponents/Inspector/InspectorComponent.vue`.
Secondary: `ext/Shared/Types/GameObjectSaveData.lua`, `ext/Shared/Modules/LevelInjector.lua`,
`ext/Server/ProjectManager.lua`, `WebUI/src/script/types/GameObject.ts`,
`WebUI/src/script/commands/SetEBXFieldCommand.ts`, `tools/LevelLoaderGen/ebx_json.py`.
