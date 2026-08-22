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

function VehiclePreview:RegisterVars()
	---{ guid, bpGuid, restore = { [path] = <override leaf carrying the ORIGINAL value> } }
	self.m_Active = nil
end

function VehiclePreview:RegisterEvents()
	-- A preview must never outlive the level: the shared DC goes away with it, and a stale record
	-- would try to restore into nothing.
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
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

---Build the leaf that puts a field back the way it was.
---
---`oldValue` is captured when the edit is first made, so it is the pre-edit base value. A field
---without one is NOT previewed: writing something we cannot undo would leave the blueprint
---permanently modified, which is far worse than no preview.
local function RestoreLeaf(p_Field)
	if type(p_Field) ~= 'table' or p_Field.oldValue == nil then
		return nil
	end

	local s_Leaf = {}

	for l_Key, l_Value in pairs(p_Field) do
		s_Leaf[l_Key] = l_Value
	end

	s_Leaf.value = p_Field.oldValue

	return s_Leaf
end

---Refresh every live instance of a blueprint so it re-reads the shared container.
function VehiclePreview:_RefreshInstances(p_BpGuid)
	local s_Guids = {}

	for l_Guid, l_GO in pairs(GameObjectManager.m_GameObjects or {}) do
		if l_GO ~= nil and l_GO.blueprintCtrRef ~= nil and
			tostring(l_GO.blueprintCtrRef.instanceGuid) == p_BpGuid then
			s_Guids[#s_Guids + 1] = l_Guid
		end
	end

	for _, l_Guid in ipairs(s_Guids) do
		local l_GO = GameObjectManager.m_GameObjects[l_Guid]

		if l_GO ~= nil then
			pcall(function()
				l_GO:Disable(true)
				l_GO:Enable(true)
			end)
		end
	end

	return #s_Guids
end

---Show `p_GameObject`'s current overrides by writing them onto the shared blueprint.
---
---Safe to call repeatedly for the same object: each call restores what it previously wrote before
---writing the new values, so previews never stack.
function VehiclePreview:Show(p_GameObject)
	if p_GameObject == nil or not self:AppliesTo(p_GameObject) then
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
		local s_RestoreLeaf = RestoreLeaf(l_Field)

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
		return false
	end

	self.m_Active = {
		guid = tostring(p_GameObject.guid),
		bpGuid = tostring(p_GameObject.blueprintCtrRef.instanceGuid),
		restore = s_Restore,
	}

	local s_Refreshed = self:_RefreshInstances(self.m_Active.bpGuid)

	m_Logger:Write('Previewing ' .. tostring(s_Written) .. ' field(s) on ' ..
		tostring(p_GameObject.name) .. ' via the shared blueprint (' .. tostring(s_Refreshed) ..
		' instance(s) refreshed). Temporary: every instance shows it until the preview is cleared.')

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

	self:_RefreshInstances(s_Active.bpGuid)
	m_Logger:Write('Restored ' .. tostring(s_Restored) .. ' previewed field(s) on the shared blueprint.')

	return true
end

---Drop the preview for one object if it is the active one (used when it is deleted).
function VehiclePreview:ClearFor(p_Guid)
	if self.m_Active ~= nil and self.m_Active.guid == tostring(p_Guid) then
		self:Restore()
	end
end

VehiclePreview = VehiclePreview()
