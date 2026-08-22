---@class VehiclePreview
---Live preview for NETWORKED blueprints (vehicles), which cannot be previewed the normal way.
---
---Every other object shows a per-instance edit by respawning from its runtime clone. Networked ones
---cannot: `CreateEntitiesFromBlueprint` will not build a networked entity from anything a mod
---produced at runtime -- not a clone, and not a baked shell from a mounted bundle either. That was
---measured to exhaustion (`docs/bake-pipeline.md` §11); the supported route for custom content is
---level-load injection, which is what the BAKE already does correctly.
---
---So the live view is produced the only way that works at runtime: write the edit to the SHARED
---blueprint and refresh, which is the exact path Apply-to-Blueprint uses and is measured safe
---(spawning afterwards still works). The write is TEMPORARY and is undone as soon as the edit stops
---being previewed.
---
---The trade, stated plainly because it is visible to the user: while an edit is being previewed,
---EVERY instance of that vehicle shows it, not just the selected one. Nothing about the saved data
---changes -- the override stays per-instance, and the bake still gives each instance its own
---partition.
---
---Only ONE object is previewed at a time. Previewing another restores the first.
VehiclePreview = class 'VehiclePreview'

---@type Logger
local m_Logger = Logger('VehiclePreview', false)

function VehiclePreview:__init()
	self:RegisterVars()
	self:RegisterEvents()
end

-- Ticks to wait before refreshing after an edit. Rapid edits (dragging a value) otherwise queue a
-- destroy/recreate PER KEYSTROKE, which visibly destroys the vehicle -- the same reason the rebuild
-- path has REINSTANTIATE_DEBOUNCE. Reported from the field as "the vehicle gets destroyed".
local REFRESH_DEBOUNCE_TICKS = 12

function VehiclePreview:RegisterVars()
	---{ guid, bpGuid, restore = { [path] = <override leaf carrying the ORIGINAL value> } }
	self.m_Active = nil
	---guid awaiting a debounced refresh, and how long it has waited
	self.m_PendingRefresh = nil
	self.m_PendingTicks = 0
	---set while Apply is running: previews must not write the shared blueprint underneath it
	self.m_Suspended = false
end

function VehiclePreview:RegisterEvents()
	-- A preview must never outlive the level: the shared DC goes away with it, and a stale record
	-- would try to restore into nothing.
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)

	-- The preview has to happen on the CLIENT too, because the client is what the user SEES.
	-- Commands execute server-side only (CommandActions:SetEBXField -> SetOverrides never runs on
	-- the client), so the server previewed alone and the edit was invisible -- which is exactly the
	-- "I changed the value and nothing happened" report. The server therefore tells clients to
	-- mirror it on their own realm.
	if SharedUtils:IsClientModule() then
		NetEvents:Subscribe('MapEditor:PreviewShow', self, self.OnRemoteShow)
		NetEvents:Subscribe('MapEditor:PreviewRestore', self, self.OnRemoteRestore)
	end
	Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)
end

---Client: mirror the server's preview on this realm.
function VehiclePreview:OnRemoteShow(p_Guid)
	local s_GameObject = GameObjectManager.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		return
	end

	self:Show(s_GameObject)
end

---Client: undo the mirrored preview.
function VehiclePreview:OnRemoteRestore()
	self:Restore()
end

---Debounced refresh. Coalescing means one destroy/recreate per burst of edits, not one per edit.
function VehiclePreview:OnEngineUpdate()
	-- Watchdog. Suspend/Resume are paired around Apply, but Lua has no finally: a throw between them
	-- would leave previews suspended for the rest of the session, silently. Time it out instead of
	-- trusting the pairing.
	if self.m_Suspended then
		self.m_SuspendTicks = (self.m_SuspendTicks or 0) + 1

		if self.m_SuspendTicks > 300 then
			m_Logger:Warning('Previews were suspended for 300 ticks -- Apply probably threw. ' ..
				'Resuming so previews do not stay dead for the session.')
			self.m_Suspended = false
			self.m_SuspendTicks = 0
		end
	else
		self.m_SuspendTicks = 0
	end

	if self.m_PendingRefresh == nil then
		return
	end

	self.m_PendingTicks = self.m_PendingTicks + 1

	if self.m_PendingTicks < REFRESH_DEBOUNCE_TICKS then
		return
	end

	local s_Guid = self.m_PendingRefresh
	self.m_PendingRefresh = nil
	self.m_PendingTicks = 0

	self:_RefreshOne(s_Guid)
