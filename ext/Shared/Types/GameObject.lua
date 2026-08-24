---@class GameObject
GameObject = class 'GameObject'

local m_Logger = Logger("GameObject", false)
local m_TraceableField_Suffix = "_original_value"

local m_TransformComponents = { "trans", "left", "up", "forward" }
local m_VectorAxes = { "x", "y", "z" }

-- VALUE-compares two LinearTransform-shaped values (same style as m_ValuesEqual further down,
-- which does the same job for override leaves).
--
-- Why: LinearTransform is VEXT userdata, so `==` on it is an IDENTITY compare, and SetTransform
-- always hands SetField a FRESHLY constructed LinearTransform. That made the dirty check below
-- always true for transforms, so moving a vanilla object and then undoing the move still saved it
-- as user-modified (GH #376). Same story for localTransform.
--
-- Returns (isComparable, isEqual). isComparable is false for anything that isn't
-- LinearTransform-shaped, so SetField can keep its original identity compare for every other field
-- type. The probing runs inside a pcall because indexing an absent field on VEXT userdata throws
-- rather than returning nil.
local function m_TransformsEqual(p_A, p_B)
	local s_Ok, s_Comparable, s_Equal = pcall(function()
		for _, l_Component in ipairs(m_TransformComponents) do
			local s_VecA = p_A[l_Component]
			local s_VecB = p_B[l_Component]

			if s_VecA == nil or s_VecB == nil then
				return false, false -- not a LinearTransform: not comparable
			end

			for _, l_Axis in ipairs(m_VectorAxes) do
				local s_AxisA = s_VecA[l_Axis]
				local s_AxisB = s_VecB[l_Axis]

				if type(s_AxisA) ~= "number" or type(s_AxisB) ~= "number" then
					return false, false -- not a LinearTransform: not comparable
				end

				if s_AxisA ~= s_AxisB then
					return true, false
				end
			end
		end

		return true, true
	end)

	if not s_Ok then
		return false, false
	end

	return s_Comparable, s_Equal
end

function GameObject:__init(arg)
	---@type Guid
	self.guid = arg.guid
	self.creatorName = arg.creatorName -- never gets sent to js
	---@type CtrRef
	self.blueprintCtrRef = arg.blueprintCtrRef
	self.timeStamp = arg.timeStamp
	self.origin = arg.origin        -- never gets sent to js
	self.gameEntities = arg.gameEntities or {}
	self.children = arg.children or {} -- never gets sent to js
	---@type Realm|integer
	self.realm = arg.realm
	self.isUserModified = true
	self.userModifiedFields = {}
	---@type CtrRef
	self.originalRef = arg.originalRef -- never gets sent to js
	self.localTransform = arg.localTransform
	self.overrides = arg.overrides or {}
	self.internalBlueprint = nil
	self.name = arg.name
	---@type GameObjectParentData
	self.parentData = arg.parentData
	self.transform = arg.transform -- world transform
	self.variation = arg.variation
	self.isDeleted = arg.isDeleted --> only vanilla objects, dont appear in the browser anymore. entities get disabled, because we cannot destroy them
	self.isEnabled = arg.isEnabled
	-- Placed but deliberately NOT instantiated: some gameplay prefabs (capture points) fault
	-- natively inside CreateEntitiesFromBlueprint, so the editor represents them with a marker and
	-- persists the real blueprint reference for the level loader. See GH #394.
	self.isPlaceholder = arg.isPlaceholder or false

	self:RegisterUserModifiableField("name", arg.name)
	self:RegisterUserModifiableField("parentData", arg.parentData)
	self:RegisterUserModifiableField("timeStamp", arg.timeStamp)
	self:RegisterUserModifiableField("transform", arg.transform)
	self:RegisterUserModifiableField("localTransform", arg.localTransform)
	self:RegisterUserModifiableField("variation", arg.variation)
	self:RegisterUserModifiableField("isDeleted", arg.isDeleted)
	self:RegisterUserModifiableField("isEnabled", arg.isEnabled)
	self:RegisterUserModifiableField("overrides", self.overrides)
end

function GameObject:RegisterUserModifiableField(p_FieldName, p_DefaultValue)
	self[p_FieldName] = p_DefaultValue
	self[p_FieldName .. m_TraceableField_Suffix] = p_DefaultValue
end

function GameObject:SetField(p_FieldName, p_NewValue, p_AutoModified)
	self[p_FieldName] = p_NewValue
	local originalValue = self[p_FieldName .. m_TraceableField_Suffix]
	local newValue = self[p_FieldName]

	if not p_AutoModified then
		local s_Comparable, s_Equal = m_TransformsEqual(newValue, originalValue)

		if s_Comparable then
			-- Transforms: compare by VALUE (see m_TransformsEqual).
			self.userModifiedFields[p_FieldName] = not s_Equal
		else
			-- Everything else keeps the original comparison unchanged.
			self.userModifiedFields[p_FieldName] = newValue ~= originalValue
		end
	end
end

function GameObject:IsUserModified()
	if self.origin == GameObjectOriginType.Custom or self.origin == GameObjectOriginType.CustomChild then
		return true
	end

	for l_FieldName, l_IsUserModified in pairs(self.userModifiedFields) do
		if l_IsUserModified == true then
			m_Logger:Write("GameObject: " .. self.name .. " has modified field: " .. l_FieldName .. " - original value: " .. tostring(self[l_FieldName .. m_TraceableField_Suffix]) .. " | new value: " .. tostring(self[l_FieldName]))
			return true
		end
	end

	return false
end

function GameObject:Disable(p_AutoModified)
	if self.children ~= nil then
		for _, l_ChildGameObject in pairs(self.children) do
			l_ChildGameObject:Disable(true)
		end
	end

	if self.gameEntities ~= nil then
		for _, l_GameEntity in pairs(self.gameEntities) do
			if l_GameEntity ~= nil then
				l_GameEntity:Disable()
			end
		end
	end

	self:SetField("isEnabled", false, p_AutoModified)
end

function GameObject:Enable(p_AutoModified)
	if self.children ~= nil then
		for _, l_ChildGameObject in pairs(self.children) do
			l_ChildGameObject:Enable(true)
		end
	end

	if self.gameEntities ~= nil then
		for _, l_GameEntity in pairs(self.gameEntities) do
			if l_GameEntity ~= nil then
				l_GameEntity:Enable()
			end
		end
	end

	self:SetField("isEnabled", true, p_AutoModified)
end

function GameObject:MarkAsDeleted(p_AutoModified)
	if self.origin == GameObjectOriginType.Custom or self.origin == GameObjectOriginType.CustomChild then
		m_Logger:Error("Cant delete a non-vanilla object, use destroy instead")
		return
	end

	if self.children ~= nil then
		for _, l_ChildGameObject in pairs(self.children) do
			l_ChildGameObject:MarkAsDeleted(true)
		end
	end

	if self.gameEntities ~= nil then
		for _, l_GameEntity in pairs(self.gameEntities) do
			if l_GameEntity ~= nil then
				l_GameEntity:Disable()
			end
		end
	end

	self:SetField("isDeleted", true, p_AutoModified)
end

function GameObject:MarkAsUndeleted(p_AutoModified)
	if self.origin == GameObjectOriginType.Custom or self.origin == GameObjectOriginType.CustomChild then
		m_Logger:Error("Cant undelete a non-vanilla object, use spawn instead")
		return
	end

	if self.children ~= nil then
		for _, l_ChildGameObject in pairs(self.children) do
			l_ChildGameObject:MarkAsUndeleted(true)
		end
	end

	if self.gameEntities ~= nil then
		for _, l_GameEntity in pairs(self.gameEntities) do
			if l_GameEntity ~= nil then
				l_GameEntity:Enable()
			end
		end
	end

	self:SetField("isDeleted", false, p_AutoModified)
end

function GameObject:Destroy() -- this will effectively destroy all entities and childentities. the gameobject becomes useless and needs to be dereferenced
	if self.origin == GameObjectOriginType.Vanilla or self.origin == GameObjectOriginType.NoHavok then
		m_Logger:Error("Cant destroy vanilla object, use disable instead")
		return
	end

	if self.children ~= nil then
		for _, l_ChildGameObject in pairs(self.children) do
			l_ChildGameObject:Destroy()
		end
	end

	-- Free the entities we created; only DISABLE anything else.
	--
	-- Destroying an entity that came with the level CRASHES the game, which is why this used to
	-- disable everything unconditionally. But disabling alone leaks a whole entity bus per call,
	-- and per-instance EBX editing now re-instantiates on every (debounced) edit, so that leak
	-- fires constantly. isEditorSpawned is set only for entities built by our own
	-- CreateEntitiesFromBlueprint calls (see the create hook), so it's the safe discriminator.
	--
	-- This distinction matters more than it looks: a VANILLA object is re-registered as Custom
	-- after its first EBX edit, so from the second edit on we're destroying an object whose
	-- original entities came from level data. Those stay untagged and keep being disabled; only
	-- the ones our respawn created get destroyed.
	if self.gameEntities ~= nil then
		for _, l_GameEntity in pairs(self.gameEntities) do
			if l_GameEntity ~= nil then
				if l_GameEntity.isEditorSpawned then
					local s_Ok, s_Err = pcall(function() l_GameEntity:Destroy() end)

					if not s_Ok then
						-- Never let a failed destroy take the object down; fall back to the old behaviour.
						print("[MapEditor] entity Destroy failed (" .. tostring(s_Err) .. "); disabling instead")
						pcall(function() l_GameEntity:Disable() end)
					end
				else
					l_GameEntity:Disable()
				end
			end
		end
	end

end

function GameObject:SetTransform(p_LinearTransform, p_UpdateCollision, p_AutoModified)
	if self.children ~= nil then
		for _, l_ChildGameObject in pairs(self.children) do
			if l_ChildGameObject == nil then
				m_Logger:Error("l_ChildGameObject is nil?")
				return false
			end

			-- We calculate the offset to get where the child gameobject should be
			local s_Offset = ToLocal(l_ChildGameObject.transform, self.transform)
			l_ChildGameObject.localTransform = s_Offset
			local s_LinearTransform = ToWorld(s_Offset, p_LinearTransform)

			local s_Response = l_ChildGameObject:SetTransform(s_LinearTransform, p_UpdateCollision, true)

			if not s_Response then
				return false
			end
		end
	end

	if self.gameEntities ~= nil then
		for _, l_GameEntity in pairs(self.gameEntities) do
			if l_GameEntity == nil then
				m_Logger:Error("GameEntity is nil?")
				return false
			end

			local s_Response = l_GameEntity:SetTransform(p_LinearTransform, p_UpdateCollision, self.isEnabled)

			if not s_Response then
				return false
			end
		end
	end

	self:SetField("transform", LinearTransform(p_LinearTransform), p_AutoModified)

	if self.parentData.guid ~= EMPTY_GUID then
		local s_Parent = GameObjectManager:GetGameObject(self.parentData.guid)

		if s_Parent ~= nil then
			local s_LocalTransform = ToLocal(self.transform, s_Parent.transform)
			self:SetField("localTransform", s_LocalTransform, p_AutoModified)
		else
			m_Logger:Write("Could not find parent")
		end
	end

	return true
end

function GameObject:GetGameObjectTransferData()
	local s_GameObjectTransferData = {
		guid = tostring(self.guid),
		name = self.name,
		blueprintCtrRef = self.blueprintCtrRef:GetTable(),
		parentData = self.parentData:GetTable(),
		transform = self.transform,
		localTransform = self.localTransform,
		variation = self.variation,
		isEnabled = self.isEnabled,
		isDeleted = self.isDeleted,
		creatorName = self.creatorName,
		timeStamp = self.timeStamp,
		origin = self.origin,
		realm = self.realm,
		isUserModified = self.isUserModified,
		overrides = self.overrides,
		isPlaceholder = self.isPlaceholder,
		originalRef = self.originalRef:GetTable()
		-- entities have to be set externally
	}

	local s_GameEntityTransferDatas = {}

	for _, l_GameEntity in pairs(self.gameEntities) do
		table.insert(s_GameEntityTransferDatas, l_GameEntity:GetGameEntityTransferData())
	end

	s_GameObjectTransferData.gameEntities = s_GameEntityTransferDatas

	return s_GameObjectTransferData
end

function GameObject:GetEntities()
	local s_Entities = {}

	for _, l_GameEntity in pairs(self.gameEntities) do
		table.insert(s_Entities, l_GameEntity.entity)
	end

	return s_Entities
end

local function m_ValuesEqual(a, b)
	if a == b then
		return true
	end

	if type(a) == "table" and type(b) == "table" then
		for _, l_Key in ipairs({ "x", "y", "z", "w" }) do
			if a[l_Key] ~= b[l_Key] then
				return false
			end
		end

		return true
	end

	return false
end

-- True when this edit sets the field back to its base value (a Revert, or manually matching the
-- base) — such an override is a no-op and must NOT be tracked, or a "base -> base" row lingers in
-- the Overrides panel and rides back in the transfer data on reselect.
local function m_IsRevertToBase(p_Field)
	local s_Leaf = p_Field

	while s_Leaf ~= nil and type(s_Leaf) == "table" and not isPrintable(s_Leaf.type) do
		s_Leaf = s_Leaf.value
	end

	if type(s_Leaf) ~= "table" or s_Leaf.oldValue == nil then
		return false
	end

	return m_ValuesEqual(s_Leaf.value, s_Leaf.oldValue)
end

--- The dot-path EBXManager:SetField would have returned for this override chain, derived without
--- touching a blueprint. Placeholders have none, so the path has to be computed rather than
--- produced as a side effect of writing the value.
---@param p_Field table override chain node
---@return string
local function m_OverridePath(p_Field)
	local s_Path = ''
	local s_Node = p_Field

	while type(s_Node) == 'table' and s_Node.field ~= nil do
		s_Path = s_Path .. '.' .. tostring(s_Node.field)
		s_Node = s_Node.value
	end

	return s_Path
end

function GameObject:SetOverrides(p_Overrides)
	-- A PLACEHOLDER has no engine entities and no instantiated blueprint by design (GH #394): the
	-- blueprint faults natively if handed to CreateEntitiesFromBlueprint, which is the whole reason
	-- it is a marker. Record the override so it still saves and bakes, but do not try to clone or
	-- re-instantiate — that produced "No instance passed" and "Spawning from clone failed: nil"
	-- on every edit, which read as failures when the object was behaving exactly as intended.
	if self.isPlaceholder then
		for _, l_Field in pairs(p_Overrides) do
			local s_Path = m_OverridePath(l_Field)

			if m_IsRevertToBase(l_Field) then
				self.overrides[s_Path] = nil
			else
				self.overrides[s_Path] = l_Field
			end
		end

		self:SetField('overrides', self.overrides)

		return true, ''
	end

	-- Per-instance clone-on-first-edit (Unity prefab semantics). The FIRST EBX edit to an
	-- instance deep-clones its blueprint so the change isolates to THIS instance; sibling
	-- instances keep reading the shared prefab until they're edited too. The clone is
	-- registered on the GameObjectManager keyed by this object's editor-guid, so it SURVIVES
	-- the delete+respawn below (which recreates the GameObject and would otherwise reset
	-- internalBlueprint to the shared original — that's the "only the first edit sticks, every
	-- later one hits the original blueprint" bug). On respawn the create hook re-adopts the
	-- registered clone as internalBlueprint, so edits accumulate on the SAME clone.
	if not self.internalBlueprint then
		local s_Registered = GameObjectManager:GetInstanceClone(self.guid)

		if s_Registered ~= nil then
			self.internalBlueprint = s_Registered
		else
			local s_Shared = self.blueprintCtrRef:Get()
			-- DETERMINISTIC clone guid, derived from the editor guid (which is identical on both
			-- realms) rather than GenerateGuid(), which is random and therefore minted a DIFFERENT
			-- guid per realm — the concrete reason a networked spawn couldn't be resolved by the
			-- peer. With both realms holding a clone under the same guid, replication has a guid
			-- each side can resolve locally. GH #391 (G2).
			-- Copy only the path this edit touches, not the whole blueprint. DeepClone is DEEP:
			-- editing one light's colour copied ~236 containers including the entire render chain
			-- (StaticModelEntityData / CompositeMeshAsset / MeshLodGroup / RigidMeshAsset), each
			-- under a fresh guid. That is both the allocation cost behind bulk-edit failures and
			-- why a baked object referenced meshes the level had never seen.
			--
			-- DataContainerExt:DeepCopy already does exactly this and had no callers: it copies a
			-- child only if its guid is in the map, and does not descend into unlisted ones — so
			-- every container from the root down to the edited one must be listed, which is what
			-- CollectPathContainers gathers. Unlisted children stay SHARED with the stock
			-- blueprint, which is correct: they are unmodified and already registered.
			local s_PathGuids = { [tostring(s_Shared.instanceGuid)] = Guid(tostring(self.guid)) }

			for _, l_Field in pairs(p_Overrides) do
				local s_Found = {}
				pcall(function() EBXManager:CollectPathContainers(s_Shared, l_Field, s_Found) end)

				for l_Guid, _ in pairs(s_Found) do
					-- Child guids are minted per realm and never leave this blueprint, so they do
					-- not need to agree across realms the way the ROOT guid does (that is the G2
					-- fix, preserved above).
					s_PathGuids[l_Guid] = s_PathGuids[l_Guid] or GenerateGuid()
				end
			end

			-- Always clone ONLY the edited path.
			--
			-- d3d3200 routed needNetworkId blueprints through a full DeepClone, believing a
			-- vehicle's entity build needed to own its whole graph. Measured on Vehicles/BMP2/BMP2:
			-- that full clone copies 8,304 DataContainers before the engine dies -- 4,369
			-- SoundWaveVariation and 3,053 voice-over nodes, about 90% of it audio and dialogue
			-- data, to change one float on vehicleConfig. It is the same cost problem 2ad600f was
			-- written to solve (a light copying ~236 containers), two orders of magnitude worse.
			--
			-- The reason path-only appeared to crash the F18 -- the whole reason that heuristic was
			-- added -- was almost certainly the nil-elementType throw fixed in c3337f9: the copy
			-- threw, the caller read that as "clone failed", and fell back to editing the SHARED
			-- blueprint, which is what actually crashed. With that guard in place the cheap copy
			-- should serve both.
			local s_Ok, s_Clone = pcall(function()
				return g_DataContainerExt:DeepCopy(s_Shared, s_PathGuids)
			end)

			if s_Ok and s_Clone ~= nil and (s_Shared == nil or s_Clone.instanceGuid ~= s_Shared.instanceGuid) then
				self.internalBlueprint = s_Clone
				-- Pass the vanilla ROD along too: the respawn below rebuilds this GameObject as
				-- Custom and would otherwise drop it, leaving the baked level unable to exclude
				-- the original.
				local s_VanillaRef = nil

				if self.originalRef ~= nil then
					pcall(function() s_VanillaRef = self.originalRef:GetTable() end)
				end

				GameObjectManager:RegisterInstanceClone(self.guid, s_Clone, self.blueprintCtrRef:GetTable(), s_VanillaRef)
			else
				-- DIAGNOSTIC (logging only, no behaviour change): the comment below says
				-- "lazy-load / error" without distinguishing them, so report which it actually was.
				-- DeepClone/DeepCopy RETURN THE ORIGINAL when they bail on a lazy container, so a
				-- clone whose guid matches the source is a bail, not a throw -- and that is the
				-- case the success test above rejects.
				local s_Why = 'unknown'

				if not s_Ok then
					s_Why = 'threw: ' .. tostring(s_Clone)
				elseif s_Clone == nil then
					s_Why = 'returned nil'
				elseif s_Shared ~= nil and tostring(s_Clone.instanceGuid) == tostring(s_Shared.instanceGuid) then
					s_Why = 'returned the ORIGINAL (same guid) -- a bail, typically lazy-loaded'
				end

				local s_RootLazy, s_RootReadOnly = nil, nil
				pcall(function() s_RootLazy = s_Shared.isLazyLoaded end)
				pcall(function() s_RootReadOnly = s_Shared.isReadOnly end)

				m_Logger:Error("CLONE-DIAG '" .. tostring(self.name) .. "': " .. s_Why ..
					" | rootLazy=" .. tostring(s_RootLazy) ..
					" rootReadOnly=" .. tostring(s_RootReadOnly))

				-- Clone bailed (lazy-load / error). Fall back to editing the SHARED blueprint
				-- (old behavior: the edit leaks to all instances, but that beats doing nothing).
				-- No respawn needed here — Disable/Enable re-reads the shared DC we just wrote.
				m_Logger:Warning("Per-instance clone failed for '" .. tostring(self.name) ..
					"'; editing the shared blueprint (this edit will affect ALL instances)")
				self.internalBlueprint = s_Shared
			end
		end
	end

	-- Track whether ANY field actually wrote. SetOverride returns no path when EBXManager:SetField
	-- could not descend the chain -- a malformed path, a nil node partway down, a refused
	-- reference. That must abort the re-instantiation below, because the CLONE is built from the
	-- SAME chain (CollectPathContainers walks it to decide which containers to copy): a chain that
	-- dead-ends yields a half-built clone, and handing that to CreateEntitiesFromBlueprint is a
	-- NATIVE crash that pcall cannot catch. Measured: one bad chain
	-- (`No instance passed: vehicleConfig`) took the whole dedicated server down a fraction of a
	-- second later.
	--
	-- This is the same protection the placeholder branch above already applies for the same two
	-- symptoms ("No instance passed" + "Spawning from clone failed: nil") -- generalised from
	-- "this object type can't be instantiated" to "this edit never landed, so there is nothing to
	-- rebuild from".
	-- Nothing to do, and not an error. SetOverrides gets called with an empty set on some paths
	-- (a re-instantiate after Apply has cleared the instance's overrides, for one), and reporting
	-- that as "no field applied" put an alarming line in the log describing a non-event.
	if p_Overrides == nil or next(p_Overrides) == nil then
		return true, ''
	end

	local s_AnyApplied = false


	for l_Key, l_Field in pairs(p_Overrides) do
		local s_Ok, s_Path = self:SetOverride(l_Field)

		if s_Ok and s_Path ~= nil and s_Path ~= '' then
			s_AnyApplied = true
		end
	end

	if not s_AnyApplied then
		-- Name the paths that failed. This used to say only that SOMETHING did not apply, which
		-- left "my edit does nothing" with no way to find out why -- reported from the field
		-- exactly that way. EBXManager logs the specific refusal per field; this ties them to the
		-- object and the chain the user actually touched.
		local s_Paths = {}

		for _, l_Field in pairs(p_Overrides) do
			s_Paths[#s_Paths + 1] = tostring(m_OverridePath(l_Field))
		end

		m_Logger:Error("SetOverrides: no field applied for '" .. tostring(self.name) ..
			"' (" .. table.concat(s_Paths, ', ') .. ") -- refusing to re-instantiate. Rebuilding " ..
			"from a chain that never resolved produces a half-built clone, which crashes the realm " ..
			"natively. The edit was NOT recorded; see the EBXManager line above for the field that " ..
			"could not be resolved.")

		self:SetField('overrides', self.overrides)

		return false, ''
	end

	self:SetField('overrides', self.overrides) -- Assigning to itself just to trigger the modified field.

	-- Make the edit visible on THIS instance. A per-instance clone needs a real respawn (the
	-- live entities were built from the shared DC and won't re-read the clone).
	--
	-- CLIENT-SIDE ONLY: the clone is a runtime DataContainer whose guid was minted locally
	-- (GenerateGuid) and is NOT registered in ResourceManager. Each realm deep-clones
	-- independently, so a networked / server-side spawn would replicate a blueprint guid the
	-- peer can't resolve → native crash (the server went down on the very first edit doing
	-- exactly this). So the client re-spawns the instance locally (non-networked) to render the
	-- change; the server just keeps the edit in its own clone + self.overrides for save/export.
	-- The shared-fallback path (clone bailed) keeps the cheap Disable/Enable on every realm.
	local s_Clone = GameObjectManager:GetInstanceClone(self.guid)

	-- Networked gameplay blueprints (vehicles) are REFRESHED, never rebuilt from their clone.
	--
	-- Measured in isolation, with no editor, WebUI or client involved -- a standalone mod that
	-- spawns Vehicles/BMP2/BMP2 directly (Admin/Mods/MakeWritableRepro):
	--
	--   write the SHARED blueprint, then spawn a fresh one   -> ok, entity bus returned
	--   spawn from a runtime CLONE (edited or not)           -> returns NIL, nothing spawned
	--   spawn from a clone a second time                     -> returns nil again, realm fine
	--   REGISTER the clone (ResourceManager:AddRegistry),
	--     root only or root + copied children, then spawn    -> CRASH, no Lua error, realm gone
	--
	-- So the rebuild cannot work for these, in either direction: an unregistered runtime clone is
	-- unresolvable and builds nothing, and making it resolvable is what kills the realm. That is
	-- the answer to the open question left in the comment below about whether replication expects
	-- the guid in ResourceManager -- it does, and putting it there faults.
	--
	-- Refreshing re-reads the DataContainer instead, which is safe and visibly applies the edit.
	--
	-- The trade, stated plainly: values the live entities read as they RUN take effect at once
	-- (a gravityModifier change flies the vehicle), while anything consumed only when an entity is
	-- BUILT waits for a level reload or a bake -- where injection happens at load time, which is
	-- the window in which custom blueprints are supported at all.
	--
	-- Static geometry is untouched and keeps rebuilding: bulk_edit_e2e stays 40/40.
	local s_PreferRefresh = false

	pcall(function()
		local s_SharedBp = self.blueprintCtrRef ~= nil and self.blueprintCtrRef:Get() or nil
		s_PreferRefresh = s_SharedBp ~= nil and s_SharedBp.needNetworkId == true
	end)

	-- Rebuilding a networked blueprint is only possible when a baked SHELL is available to act as
	-- the spawn root (docs/bake-pipeline.md §10); from a bare runtime clone the engine builds
	-- nothing. With a pool we rebuild and the edit shows immediately; without one we fall back to
	-- refreshing, where live-read fields still apply and build-time-only fields wait for a reload
	-- or a bake.
	if s_Clone ~= nil and s_PreferRefresh and not ShellPool:IsReady() then
		m_Logger:Write("Refreshing '" .. tostring(self.name) .. "' instead of rebuilding it: a " ..
			"networked blueprint cannot be rebuilt from anything produced at runtime.")

		-- A refresh alone shows nothing for these: the live entity reads the SHARED container while
		-- the edit lives in this instance's clone. Mirror the edit onto the shared blueprint so it
		-- is visible, temporarily -- VehiclePreview undoes it as soon as another object is
		-- previewed, the object is deleted, the level ends, or Apply runs. The saved data is
		-- untouched: the override stays per-instance and still bakes per-instance.
		if not VehiclePreview:Show(self) then
			self:Disable(true)
			self:Enable(true)
		end

	elseif s_Clone ~= nil then
		-- Re-instantiate on BOTH realms.
		--
		-- Each realm deep-clones independently and spawns its own copy NON-networked. The reason a
		-- NETWORKED spawn crashed the peer is specific and fixable: DeepClone is handed
		-- GenerateGuid(), which is RANDOM, so the two realms' clones carry DIFFERENT instance
		-- guids and neither side can resolve the other's. The server-side spawn itself is fine
		-- (verified).
		--
		-- NEXT STEP toward keeping real networking: derive the clone guid deterministically from
		-- the editor guid (identical on both realms) instead of GenerateGuid(), so both sides hold
		-- a clone under the SAME guid. Then a networked spawn may resolve locally on each peer.
		-- Unverified: whether replication resolves that guid per-peer or expects it in
		-- ResourceManager, which a runtime DC is not in. Probe before relying on it. GH #391.
		--
		-- Doing it on both realms is what keeps them consistent. Client-only re-instantiation
		-- left the client previewing a change the server had never applied, which silently
		-- desynced exactly the objects where it matters (capture points, vehicle spawners) —
		-- GH #391 (G2).
		--
		-- Trade-off, stated plainly: while edited, a needNetworkId object is running as a
		-- non-networked local copy on each realm. Both sides SHOW the same thing, but the engine
		-- is not replicating that entity's state until the level reloads and the override is
		-- re-applied from the save. Consistent-and-unreplicated beats desynced.
		GameObjectManager:RequestReinstantiate(self.guid, s_Clone)
	else
		self:Disable(true)
		self:Enable(true)
	end

	return true
end

-- Compares an override leaf's new value against the base value it captured (oldValue). Handles
-- scalars and vector tables (x/y/z/w).

-- Applies a single edited field to this instance's (already-resolved) internalBlueprint and
-- records it in self.overrides. The live re-instantiation is driven once by SetOverrides after
-- the whole field loop, NOT per field.
function GameObject:SetOverride(p_Field)
	-- Never let a nil overrides table lose an edit. The constructor defaults it to {}, but any
	-- code path that assigns it from an optional source can put nil back (that was the bug at
	-- GameObjectManager's custom-spawn adoption). Indexing nil here throws, and a throw means the
	-- user's edit is silently dropped -- so self-heal rather than fail.
	if self.overrides == nil then
		self.overrides = {}
	end

	local s_Path = EBXManager:SetField(self.internalBlueprint, p_Field, '')

	if s_Path then
		if m_IsRevertToBase(p_Field) then
			self.overrides[s_Path] = nil -- reverted to base: stop tracking it
		else
			self.overrides[s_Path] = p_Field
		end
	end

	return s_Path ~= '', s_Path
end

function GameObject:HasOverrides()
	if self.overrides then
		return GetLength(self.overrides) > 0
	end

	return false
end

return GameObject
