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

-- Refreshing after a preview write is DISABLED, and the machinery is kept only so re-enabling it is
-- one flag.
--
-- A refresh is Disable/Enable -- a destroy and recreate of a networked vehicle -- which is the
-- single operation this whole investigation found vehicle crashes clustered around. It also turns
-- out not to be needed for what previews are for: a gravityModifier change applied INSTANTLY in
-- game, so the physics reads the value live from the shared container rather than at build time.
--
-- Every crash reported against the preview involved this refresh: destroyed vehicles (one
-- destroy/recreate per keystroke), a crash spawning a second BMP (refresh inline with
-- CreateEntitiesFromBlueprint), and a crash on the SECOND edit (a refresh racing the next edit).
-- So it is off. Live-read fields still preview; anything only read at build time will not show
-- until a reload or a bake, which is the documented limit anyway.
local PREVIEW_REFRESH_ENABLED = false

-- ON. Previews modify by REPLACEMENT, never in place.
--
-- The crash this feature kept causing has a precise precondition: if entities already exist that
-- were built from a blueprint, WRITING that blueprint and then spawning more of it kills the
-- client. Previewing always meets it -- you are editing an instance that is on screen.
--
-- Replacement avoids it entirely. Clone the container holding the edited field, set the value on
-- the CLONE, and swap it in with DatabasePartition:ReplaceInstance, which repoints every reference.
-- The container the live entities were built from is never mutated.
--
-- Measured on BMP2, which has vanilla vehicles live from round start (the worst case):
--     in-place write  -> client dies on the very next spawn
--     replacement     -> four further spawns, all alive, and the blueprint reads the new value
local PREVIEW_ENABLED = true

local PREVIEW_SERVER_ONLY = false  -- both realms; one-sided data desyncs them
local REFRESH_DEBOUNCE_TICKS = 12

--- Every loaded partition, so a container's owner can be found for ReplaceInstance.
local m_Partitions = {}

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
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)

	-- No server->client broadcast here. The client runs SetOverrides itself -- per-instance light
	-- edits are visible in game, which could not happen if edits were server-only -- so it reaches
	-- this preview on its own realm. Broadcasting made the client preview a SECOND time: an extra
	-- restore + rewrite + refresh per edit, on exactly the path that was destroying vehicles.
	Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)

	if not SharedUtils:IsClientModule() then
		NetEvents:Subscribe('MapEditor:PreviewReport', self, self.OnClientReport)
	end
end

function VehiclePreview:OnClientReport(p_Player, p_Text)
	m_Logger:Warning(tostring(p_Text))
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

	if self.m_Suspended then
		return                      -- a spawn or Apply is in flight; do not touch entities
	end

	local s_Guid = self.m_PendingRefresh
	self.m_PendingRefresh = nil
	self.m_PendingTicks = 0

	self:_RefreshOne(s_Guid)
end

function VehiclePreview:OnPartitionLoaded(p_Partition)
	if p_Partition ~= nil then
		m_Partitions[tostring(p_Partition.guid)] = p_Partition
	end
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
---Value at the leaf of an override chain, for logging.
function m_LeafValue(p_Field)
	local s_Node = p_Field

	while type(s_Node) == 'table' and type(s_Node.value) == 'table' and s_Node.value.field ~= nil do
		s_Node = s_Node.value
	end

	return type(s_Node) == 'table' and s_Node.value or s_Node
end

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

---Resolve an override chain to the container that holds the edited field.
---
---A chain looks like {field='object', value={field='components', value={field='1', ...}}}. Array
---elements are addressed by their 1-BASED name as a string. Nothing is made writable here -- that
---is the entire point of the replacement approach.
---@return DataContainer|nil container, string|nil fieldName, any value
local function ResolveTarget(p_Shared, p_Chain)
	local s_Node = _G[p_Shared.typeInfo.name](p_Shared)
	local s_Chain = p_Chain

	while type(s_Chain) == 'table' and s_Chain.field ~= nil do
		local s_Key = tostring(s_Chain.field)
		local s_Next = s_Chain.value

		-- Leaf: this node names a field and its value is the new value.
		if type(s_Next) ~= 'table' or s_Next.field == nil then
			return s_Node, s_Key, s_Next, s_Chain.type
		end

		local s_Child = s_Node[s_Key]

		if s_Child == nil then
			return nil, nil, nil
		end

		-- An ARRAY is a field whose next chain node is a numeric element name ("1", 1-based). Index
		-- it; never cast the array itself -- doing that throws on .typeInfo and the whole preview
		-- silently wrote nothing while reporting success.
		local s_Index = tonumber(tostring(s_Next.field))

		if s_Index ~= nil then
			s_Child = s_Child[s_Index]

			if s_Child == nil then
				return nil, nil, nil
			end

			s_Next = s_Next.value        -- consume the index node too

			if type(s_Next) ~= 'table' or s_Next.field == nil then
				-- The element itself is the target.
				return _G[s_Child.typeInfo.name](s_Child), nil, s_Next, s_Chain.type
			end
		end

		s_Node = _G[s_Child.typeInfo.name](s_Child)
		s_Chain = s_Next
	end

	return nil, nil, nil