end

function VehiclePreview:OnLevelDestroy()
	self:RegisterVars()
end

---Is `p_GameObject` a networked blueprint (i.e. one that cannot be previewed by respawning)?
---@return boolean
function VehiclePreview:AppliesTo(p_GameObject)
	if p_GameObject == nil or p_GameObject.blueprintCtrRef == nil then
		return false
	end

	local s_Networked = false

	pcall(function()
		local s_Shared = p_GameObject.blueprintCtrRef:Get()
		s_Networked = s_Shared ~= nil and s_Shared.needNetworkId == true
	end)

	return s_Networked
end

---Build the chain that puts a field back the way it was.
---
---An override is a NESTED CHAIN, not a flat leaf:
---    { field='object', type='GameObjectData',
---      value = { field='gravityModifier', type='Float32', value=-1, oldValue=1.6 } }
---so `oldValue` sits on the DEEPEST node. Checking it on the root (which was the first version of
---this) rejected every override as un-restorable, so nothing was ever written and the preview
---silently did nothing -- exactly what vehicle_preview_e2e caught.
---
---Returns a copy of the chain with the leaf's value replaced by its oldValue, or nil if the leaf
---has no oldValue. A field we cannot undo is NOT previewed: leaving the blueprint permanently
---modified is far worse than showing nothing.
local function RestoreChain(p_Field)
	if type(p_Field) ~= 'table' then
		return nil
	end

	local s_Copy = {}

	for l_Key, l_Value in pairs(p_Field) do
		s_Copy[l_Key] = l_Value
	end

	-- Another link in the chain: a table value that itself names a field.
	if type(p_Field.value) == 'table' and p_Field.value.field ~= nil then
		local s_Child = RestoreChain(p_Field.value)

		if s_Child == nil then
			return nil
		end

		s_Copy.value = s_Child

		return s_Copy
	end

	-- The leaf.
	if p_Field.oldValue == nil then
		return nil
	end

	s_Copy.value = p_Field.oldValue

	return s_Copy
end

---Refresh ONE object so it re-reads the shared container.
---
---Deliberately NOT every instance of the blueprint. The shared write is visible to all of them, but
---refreshing all of them means a destroy/recreate each, on every edit -- which is what was
---destroying vehicles. The edited object is the one the user is looking at; the rest pick the value
---up whenever they are next rebuilt, or on reload.
function VehiclePreview:_RefreshOne(p_Guid)
	local s_GameObject = GameObjectManager.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		return false
	end

	return pcall(function()
		s_GameObject:Disable(true)
		s_GameObject:Enable(true)
	end)
end

---Queue a debounced refresh for one object.
function VehiclePreview:_QueueRefresh(p_Guid)
	self.m_PendingRefresh = tostring(p_Guid)
	self.m_PendingTicks = 0
end

---Show `p_GameObject`'s current overrides by writing them onto the shared blueprint.
---
---Safe to call repeatedly for the same object: each call restores what it previously wrote before
---writing the new values, so previews never stack.
function VehiclePreview:Show(p_GameObject)
	if p_GameObject == nil then
		return false
	end

	-- Apply rebuilds every instance of the blueprint, and each rebuild re-enters SetOverrides. If a
	-- preview wrote the shared blueprint during that, siblings with their own overrides would
	-- scribble over the value Apply is in the middle of committing.
	if self.m_Suspended then
		return false
	end

	if not self:AppliesTo(p_GameObject) then
		return false
	end

	-- Whatever was previewed before -- this object or another -- goes back first.
	self:Restore()

	local s_Overrides = p_GameObject.overrides

	if s_Overrides == nil or next(s_Overrides) == nil then
		return false
	end

	local s_Shared = p_GameObject.blueprintCtrRef:Get()

	if s_Shared == nil then
		m_Logger:Warning('Cannot preview ' .. tostring(p_GameObject.name) ..
			': shared blueprint is not resolvable.')
		return false
	end

	local s_Restore = {}
	local s_Written = 0

	for l_Path, l_Field in pairs(s_Overrides) do
		local s_RestoreLeaf = RestoreChain(l_Field)

		if s_RestoreLeaf ~= nil then
			local s_Ok, s_Result = pcall(function()
				return EBXManager:SetField(s_Shared, l_Field, '')
			end)

			if s_Ok and s_Result ~= nil and s_Result ~= '' then
				s_Restore[l_Path] = s_RestoreLeaf
				s_Written = s_Written + 1
			end
		end
	end

	if s_Written == 0 then
		m_Logger:Warning('Nothing previewable on ' .. tostring(p_GameObject.name) ..
			': none of the ' .. tostring(GetLength(s_Overrides)) .. ' override(s) could be ' ..
			'written to the shared blueprint, or none carried an oldValue to restore from.')
		return false
	end

	self.m_Active = {
		guid = tostring(p_GameObject.guid),
		bpGuid = tostring(p_GameObject.blueprintCtrRef.instanceGuid),
		restore = s_Restore,
	}

	self:_QueueRefresh(self.m_Active.guid)

	-- Tell the clients to do the same, or the edit is only visible on the server realm.
	if not SharedUtils:IsClientModule() then
		-- Broadcast, NOT BroadcastLocal: local dispatch never leaves the process, which is fine on a
		-- listen server and silently delivers nothing when the client is a separate process.
		NetEvents:Broadcast('MapEditor:PreviewShow', tostring(p_GameObject.guid))
	end

	m_Logger:Write('Previewing ' .. tostring(s_Written) .. ' field(s) on ' ..
		tostring(p_GameObject.name) .. ' via the shared blueprint. Temporary; refresh is debounced.')

	return true
end

---Put the shared blueprint back the way it was. Safe to call when nothing is previewed.
---
---MUST run before anything that treats the shared blueprint as authoritative -- Apply-to-Blueprint
---above all, which records the blueprint as modified and serializes it for the bake. Applying on
---top of a preview would bake preview values as if the user had asked for them.
function VehiclePreview:Restore()
	local s_Active = self.m_Active

	if s_Active == nil then
		return false
	end

	self.m_Active = nil

	local s_GameObject = GameObjectManager.m_GameObjects[s_Active.guid]
	local s_Shared = nil

	if s_GameObject ~= nil and s_GameObject.blueprintCtrRef ~= nil then
		pcall(function() s_Shared = s_GameObject.blueprintCtrRef:Get() end)
	end

	if s_Shared == nil then
		-- The object is gone (deleted, or the level changed). Nothing to restore into; dropping the
		-- record is correct rather than erroring.
		return false
	end

	local s_Restored = 0

	for _, l_Field in pairs(s_Active.restore) do
		local s_Ok = pcall(function()
			EBXManager:SetField(s_Shared, l_Field, '')
		end)

		if s_Ok then
			s_Restored = s_Restored + 1
		end
	end

	self:_RefreshOne(s_Active.guid)

	if not SharedUtils:IsClientModule() then
		NetEvents:Broadcast('MapEditor:PreviewRestore')
	end

	m_Logger:Write('Restored ' .. tostring(s_Restored) .. ' previewed field(s) on the shared blueprint.')

	return true
end

---The selection moved to `p_Guid`. Anything previewed on a DIFFERENT object goes back.
---
---NOTHING CALLS THIS YET. Selection lives entirely in the WebUI -- it never sends a command to the
---ext (the only selection-driven traffic is MapEditor:RequestPartitionData, which is also how the
---inspector READS partitions, so hooking it would restore on ordinary reads including the previewed
---object's own). Wiring this up needs a WebUI-side event on selection change.
---
---Until then a preview is undone by: editing another object, deleting it, Apply, or a level change.
---It is NOT undone by simply clicking away, which vehicle_preview_e2e's restore check reports as a
---failure -- correctly, because every instance of that vehicle keeps showing the edit until one of
---those happens.
function VehiclePreview:OnSelectionChanged(p_Guid)
	if self.m_Active ~= nil and self.m_Active.guid ~= tostring(p_Guid) then
		self:Restore()
	end
end

---Suspend/resume previews around Apply.
function VehiclePreview:Suspend()
	self.m_Suspended = true
	self.m_SuspendTicks = 0
	self.m_PendingRefresh = nil
end

function VehiclePreview:Resume()
	self.m_Suspended = false
	self.m_SuspendTicks = 0
end

---Drop the preview for one object if it is the active one (used when it is deleted).
function VehiclePreview:ClearFor(p_Guid)
	if self.m_Active ~= nil and self.m_Active.guid == tostring(p_Guid) then
		self:Restore()
	end
end

VehiclePreview = VehiclePreview()