end

---Swap a modified copy of `p_Container` into its partition.
---
---Clones it, sets one field on the CLONE, then ReplaceInstance repoints every reference. The
---original container -- the one live entities were built from -- is never mutated, which is what
---keeps later spawns alive.
---@return DataContainer|nil the ORIGINAL container, for restoring
local function ReplaceField(p_Container, p_Field, p_Value)
	local s_Partition = nil

	for _, l_P in pairs(m_Partitions) do
		if l_P:FindInstance(p_Container.instanceGuid) ~= nil then
			s_Partition = l_P
			break
		end
	end

	if s_Partition == nil then
		return nil
	end

	local s_Clone = g_DataContainerExt:ShallowCopy(p_Container, GenerateGuid())

	if s_Clone == nil then
		return nil
	end

	s_Clone:MakeWritable()          -- the CLONE, which nothing was built from
	s_Clone[p_Field] = p_Value
	s_Partition:ReplaceInstance(p_Container, s_Clone, true)

	return p_Container
end

---Write one override chain onto a blueprint BY REPLACEMENT.
---
---Public because Apply-to-Blueprint needs it too: an in-place write makes the blueprint's
---containers writable, and spawning that vehicle afterwards then kills the client (which is why
---GameObjectManager had to refuse those spawns for the rest of the session). Replacement leaves the
---blueprint spawnable.
---@return boolean ok, string|nil reason
function VehiclePreview:WriteChainByReplacement(p_Shared, p_Chain)
	local s_Container, s_FieldName, s_Value, s_Type = ResolveTarget(p_Shared, p_Chain)

	if s_Container == nil or s_FieldName == nil then
		return false, 'could not resolve the chain'
	end

	if s_Type ~= nil then
		local s_Coerced = ParseType(tostring(s_Type), s_Value)

		if s_Coerced == nil then
			return false, "'" .. tostring(s_Value) .. "' is not a valid " .. tostring(s_Type)
		end

		s_Value = s_Coerced
	elseif type(s_Value) == 'table' then
		return false, 'no type to coerce a table value by'
	end

	if ReplaceField(s_Container, s_FieldName, s_Value) == nil then
		return false, 'ReplaceInstance failed'
	end

	return true, nil
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

---Queue a debounced refresh for one object. No-op while refreshing is disabled.
function VehiclePreview:_QueueRefresh(p_Guid)
	if not PREVIEW_REFRESH_ENABLED then
		return
	end

	self.m_PendingRefresh = tostring(p_Guid)
	self.m_PendingTicks = 0
end

---Show `p_GameObject`'s current overrides by writing them onto the shared blueprint.
---
---Safe to call repeatedly for the same object: each call restores what it previously wrote before
---writing the new values, so previews never stack.
function VehiclePreview:Show(p_GameObject)
	if not PREVIEW_ENABLED or p_GameObject == nil then
		return false
	end

	if PREVIEW_SERVER_ONLY and SharedUtils:IsClientModule() then
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

	-- Restore only when moving to a DIFFERENT object.
	--
	-- Every ReplaceInstance repoints references out from under live entities -- that is what
	-- produced "tried accessing an invalid or destroyed EntityBusPeer" and, with enough of them, a
	-- dead server. Restoring before re-previewing the same object doubled that traffic for no
	-- benefit: the next call is about to overwrite the same field anyway, and the ORIGINAL value is
	-- already recorded from the first preview, so restore-on-exit still puts back the right thing.
	if self.m_Active ~= nil and self.m_Active.guid ~= tostring(p_GameObject.guid) then
		self:Restore()
	end

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
	local s_Detail = ''

	for l_Path, l_Field in pairs(s_Overrides) do
		local s_RestoreLeaf = RestoreChain(l_Field)

		if s_RestoreLeaf ~= nil then
			local s_Ok, s_Result = pcall(function()
				local s_Container, s_FieldName, s_Value, s_Type = ResolveTarget(s_Shared, l_Field)

				if s_Container == nil or s_FieldName == nil then
					error('could not resolve ' .. tostring(l_Path))
				end

				-- Coerce exactly as the editor's own writer does. Without this a Vec2/3/4 override
				-- arrives as a plain Lua table ({x,y,z}) and was assigned straight into the field --
				-- the "=table: ..." seen in a real session's log. A wrong value written silently is
				-- worse than a refused edit, so refuse when it cannot be represented.
				if s_Type ~= nil then
					local s_Coerced = ParseType(tostring(s_Type), s_Value)

					if s_Coerced == nil then
						error("'" .. tostring(s_Value) .. "' is not a valid " .. tostring(s_Type) ..
							' for ' .. tostring(l_Path))
					end

					s_Value = s_Coerced
				elseif type(s_Value) == 'table' then
					error('refusing to write a table into ' .. tostring(l_Path) ..
						' with no type to coerce it by')
				end

				local s_Original = ReplaceField(s_Container, s_FieldName, s_Value)

				if s_Original == nil then
					error('ReplaceInstance failed for ' .. tostring(l_Path))
				end

				return s_Original
			end)

			if not s_Ok then
				m_Logger:Warning('preview: ' .. tostring(s_Result))
			end

			if s_Ok and s_Result ~= nil then
				s_Restore[l_Path] = s_RestoreLeaf
				s_Written = s_Written + 1
				-- Record exactly WHAT was written, so the two realms can be compared. "Both
				-- previewed 1 field" is not the same as "both wrote the same thing".
				s_Detail = s_Detail .. tostring(s_Result) .. '=' .. tostring(m_LeafValue(l_Field)) .. ' '
			else
				s_Detail = s_Detail .. tostring(l_Path) .. ':FAILED '
			end
		else
			s_Detail = s_Detail .. tostring(l_Path) .. ':NO-OLDVALUE '
		end
	end

	if s_Written == 0 then
		m_Logger:Warning('Nothing previewable on ' .. tostring(p_GameObject.name) ..
			': none of the ' .. tostring(GetLength(s_Overrides)) .. ' override(s) could be ' ..
			'written to the shared blueprint, or none carried an oldValue to restore from.')
		return false
	end

	-- Keep the FIRST preview's restore data. Later edits replace a container we already swapped in,
	-- so their "original" is our own clone -- restoring that would leave the preview value in place.
	if self.m_Active ~= nil and self.m_Active.guid == tostring(p_GameObject.guid) then
		for l_Path, l_Leaf in pairs(s_Restore) do
			if self.m_Active.restore[l_Path] == nil then
				self.m_Active.restore[l_Path] = l_Leaf
			end
		end
	else
		self.m_Active = {
			guid = tostring(p_GameObject.guid),
			bpGuid = tostring(p_GameObject.blueprintCtrRef.instanceGuid),
			restore = s_Restore,
		}
	end

	self:_QueueRefresh(self.m_Active.guid)


	-- Client Lua output reaches no log readable from here, and "both realms must write" is the
	-- whole correctness condition -- so the client says so out loud, on the server's log.
	if SharedUtils:IsClientModule() then
		NetEvents:SendLocal('MapEditor:PreviewReport',
			'CLIENT wrote [' .. s_Detail .. '] on ' .. tostring(p_GameObject.name))
	else
		m_Logger:Warning('SERVER wrote [' .. s_Detail .. '] on ' .. tostring(p_GameObject.name))
	end

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
		-- Restore by replacement too. Writing the value back would mutate the container the current
		-- entities were built from -- exactly the thing that poisons later spawns.
		local s_Ok = pcall(function()
			local s_Container, s_FieldName, s_Value = ResolveTarget(s_Shared, l_Field)

			if s_Container ~= nil then
				ReplaceField(s_Container, s_FieldName, s_Value)
			end
		end)

		if s_Ok then
			s_Restored = s_Restored + 1
		end
	end

	-- QUEUE the refresh, never run it inline.
	--
	-- Restore is called from the spawn guard, so an inline Disable/Enable would destroy and
	-- recreate an entity in the same frame as CreateEntitiesFromBlueprint is building another one.
	-- That is the "spawn a second BMP and I crash" report. Deferring costs nothing: the values are
	-- already back, only the visual catch-up waits a few ticks.
	self:_QueueRefresh(s_Active.guid)

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
	-- Keep any pending refresh: dropping it here meant a restore during a spawn never caught up
	-- visually, leaving the entity showing a value the blueprint no longer holds.
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
