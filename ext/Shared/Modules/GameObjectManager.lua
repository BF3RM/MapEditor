---@class GameObjectManager
---@overload fun(p_Realm):GameObjectManager
GameObjectManager = class 'GameObjectManager'

---@type Logger
local m_Logger = Logger("GameObjectManager", false)

---@param p_Realm Realm
function GameObjectManager:__init(p_Realm)
	m_Logger:Write("Initializing GameObjectManager: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
	self:RegisterVars()
	self:RegisterEvents()
end

function GameObjectManager:RegisterEvents()
	if not SharedUtils:IsClientModule() then
		NetEvents:Subscribe('MapEditor:AdoptDiag', self, self.OnAdoptDiag)
		NetEvents:Subscribe('MapEditor:AabbDiag', self, self.OnAabbDiag)
		NetEvents:Subscribe('MapEditor:RequestBoxes', self, self.OnRequestBoxes)
	end

	if SharedUtils:IsClientModule() then
		NetEvents:Subscribe('MapEditor:ReplicatedEntities', self, self.OnReplicatedEntities)
	end

	Events:Subscribe("Shared:StoreTimeStamps", self, self.StoreTimeStamps)
	-- Drain the deferred "GameObjectReady" queue for load-injected objects a few per frame, so
	-- registering thousands of injected objects into the editor/WebUI tree doesn't block the frame
	-- (the objects already rendered NATIVELY with the level; this only makes them editable/appear
	-- in the tree, and doing it all at once on a huge save froze/crashed the client).
	Events:Subscribe("Engine:Update", self, self.OnInjectedReadyPump)
	-- Coalesce re-instantiation requests (see OnReinstantiatePump).
	Events:Subscribe("Engine:Update", self, self.OnReinstantiatePump)
	-- Apply saved overrides to load-injected objects a few per frame (see OnPendingOverridesPump).
	Events:Subscribe("Engine:Update", self, self.OnPendingOverridesPump)
end

---@param p_GUID_To_Timestamps table
function GameObjectManager:StoreTimeStamps(p_GUID_To_Timestamps)
	-- MERGE, don't replace: the table arrives in chunks now (a whole-table broadcast blew past the
	-- reliable NetEvent size limit on large saves), so replacing would leave only the final chunk.
	if self.m_GUID_To_Timestamps == nil then
		self.m_GUID_To_Timestamps = {}
	end

	for l_Guid, l_TimeStamp in pairs(p_GUID_To_Timestamps or {}) do
		self.m_GUID_To_Timestamps[l_Guid] = l_TimeStamp
	end
end

-- How many deferred injected objects to register into the editor/tree per frame.
local INJ_READY_PER_TICK = 25

--- Drain the deferred injected-object ready queue a few per frame (spread the editor/tree
--- registration so a huge save doesn't freeze the client all at once).
function GameObjectManager:OnInjectedReadyPump()
	local s_Queue = self.m_PendingInjectedReady
	if s_Queue == nil then
		return
	end

	local s_Total = #s_Queue
	if s_Total == 0 then
		return
	end

	local s_Idx = self.m_InjectedReadyIdx or 1
	local s_Done = 0
	while s_Idx <= s_Total and s_Done < INJ_READY_PER_TICK do
		local s_GameObject = s_Queue[s_Idx]
		-- Skip if it was deleted between queueing and now.
		if s_GameObject ~= nil and self.m_GameObjects[tostring(s_GameObject.guid)] ~= nil then
			Events:DispatchLocal("GameObjectManager:GameObjectReady", s_GameObject)
		end
		s_Idx = s_Idx + 1
		s_Done = s_Done + 1
	end

	if s_Idx > s_Total then
		self.m_PendingInjectedReady = {}
		self.m_InjectedReadyIdx = 1
	else
		self.m_InjectedReadyIdx = s_Idx
	end
end

-- Debounce window for re-instantiating an edited object. Dragging a slider fires an EBX edit per
-- tick; each one used to delete+respawn immediately (71 respawns in seconds froze the client), so
-- coalesce them and rebuild once the edits stop. The DATA is written to the clone immediately —
-- only the (expensive) respawn waits.
local REINSTANTIATE_DEBOUNCE = 0.2

-- How many load-injected objects may have their saved overrides applied per frame. Each one is a
-- clone plus a queued respawn, so this is deliberately small: loading a project is allowed to take
-- a while, but it must not take the client down.
local OVERRIDES_PER_TICK = 1

-- How many objects may be re-instantiated in a single frame. Each one is a DeepClone plus a full
-- delete/respawn of that object's entities, so this is the expensive path; spreading it keeps a
-- bulk edit from spiking a frame badly enough to take the client down.
local REINSTANTIATE_PER_TICK = 2

-- parentRepresentative is deliberately NOT set on spawns. See GH #202.
--
-- #202 asks for a unique ReferenceObjectData per spawn, handed to
-- EntityCreationParams.parentRepresentative, so entities from the same blueprint stop sharing
-- per-instance data. That was implemented and then removed again, because it kills the client:
-- spawning a VehicleBlueprint (Vehicles/BMP2/BMP2) terminates the client PROCESS outright — no
-- server error, no "left the server", no crash dump. Vehicle spawning worked before it and works
-- again without it.
--
-- It is not one bad field. A representative populated exactly as #202 describes crashes, and so
-- does a BARE ReferenceObjectData with nothing assigned at all, so it is the mere presence of a
-- runtime-built representative that a vehicle spawn cannot survive. The pcall around the old
-- builder never helped either: the failure is native, so Lua never sees it.
--
-- Nothing was proven lost by removing it. The commit that added it said plainly that it was NOT
-- verified to fix anything — #296/#364 could not be reproduced with it in place — so it was a
-- documented-correct change with no demonstrated benefit and a hard client crash attached.
--
-- If someone re-attempts this: a synthetic ROD whose `.blueprint` points at the very blueprint
-- being spawned says "this entity is represented by a reference to itself", which is not what a
-- representative means. The real representative of a level object is the ROD that references it
-- in its parent — for a vanilla-derived object that is already tracked as `originalRef`, and for a
-- vehicle it would be its spawn point. Reproduce #296/#364 FIRST, then verify a fix against them
-- and against spawning a vehicle.

--- Issue a strictly increasing creation timestamp.
--- The timestamp is what orders objects in the Scene Instances list and in the save file
--- (ProjectManager sorts by it). SharedUtils:GetTimeMS() only has millisecond resolution, so bulk
--- operations — Copy/Paste, Duplicate, a project load — stamp many objects identically, and a
--- non-stable sort then shuffles those siblings differently on every reload. Bumping by one
--- whenever the clock hasn't advanced keeps values unique and in creation order; the tiny forward
--- drift is irrelevant because this is only ever used as an ordering key.
function GameObjectManager:NextTimeStamp()
	local s_Now = SharedUtils:GetTimeMS()

	if self.m_LastTimeStamp == nil or s_Now > self.m_LastTimeStamp then
		self.m_LastTimeStamp = s_Now
	else
		self.m_LastTimeStamp = self.m_LastTimeStamp + 1
	end

	return self.m_LastTimeStamp
end

--- Queue a re-instantiation for an edited object, restarting the debounce timer if one is already
--- pending. Fired from OnReinstantiatePump once the edits settle.
function GameObjectManager:RequestReinstantiate(p_Guid, p_CloneDC)
	self.m_PendingReinstantiate[tostring(p_Guid)] = { dc = p_CloneDC, timer = REINSTANTIATE_DEBOUNCE }
end

--- Fire re-instantiations whose debounce window elapsed.
function GameObjectManager:OnReinstantiatePump(p_Delta)
	if self.m_PendingReinstantiate == nil or next(self.m_PendingReinstantiate) == nil then
		return
	end

	local s_Due = nil

	for l_Guid, l_Entry in pairs(self.m_PendingReinstantiate) do
		l_Entry.timer = l_Entry.timer - (p_Delta or 0.016)

		if l_Entry.timer <= 0 then
			s_Due = s_Due or {}
			s_Due[l_Guid] = l_Entry.dc
		end
	end

	if s_Due == nil then
		return
	end

	-- Rebuild at most REINSTANTIATE_PER_TICK per frame. Firing every due object at once is fine
	-- for one edit and fatal in bulk: recolouring a map's lights queued a dozen objects whose
	-- debounce expired together, so a single frame did a dozen full delete+respawn cycles and
	-- pushed a dozen GameObjectReady batches at the WebUI. The client died at ~96 objects, with
	-- flat memory and flat handle counts beforehand — a burst, not a leak. Anything not taken this
	-- tick simply stays pending with its timer already expired, so it goes next frame.
	-- Same shape as INJ_READY_PER_TICK above, which exists for exactly this reason.
	local s_Done = 0

	for l_Guid, l_Dc in pairs(s_Due) do
		if s_Done >= REINSTANTIATE_PER_TICK then
			break
		end

		-- Remove before rebuilding: the respawn re-enters this manager, and a fresh edit arriving
		-- mid-rebuild should queue a NEW request rather than be dropped.
		self.m_PendingReinstantiate[l_Guid] = nil
		self:ReinstantiateFromClone(l_Guid, l_Dc)
		s_Done = s_Done + 1
	end
end

--- Apply saved overrides to load-injected objects, a few per frame.
function GameObjectManager:OnPendingOverridesPump()
	local s_Queue = self.m_PendingOverrides

	if s_Queue == nil or #s_Queue == 0 then
		return
	end

	local s_Idx = self.m_PendingOverridesIdx or 1
	local s_Done = 0

	while s_Idx <= #s_Queue and s_Done < OVERRIDES_PER_TICK do
		local s_GameObject = self.m_GameObjects[s_Queue[s_Idx]]

		-- Skip anything deleted or already re-instantiated between queueing and now.
		if s_GameObject ~= nil and not s_GameObject.isCloneRespawn and s_GameObject:HasOverrides() then
			pcall(function() s_GameObject:SetOverrides(s_GameObject.overrides) end)
		end

		s_Idx = s_Idx + 1
		s_Done = s_Done + 1
	end

	if s_Idx > #s_Queue then
		self.m_PendingOverrides = {}
		self.m_PendingOverridesIdx = 1
	else
		self.m_PendingOverridesIdx = s_Idx
	end
end

function GameObjectManager:RegisterVars()
	--- Blueprints this session has made WRITABLE, keyed by instance guid.
	---
	--- Calling MakeWritable on a live vehicle blueprint breaks every later spawn of it -- measured
	--- with a probe that made the containers writable and wrote NOTHING. The damage is confined to
	--- that blueprint (touching LAV25 leaves BMP2 spawning fine), so we can name exactly which ones
	--- are poisoned and refuse those instead of crashing the client.
	self.m_WritableBlueprints = {}

	---@type table<string, GameObject>
	self.m_GameObjects = {}
	self.m_PendingCustomBlueprintGuids = {} -- this table contains all user spawned blueprints that await resolving
	self.m_PendingBlueprint = {}

	-- Which GameObject owns the entities being created RIGHT NOW. A stack, not a single value,
	-- because blueprints nest: a child blueprint pushes its own object and pops back to the parent.
	--
	-- This exists because m_PendingBlueprint is keyed by PARTITION, and two vehicles spawned from
	-- the same blueprint share one partition -- so that slot is a single cell they fight over.
	self.m_BlueprintStack = {}

	-- entity instanceId -> the GameObject it is currently filed under, so a mis-filed entity can be
	-- taken back by the object whose entity bus actually contains it.
	self.m_EntityOwners = {}

	-- The object a just-spawned blueprint is still receiving entities for (client replication
	-- arrives after the hooks return), and a token so a stale timer cannot clear a newer claim.

	-- [M1] Per-instance blueprint clones, keyed by editor GameObject guid:
	--   { dc = <cloned DataContainer>, originalRef = <blueprintCtrRef table> }
	-- Lives on the MANAGER (not the GameObject) so it survives the delete+respawn that
	-- re-instantiation performs — the rebuilt GameObject re-adopts its clone from here.
	self.m_InstanceClones = {}

	-- [M1] Debounced re-instantiation requests: guid -> { dc, timer } (see OnReinstantiatePump).
	self.m_PendingReinstantiate = {}

	-- Last timestamp handed out by NextTimeStamp (keeps creation stamps strictly increasing).
	self.m_LastTimeStamp = 0

	-- Objects placed as markers rather than instantiated (see IsPlaceholderBlueprint / GH #394),
	-- kept separately so the viewport can draw them every frame without scanning every object.
	self.m_Placeholders = {}

	-- Guids whose saved overrides still need applying after a load-time spawn (see the queue site
	-- in ResolveRootObject). Drained a few per frame by OnPendingOverridesPump.
	self.m_PendingOverrides = {}
	self.m_PendingOverridesIdx = 1

	-- Blueprints whose SHARED DataContainer has been permanently modified by Apply-to-Blueprint,
	-- keyed by blueprint instance guid -> { partitionGuid, name }. Apply writes the stock,
	-- partition-resident blueprint and then CLEARS the instance's overrides, so after it runs
	-- nothing on any GameObject records the change and it would silently vanish from the bake.
	-- Saving needs this list to serialize those partitions too (GH #396).
	self.m_AppliedBlueprints = {}

	-- Set to the editor guid while one of OUR CreateEntitiesFromBlueprint calls is in flight.
	-- The generic EntityFactory:Create hook fires for every entity the engine makes and carries no
	-- indication of who asked for it, so this window is the only way to tell entities we own from
	-- the level's own geometry — and that distinction is what makes destroying them safe.
	self.m_SpawningForGuid = nil


	self.m_ProcessedEntities = {}
	self.m_PendingEntities = {}
	self.m_VanillaGameObjectGuids = {}

	--- key: child (ReferenceObjectData) guid, value: parent GameObject guid
	self.m_ReferenceObjectDatas = {}

	-- workaround for origin type 3
	self.m_GUID_To_Timestamps = {}

	-- Load-injected GameObjects awaiting their (spread-over-frames) GameObjectReady dispatch.
	self.m_PendingInjectedReady = {}
	self.m_InjectedReadyIdx = 1
end

function GameObjectManager:OnLevelDestroy()
	-- A reload gives clean containers back, so nothing stays poisoned across levels.
	self.m_WritableBlueprints = {}

	self:RegisterVars()
end

---@param p_GameObjectGuid string|Guid
function GameObjectManager:GetGameObject(p_GameObjectGuid)
	return self.m_GameObjects[tostring(p_GameObjectGuid)]
end

--- Blueprints this session has made WRITABLE, keyed by instance guid.
---
--- Calling MakeWritable on a live vehicle blueprint breaks every later spawn of it -- measured with
--- a probe that made the containers writable and wrote NOTHING (docs/vehicle-edit-crash.md). The
--- damage is confined to that blueprint: touching LAV25 leaves BMP2 spawning fine.
---
--- So we can know exactly which blueprints are poisoned and refuse to spawn them, which turns a
--- client crash into a message. Cleared on level load, since a reload gives clean containers back.
--- Blueprints that must NOT be handed to CreateEntitiesFromBlueprint.
---
--- Spawning these faults NATIVELY: the client dies ~3s later with no Lua error, no JS error and no
--- crash dump — the log simply stops (GH #393). Established by controlled tests: an ordinary
--- SpatialPrefabBlueprint spawns fine, a LogicPrefabBlueprint spawns fine, and CapturePointPrefab
--- dies whether networked or not, so it is neither prefab type nor replication.
---
--- These objects don't need to work in the editor. They need to be placeable and saveable so the
--- level loader emits a real one at generation time, which is what the placeholder path gives us.
---
--- Deliberately a conservative PATH match rather than an inferred rule: the principled candidate
--- ("carries an InterfaceDescriptorData with connections") over-matches today, since logic prefabs
--- have connections and spawn fine. Extend this list as more offenders are found; a false positive
--- costs a live preview, a false negative costs the client.
local PLACEHOLDER_NAME_PATTERNS = {
	'^gameplay/level_setups/', -- capture points, gamemode components (verified: CapturePointPrefab_HQ)
	'^weapons/',               -- SoldierWeaponBlueprint (verified: Weapons/SV98/SV98)
}

---@param p_Name string blueprint name
---@return boolean
function GameObjectManager:IsPlaceholderBlueprint(p_Name)
	if p_Name == nil then
		return false
	end

	local s_Lower = tostring(p_Name):lower()

	for _, l_Pattern in ipairs(PLACEHOLDER_NAME_PATTERNS) do
		if string.find(s_Lower, l_Pattern) ~= nil then
			return true
		end
	end

	return false
end

--- Place an object WITHOUT instantiating it: build the GameObject by hand, give it one synthetic
--- spatial entity so it stays visible and clickable, and register it exactly like a real spawn.
--- Everything the level loader needs (blueprintCtrRef, transform, variation, overrides) is carried
--- and saved, so the generated level contains the genuine prefab.
function GameObjectManager:SpawnPlaceholder(p_GameObjectGuid, p_SenderName, p_BlueprintPartitionGuid,
										   p_BlueprintInstanceGuid, p_ParentData, p_LinearTransform,
										   p_Variation, p_Overrides, p_TimeStamp, p_Blueprint, p_ObjectBlueprint)
	local s_Guid = Guid(tostring(p_GameObjectGuid))

	-- parentData arrives as a PLAIN table: it is JSON from the WebUI command, and
	-- GameObjectParentData:GetRootParentData() returns a raw table too. GetGameObjectTransferData
	-- calls parentData:GetTable(), so it has to be wrapped or that throws (and the throw happens
	-- inside the GameObjectReady handler, where it is swallowed — the object then exists in Lua but
	-- never reaches the WebUI). Wrapping an existing instance is harmless, so this is unconditional.
	local s_ParentData = GameObjectParentData(p_ParentData or GameObjectParentData:GetRootParentData())

	---@type GameObject
	local s_GameObject = GameObject {
		guid = s_Guid,
		name = p_ObjectBlueprint.name,
		parentData = s_ParentData,
		transform = LinearTransform(p_LinearTransform),
		variation = p_Variation or 0,
		origin = GameObjectOriginType.Custom,
		timeStamp = p_TimeStamp or self:NextTimeStamp(),
		isDeleted = false,
		isEnabled = true,
		gameEntities = {},
		children = {},
		realm = Realm.Realm_ClientAndServer,
		originalRef = CtrRef({}),
		overrides = p_Overrides,
		creatorName = p_SenderName,
		isPlaceholder = true,
	}

	s_GameObject.blueprintCtrRef = CtrRef {
		typeName = p_Blueprint.typeInfo.name,
		name = p_ObjectBlueprint.name,
		partitionGuid = tostring(p_BlueprintPartitionGuid),
		instanceGuid = tostring(p_BlueprintInstanceGuid),
	}

	-- One synthetic spatial entity so the WebUI can build a selectable AABB for it. Without this
	-- the object exists but can only be reached from the Scene Instances tree, never clicked in
	-- the world — which defeats the point of placing it.
	local s_Stub = PlaceholderEntity {
		instanceId = self:NextPlaceholderInstanceId(),
		typeName = p_Blueprint.typeInfo.name,
	}
	s_GameObject.gameEntities[s_Stub.instanceId] = s_Stub

	self:AddGameObjectToTable(s_GameObject)
	self.m_Placeholders[tostring(s_Guid)] = s_GameObject

	m_Logger:Write('Placed (not instantiated) ' .. tostring(p_ObjectBlueprint.name))

	Events:DispatchLocal("GameObjectManager:GameObjectReady", s_GameObject)

	return true
end

--- Instance ids for synthetic placeholder entities. Kept far above real engine instance ids so it
--- can never collide with one (the WebUI keys its entity map by this).
function GameObjectManager:NextPlaceholderInstanceId()
	self.m_PlaceholderInstanceId = (self.m_PlaceholderInstanceId or 2000000000) + 1
	return self.m_PlaceholderInstanceId
end

---@param p_GameObjectGuid string|Guid
---@param p_SenderName string
---@param p_BlueprintPartitionGuid string|Guid
---@param p_BlueprintInstanceGuid string|Guid
---@param p_ParentData table?
---@param p_LinearTransform LinearTransform
---@param p_Variation integer
---@param p_IsPreviewSpawn boolean
---@param p_Overrides table
---@param p_TimeStamp number
function GameObjectManager:InvokeBlueprintSpawn(p_GameObjectGuid, p_SenderName, p_BlueprintPartitionGuid, p_BlueprintInstanceGuid, p_ParentData, p_LinearTransform, p_Variation, p_IsPreviewSpawn, p_Overrides, p_TimeStamp)
	if p_BlueprintPartitionGuid == nil or
		p_BlueprintInstanceGuid == nil or
		p_LinearTransform == nil then
		m_Logger:Error('InvokeBlueprintSpawn: One or more parameters are nil.')

		return false
	end

	p_Variation = p_Variation or 0

	local s_Blueprint = ResourceManager:FindInstanceByGuid(Guid(tostring(p_BlueprintPartitionGuid)), Guid(tostring(p_BlueprintInstanceGuid)))

	if s_Blueprint == nil then
		m_Logger:Error("Couldn't find the specified instance: Partition: " .. tostring(p_BlueprintPartitionGuid) .. " | Instance: " .. tostring(p_BlueprintInstanceGuid))
		return false
	end

	local s_ObjectBlueprint = _G[s_Blueprint.typeInfo.name](s_Blueprint)

	-- Some gameplay prefabs cannot be instantiated at all without killing the client (GH #393).
	-- Place a marker instead and keep the real blueprint reference for the level loader (GH #394).
	if self:IsPlaceholderBlueprint(s_ObjectBlueprint.name) then
		if p_IsPreviewSpawn then
			-- No drag-preview ghost for these: building the entities is precisely what kills the
			-- client, so there is nothing safe to show. MessageActions:PreviewSpawn treats false as
			-- "no preview" and carries on, which is the correct degradation here.
			return false
		end

		return self:SpawnPlaceholder(p_GameObjectGuid, p_SenderName, p_BlueprintPartitionGuid,
			p_BlueprintInstanceGuid, p_ParentData, p_LinearTransform, p_Variation, p_Overrides,
			p_TimeStamp, s_Blueprint, s_ObjectBlueprint)
	end

	-- m_Logger:Write('Invoking spawning of blueprint: '.. s_ObjectBlueprint.name .. " | ".. s_Blueprint.typeInfo.name .. ", ID: " .. p_GameObjectGuid .. ", Instance: " .. tostring(p_BlueprintInstanceGuid) .. ", Variation: " .. p_Variation)
	if p_IsPreviewSpawn == false then
		self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = { customGuid = p_GameObjectGuid, creatorName = p_SenderName, parentData = p_ParentData, overrides = p_Overrides, timeStamp = p_TimeStamp }
	else
		local s_PreviewSpawnParentData = GameObjectParentData {
			guid = EMPTY_GUID, -- Root
			typeName = "previewSpawn",
		}
		m_Logger:Write("Added s_PreviewSpawnParentData: " .. tostring(s_PreviewSpawnParentData.guid))
		m_Logger:WriteTable(s_PreviewSpawnParentData)
		self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = { customGuid = p_GameObjectGuid, creatorName = p_SenderName, parentData = s_PreviewSpawnParentData, overrides = p_Overrides, timeStamp = p_TimeStamp }
	end

	-- Refuse rather than crash.
	--
	-- Once a blueprint has been made writable this level, building entities from it kills the
	-- client -- reliably, on the next spawn or the one after. Apply-to-Blueprint does exactly that,
	-- which is why "I pressed apply, then spawned another BMP and crashed" was the original report.
	-- A refusal the user can read beats a dead session.
	local s_SpawnBpGuid = tostring(p_BlueprintInstanceGuid)

	if self.m_WritableBlueprints[s_SpawnBpGuid] ~= nil then
		m_Logger:Error("Refusing to spawn '" .. tostring(self.m_WritableBlueprints[s_SpawnBpGuid]) ..
			"': this blueprint was modified in place (Apply to Blueprint) earlier this session, and " ..
			"spawning it again crashes the client. Reload the level to spawn it again -- the edit " ..
			"itself is saved and bakes correctly.")
		return false
	end

	local s_Params = EntityCreationParams()
	s_Params.transform = p_LinearTransform
	s_Params.variationNameHash = p_Variation
	s_Params.networked = s_ObjectBlueprint.needNetworkId

	-- Do NOT restore the preview here.
	--
	-- This used to call Restore() + Suspend() to spawn against a "clean" blueprint, and that was
	-- backwards: it CREATED the divergence it meant to avoid. Each realm restores when IT reaches
	-- this line, so for a window one realm holds baseline data while the other still holds the
	-- preview -- and a vehicle built while the two disagree kills the client.
	--
	-- Measured with a raw blueprint write (RawWriteProbe), spawning afterwards:
	--     modified on the SERVER only        -> client dies
	--     modified on BOTH realms, identical -> both survive
	--
	-- So the safe state is both realms modified in the same way, which is exactly what a preview
	-- already establishes. Leave it alone and spawn.

	self.m_SpawningForGuid = tostring(p_GameObjectGuid)
	local s_BusOk, s_EntityBus = pcall(function()
		return EntityManager:CreateEntitiesFromBlueprint(s_Blueprint, s_Params)
	end)
	self.m_SpawningForGuid = nil

	if not s_BusOk then
		m_Logger:Error("CreateEntitiesFromBlueprint threw: " .. tostring(s_EntityBus))
		self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = nil
		return false
	end

	if s_EntityBus == nil then
		m_Logger:Error("Spawning failed")
		self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = nil
		return false
	end

	return true
end

---@param p_HookCtx HookContext
---@param p_Blueprint DataContainer
---@param p_Transform LinearTransform
---@param p_Variation integer
---@param p_Parent DataContainer|nil
function GameObjectManager:OnAabbDiag(p_Player, p_Text)
	m_Logger:Error('AABB-DIAG CLIENT ' .. tostring(p_Text))
end

function GameObjectManager:OnAdoptDiag(p_Player, p_Text)
	m_Logger:Error('ADOPT-DIAG CLIENT ' .. tostring(p_Text))
end

---@param p_HookCtx HookContext
---@param p_Blueprint DataContainer
---@param p_Transform LinearTransform
---@param p_Variation integer
---@param p_Parent DataContainer|nil
function GameObjectManager:OnEntityCreateFromBlueprint(p_HookCtx, p_Blueprint, p_Transform, p_Variation, p_Parent)
	local s_PendingCustomBlueprintInfo = self.m_PendingCustomBlueprintGuids[tostring(p_Blueprint.instanceGuid)]

	-- The pending table is keyed by BLUEPRINT guid, so two objects spawned from the same blueprint
	-- share one entry and the second overwrites the first. The entities then get adopted by whichever
	-- object the entry happens to name -- so a freshly spawned vehicle has no AABB while the
	-- PREVIOUS one shows the new object's outline. (The gizmo stays correct because it comes from the
	-- GameObject's own transform, not from entities, which is exactly how this presents.)
	--
	-- When WE are doing the spawning, m_SpawningForGuid names the object unambiguously -- it is set
	-- immediately around our own CreateEntitiesFromBlueprint call and this hook fires inside it. Use
	-- it, and leave the table lookup as the fallback for load-time and vanilla spawns.
	if self.m_SpawningForGuid ~= nil and s_PendingCustomBlueprintInfo ~= nil and
		tostring(s_PendingCustomBlueprintInfo.customGuid) ~= self.m_SpawningForGuid then
		local s_Corrected = {}

		for l_Key, l_Value in pairs(s_PendingCustomBlueprintInfo) do
			s_Corrected[l_Key] = l_Value
		end

		s_Corrected.customGuid = self.m_SpawningForGuid
		s_PendingCustomBlueprintInfo = s_Corrected
	end

	if SharedUtils:IsServerModule() and s_PendingCustomBlueprintInfo and Guid(s_PendingCustomBlueprintInfo.customGuid) == PREVIEW_GUID then
		m_Logger:Error('Tried to spawn the preview object on server, something went wrong.')
		p_HookCtx:Return()
	end

	-- We dont load vanilla objects if the flag is active
	if ME_CONFIG.LOAD_VANILLA == false and s_PendingCustomBlueprintInfo == nil then
		return
	end

	if p_Parent ~= nil and p_Parent.instanceGuid == HAVOK_GUID then
		m_Logger:Write("Loading havok WorldPartData")
	end

	-- TEMP: who is adopting these entities? The CLIENT draws the outline, and client Lua output
	-- reaches no readable log, so it reports to the server.
	if s_PendingCustomBlueprintInfo ~= nil then
		local s_Line = 'bp=' .. tostring(p_Blueprint.instanceGuid):sub(-6) ..
			' -> object=' .. tostring(s_PendingCustomBlueprintInfo.customGuid):sub(-6) ..
			' spawningFor=' .. tostring(self.m_SpawningForGuid ~= nil and
				tostring(self.m_SpawningForGuid):sub(-6) or 'nil')

		if SharedUtils:IsClientModule() then
			NetEvents:SendLocal('MapEditor:AdoptDiag', s_Line)
		else
			m_Logger:Error('ADOPT-DIAG SERVER ' .. s_Line)
		end
	end

	-- On the CLIENT a networked vehicle's entity bus comes back EMPTY (measured: server 3 entities,
	-- client 0) -- the entities are not created locally, they arrive by replication after every
	-- hook has returned. So the client's only chance to attribute them is the late-entity path, and
	-- the partition-keyed slot it used is stale: a vehicle's SUB-blueprints only fire this hook the
	-- first time they are instantiated, so their slots point at the first vehicle ever spawned and
	-- every later vehicle's entities pile onto it.
	--
	-- This names the object that is actually awaiting entities right now. Time-boxed, because
	-- anything arriving later is level traffic that must keep using the partition slot.

	local s_BlueprintInstanceGuid = tostring(p_Blueprint.instanceGuid)
	local s_BlueprintPartitionGuid = InstanceParser:GetPartition(p_Blueprint.instanceGuid)
	--local s_BlueprintPrimaryInstance = InstanceParser:GetPrimaryInstance(s_BlueprintPartitionGuid)

	local s_ParentInstanceGuid
	-- local s_ParentPartitionGuid
	-- local s_ParentPrimaryInstance

	if p_Parent ~= nil then
		s_ParentInstanceGuid = tostring(p_Parent.instanceGuid)
		-- s_ParentPartitionGuid = InstanceParser:GetPartition(s_ParentInstanceGuid)
		-- s_ParentPrimaryInstance = InstanceParser:GetPrimaryInstance(s_ParentPartitionGuid)
	end

	-- Load-screen injection: was this entity pre-injected into the LevelData by LevelInjector?
	-- If so, we adopt its saved editor identity below and must NOT drop it via the baked-static
	-- skip, nor manually init/enable it (the engine already did, since it spawned natively).
	local s_InjectedInfo = nil
	if ME_CONFIG.LOAD_INJECTION then
		-- Vanilla injected objects keep their real original ROD guid.
		if s_ParentInstanceGuid ~= nil then
			s_InjectedInfo = LevelInjector:GetInjected(s_ParentInstanceGuid)
		end
		-- Custom injected objects (fresh RODs, no guid) match by blueprint + position instead.
		if s_InjectedInfo == nil and LevelInjector:IsInjectedBlueprint(tostring(p_Blueprint.instanceGuid)) then
			s_InjectedInfo = LevelInjector:GetInjectedByBpPos(p_Blueprint.instanceGuid, p_Transform)
		end
	end

	local s_Blueprint = _G[p_Blueprint.typeInfo.name](p_Blueprint) -- do we need that? for the name?
	-- NOTE: baked static geometry (StaticModelEntityData / StaticModelGroupEntityData /
	-- DebrisClusterData) is NO LONGER skipped. Dropping it broke NoHavok (whose whole point is to
	-- make those statics individually editable). The reason it was skipped — registering thousands
	-- at once froze the client — is a SYNC problem, not a size problem: fixed by routing bulk
	-- level-load registration through the async per-frame pump (see the dispatch below +
	-- OnInjectedReadyPump), so any object count spreads over frames without blocking.

	---@type CtrRef
	local s_OriginalRef = CtrRef({})
	local s_Variation = p_Variation

	if p_Parent ~= nil then
		s_OriginalRef = CtrRef {
			typeName = p_Parent.typeInfo.name,
			instanceGuid = s_ParentInstanceGuid,
			partitionGuid = InstanceParser:GetPartition(s_ParentInstanceGuid)
		}

		-- Overwrite variation if ReferenceObjectData has it
		local s_ROD = ReferenceObjectData(p_Parent)

		if s_ROD.objectVariation then
			s_Variation = ObjectVariation(s_ROD.objectVariation).nameHash
		end
	end

	local s_TimeStamp
	if s_PendingCustomBlueprintInfo then
		s_TimeStamp = s_PendingCustomBlueprintInfo.timeStamp
	end
	if not s_TimeStamp then
		s_TimeStamp = self:NextTimeStamp()
	end

	---@type GameObject
	local s_GameObject = GameObject {
		guid = GenerateTempGuid(), -- we set a tempGuid, it will later be set to a vanilla or custom guid
		name = s_Blueprint.name,
		parentData = GameObjectParentData {},
		transform = p_Transform,
		variation = s_Variation,
		origin = GameObjectOriginType.Vanilla,
		timeStamp = s_TimeStamp,
		isDeleted = false,
		isEnabled = true,
		gameEntities = {},
		children = {},
		realm = Realm.Realm_ClientAndServer,
		originalRef = s_OriginalRef,
	}

	if s_PendingCustomBlueprintInfo ~= nil then
		s_GameObject.creatorName = s_PendingCustomBlueprintInfo.creatorName

		-- Adopt overrides ONLY if the spawn actually carried some. A plain spawn carries none, and
		-- assigning that nil replaced the constructor's `arg.overrides or {}` with nil -- after
		-- which the FIRST edit to that object threw
		--     GameObject.lua:567: attempt to index a nil value (field 'overrides')
		-- inside SetOverride, so the edit was never recorded, and the subsequent Apply correctly
		-- reported "nothing to apply". Reported from the field as "changes to vehicles do nothing,
		-- and I can't change gravity after the first time" -- level objects (which keep their {})
		-- worked while spawned ones silently refused every edit.
		--
		-- The sibling adoption for injected objects a few lines below is already guarded this way.
		if s_PendingCustomBlueprintInfo.overrides ~= nil then
			s_GameObject.overrides = s_PendingCustomBlueprintInfo.overrides
		end
	end

	s_GameObject.blueprintCtrRef = CtrRef {
		typeName = p_Blueprint.typeInfo.name,
		name = s_Blueprint.name,
		partitionGuid = s_BlueprintPartitionGuid,
		instanceGuid = s_BlueprintInstanceGuid
	}

	-- Load-screen injection: adopt the saved editor identity instead of computing a fresh guid.
	-- The object spawned natively with the level (engine already inited/enabled it), so wasInjected
	-- also skips the manual init/enable paths below.
	if s_InjectedInfo ~= nil then
		s_GameObject.wasInjected = true
		s_GameObject.guid = Guid(s_InjectedInfo.guid)
		s_GameObject.origin = s_InjectedInfo.origin

		if s_InjectedInfo.timeStamp then
			s_GameObject.timeStamp = s_InjectedInfo.timeStamp
		end

		if s_InjectedInfo.overrides then
			s_GameObject.overrides = s_InjectedInfo.overrides
		end

		s_GameObject.isDeleted = s_InjectedInfo.isDeleted or false

		-- Only adopt a REAL parent guid. Saved parentData often carries the string "nil" (from
		-- tostring(nil) at save time), or the EMPTY_GUID root sentinel — both mean "no parent", i.e.
		-- a root object. Leaving the default parentData (Lua-nil guid) lets the root-dispatch check
		-- below recognise it and send it to the WebUI tree. (A malformed "nil"-string guid would
		-- otherwise fail the `== nil` check and the object would never reach the tree.)
		if s_InjectedInfo.parentData and s_InjectedInfo.parentData.guid then
			local s_PGuid = tostring(s_InjectedInfo.parentData.guid)
			if s_PGuid ~= "nil" and s_PGuid ~= "" and s_PGuid ~= "00000000-0000-0000-0000-000000000000" then
				s_GameObject.parentData = GameObjectParentData(s_InjectedInfo.parentData)
			end
		end

		if s_InjectedInfo.variation and s_InjectedInfo.variation ~= 0 then
			s_GameObject.variation = s_InjectedInfo.variation
		end

		-- NOTE: a multi-entity vanilla object re-enters the hook once per sub-blueprint, all under
		-- the same original ROD guid, so re-adopting the same guid here is expected (one editor
		-- object). No warning.
		self.m_GameObjects[tostring(s_GameObject.guid)] = s_GameObject

		if s_GameObject.origin == GameObjectOriginType.Vanilla or s_GameObject.origin == GameObjectOriginType.NoHavok then
			self.m_VanillaGameObjectGuids[tostring(s_GameObject.guid)] = s_GameObject.guid
		end

		goto injected_resolved
	end

	if self.m_GameObjects[tostring(s_GameObject.guid)] ~= nil then
		m_Logger:Warning("GameObject with guid already existed, overwriting: " .. tostring(s_GameObject.guid))
	end

	self.m_GameObjects[tostring(s_GameObject.guid)] = s_GameObject

	--- Resolve the parent
	if p_Parent ~= nil then
		local s_ReferenceObjectData = self.m_ReferenceObjectDatas[tostring(p_Parent.instanceGuid)]
		local s_ParentGameObjectGuid
		local s_ParentGameObject

		if s_ReferenceObjectData ~= nil then
			s_ParentGameObjectGuid = s_ReferenceObjectData.parentGuid
			s_ParentGameObject = self.m_GameObjects[tostring(s_ParentGameObjectGuid)]
		end
		-- Root object
		if s_ReferenceObjectData == nil or s_ParentGameObjectGuid == nil or s_ParentGameObject == nil then
			self:ResolveRootObject(s_GameObject, s_PendingCustomBlueprintInfo)
		else
			-- Child object
			m_Logger:Write("ResolveChildObject")
			m_Logger:Write("Child: " .. s_GameObject.name)
			m_Logger:Write("Parent: " .. s_ParentGameObject.name)
			self:ResolveChildObject(s_GameObject, s_ParentGameObject)
			self.m_ReferenceObjectDatas[tostring(p_Parent.instanceGuid)] = nil
		end
	else
		if s_PendingCustomBlueprintInfo == nil then
			m_Logger:Write('Found vanilla object without parent. Name: ' .. tostring(s_Blueprint.name) .. ', Guid: ' .. tostring(s_Blueprint.instanceGuid)) -- TODO: do we need to add these objects?
			-- Ignore, these are usually weapons and soldier entities, which we dont support (at least for now)
			self:ResolveRootObject(s_GameObject, s_PendingCustomBlueprintInfo)
		else
			-- Custom object, parent is root
			m_Logger:Write('Found custom object without parent')
			self:ResolveRootObject(s_GameObject, s_PendingCustomBlueprintInfo)
		end
	end

	::injected_resolved::

	--- Save ReferenceObjectDatas that the blueprint might have, to resolve parents of descendants.
	--For prefabs:
	if s_Blueprint.objects ~= nil then
		for _, l_Member in pairs(s_Blueprint.objects) do
			-- A Frostbite object array can hold NULL entries; pairs yields them as nil and the
			-- :Is() below then dies with "attempt to index a nil value". This runs inside the
			-- entity-creation hook during level load, so one null member used to take the whole
			-- server down mid-map. RealityMod's reworked levels contain them.
			if l_Member ~= nil and l_Member:Is('ReferenceObjectData') then
				self.m_ReferenceObjectDatas[tostring(l_Member.instanceGuid)] = { parentGuid = s_GameObject.guid, typeName = l_Member.typeInfo.name }
			end
		end
	end

	-- For blueprints:
	if s_Blueprint.object ~= nil then
		if s_Blueprint.object:Is('ReferenceObjectData') then
			self.m_ReferenceObjectDatas[tostring(s_Blueprint.object.instanceGuid)] = { parentGuid = s_GameObject.guid, typeName = s_Blueprint.object.typeInfo.name }
		end
	end

	if s_BlueprintPartitionGuid then
		self.m_PendingBlueprint[s_BlueprintPartitionGuid] = s_GameObject
	end

	---^^^^ This is parent to children / top to bottom ^^^^

	-- Entities created inside this call belong to THIS object. Attribution keyed on the blueprint
	-- hook is trustworthy -- it was instrumented over three-spawn runs and never once named the
	-- wrong object -- whereas the partition-keyed slot below is stale as soon as a second instance
	-- of the same blueprint exists.
	table.insert(self.m_BlueprintStack, s_GameObject)

	---@type EntityBus|nil
	local s_EntityBus = p_HookCtx:Call()

	table.remove(self.m_BlueprintStack)

	if s_EntityBus == nil then
		return
	end
	---vvvv This is children to parent / bottom to top vvvv

	-- Custom object have to be manually initialized. Injected objects spawned natively with the
	-- level, so the engine already inited them — re-initing would double-init and can crash.
	if not s_GameObject.wasInjected and (s_GameObject.origin == GameObjectOriginType.Custom or s_GameObject.origin == GameObjectOriginType.CustomChild) then
		for _, l_Entity in pairs(s_EntityBus.entities) do
			-- TODO: find out if the blueprint is client or server only and init in correct realm, maybe Realm_ClientAndServer otherwise.
			l_Entity:Init(self.m_Realm, true)
		end
	end

	-- TEMP DIAG: how big is the bus, and how much of it does this object actually keep? A spawned
	-- vehicle reaching the WebUI with gameEntitiesData = [] has to be one of: an empty bus, or a
	-- bus whose entities were all pre-claimed elsewhere.
	do
		local s_Total, s_Claimed = 0, 0

		for _, l_E in pairs(s_EntityBus.entities) do
			s_Total = s_Total + 1

			if self.m_ProcessedEntities[l_E.instanceId] then
				s_Claimed = s_Claimed + 1
			end
		end

		if s_PendingCustomBlueprintInfo ~= nil then
			local s_Line = 'BUS obj=' .. tostring(s_GameObject.guid):sub(-6) ..
				' entities=' .. s_Total .. ' preclaimed=' .. s_Claimed

			if SharedUtils:IsClientModule() then
				NetEvents:SendLocal('MapEditor:AabbDiag', s_Line)
			else
				m_Logger:Error('AABB-DIAG SERVER ' .. s_Line)
			end
		end
	end

	for l_Index, l_Entity in pairs(s_EntityBus.entities) do
		if self.m_ProcessedEntities[l_Entity.instanceId] then
			-- Already claimed -- but by WHOM. The per-entity hook attributes late-arriving entities
			-- through a PARTITION-keyed slot, and every instance of one blueprint shares a
			-- partition, so a second BMP2's entities get filed under the first one. That claim also
			-- sets m_ProcessedEntities, so this loop used to skip them unconditionally and the real
			-- owner was left with no entities -- no entities means no AABB, which means clicking the
			-- vehicle draws no selection outline while the PREVIOUS vehicle draws two.
			--
			-- This bus belongs to s_GameObject, so it is the authority: take the entity back. A
			-- nested child blueprint is the one legitimate other owner (its entities appear in the
			-- parent's bus as well), so those are left alone.
			local s_Owner = self.m_EntityOwners[l_Entity.instanceId]

			if s_Owner == nil or s_Owner == s_GameObject or self:IsDescendantOf(s_Owner, s_GameObject) then
				goto continue
			end

			s_Owner.gameEntities[l_Entity.instanceId] = nil
			self.m_ProcessedEntities[l_Entity.instanceId] = nil
		end

		local s_GameEntity = s_GameObject.gameEntities[l_Entity.instanceId]

		if s_GameEntity ~= nil then
			goto continue
		end

		s_GameEntity = self.m_PendingEntities[l_Entity.instanceId]
		if s_GameEntity == nil then
			---@type GameEntity
			s_GameEntity = GameEntity {
				entity = l_Entity,
				instanceId = l_Entity.instanceId,
				typeName = l_Entity.typeInfo.name,
				-- Pending info present == this spawn was requested by the editor, so the entity is
				-- ours to free later. Level-load entities arrive with no pending info and stay
				-- untagged, which keeps them on the Disable-only path.
				isEditorSpawned = s_PendingCustomBlueprintInfo ~= nil,
			}
		else
			m_Logger:Write('Processing an entity that was pending')
		end

		s_GameEntity.indexInBlueprint = l_Index

		if (s_GameEntity.aabb == nil or s_GameEntity.transform == nil) and l_Entity:Is("SpatialEntity") and l_Entity.typeInfo.name ~= "OccluderVolumeEntity" then
			local s_Entity = SpatialEntity(l_Entity)

			s_GameEntity.isSpatial = true
			s_GameEntity.transform = ToLocal(s_Entity.transform, p_Transform)
			s_GameEntity.aabb = AABB {
				min = SanitizeVec3(s_Entity.aabb.min:Clone()),
				max = SanitizeVec3(s_Entity.aabb.max:Clone()),
				transform = ToLocal(s_Entity.aabbTransform, p_Transform)
			}
		end

		if s_GameEntity.initiatorRef == nil and s_GameEntity.entity.data then
			s_GameEntity.initiatorRef = CtrRef {
				typeName = s_GameEntity.entity.data.typeInfo.name,
				instanceGuid = tostring(s_GameEntity.entity.data.instanceGuid),
				partitionGuid = InstanceParser:GetPartition(s_GameEntity.entity.data.instanceGuid)
			}
		end

		s_GameObject.gameEntities[l_Entity.instanceId] = s_GameEntity
		self.m_EntityOwners[l_Entity.instanceId] = s_GameObject
		self.m_PendingEntities[l_Entity.instanceId] = nil
		self.m_ProcessedEntities[l_Entity.instanceId] = true

		::continue::
	end

	--- If its a root object all children are now resolved so we update WebUI.
	if s_GameObject.parentData.guid == nil then
		local s_UnresolvedRODCount = GetLength(self.m_ReferenceObjectDatas)

		if s_UnresolvedRODCount ~= 0 then
			-- TODO: update blueprint data with the correct realm if its client or server only
			if self.m_Realm == Realm.Realm_Server then
				m_Logger:Write(s_UnresolvedRODCount .. ' client-only gameobjects weren\'t resolved')
				-- for l_Guid, l_Value in pairs(self.m_ReferenceObjectDatas) do
				-- 	m_Logger:Write(tostring(l_Guid) .. ', '..l_Value.typeName)
				-- end
			elseif self.m_Realm == Realm.Realm_Client then
				m_Logger:Write(s_UnresolvedRODCount .. ' server-only gameobjects weren\'t resolved')
				-- for l_Guid, l_Value in pairs(self.m_ReferenceObjectDatas) do
				-- 	m_Logger:Write(tostring(l_Guid) .. ', '..l_Value.typeName)
				-- end
			end

			self.m_ReferenceObjectDatas = {}
		end

		if s_GameObject.guid ~= PREVIEW_GUID then
			-- Defer editor/WebUI-tree registration over frames (OnInjectedReadyPump) for ALL bulk
			-- level-load root objects — injected saves AND vanilla/NoHavok statics alike — so
			-- registering thousands at once never blocks the frame (the freeze the baked-static
			-- skip used to dodge by dropping them). The object is already in m_GameObjects
			-- (selectable via the engine raycast) and rendered natively; this only makes it appear
			-- and become tree-editable a few frames later. User spawns go through the immediate
			-- pending-custom path below, so interactive placement still feels instant.
			table.insert(self.m_PendingInjectedReady, s_GameObject)
		end
	end

	--- If its a root custom object we remove it from pending and call ready event.
	if s_PendingCustomBlueprintInfo ~= nil then
		self.m_PendingCustomBlueprintGuids[tostring(s_GameObject.blueprintCtrRef.instanceGuid)] = nil

		-- [M1] Is this the respawn of a per-instance clone (ReinstantiateFromClone)? If a clone is
		-- registered for this editor-guid, adopt it as internalBlueprint and RESTORE the original
		-- blueprintCtrRef — the clone spawned as p_Blueprint, so the ctrRef computed above points at
		-- the clone's unregistered guid/partition, which would break the inspector fetch and the
		-- object's identity. Must run AFTER the pending-cleanup above (which keys off the clone
		-- guid) and BEFORE the dispatch below (so the WebUI receives the correct reference). The
		-- overrides are already baked into the clone, so flag isCloneRespawn to skip the re-apply
		-- further down (re-applying would re-clone + respawn endlessly).
		local s_CloneEntry = self.m_InstanceClones[tostring(s_GameObject.guid)]

		if s_CloneEntry ~= nil then
			s_GameObject.internalBlueprint = s_CloneEntry.dc
			s_GameObject.blueprintCtrRef = CtrRef(s_CloneEntry.originalRef)
			s_GameObject.isCloneRespawn = true

			-- Keep pointing at the vanilla ROD we replaced, so the save can still tell the level
			-- generator to exclude it.
			if s_CloneEntry.vanillaRef ~= nil then
				s_GameObject.originalRef = CtrRef(s_CloneEntry.vanillaRef)
			end
		end

		if s_GameObject.guid ~= PREVIEW_GUID then
			--m_Logger:Write("Spawning: " .. s_GameObject.guid)
			-- A networked vehicle's entities exist only on the server as far as the editor can see, so
			-- hand the client the boxes it needs to draw a selection outline.
			if not SharedUtils:IsClientModule() then
				self:ReplicateSpatialEntities(s_GameObject)
			end

			Events:DispatchLocal("GameObjectManager:GameObjectReady", s_GameObject)
		end
	end

	if s_GameObject.guid == PREVIEW_GUID then -- Set collision to 0,0,0 so we don't hit the same object over and over
		s_GameObject:SetTransform(LinearTransform(), true)
		s_GameObject:SetTransform(p_Transform, false)
	end

	-- Re-apply saved overrides on a fresh spawn (e.g. load-injected objects). Skip clone
	-- respawns: their overrides are already baked into the adopted clone, and re-applying would
	-- clone-and-respawn again forever.
	--
	-- QUEUED, not applied inline: SetOverrides clones the blueprint AND schedules a delete/respawn,
	-- so a project with many overridden objects fired that many clone+respawn cycles during level
	-- load. Loading a save with 321 recoloured lights killed the client outright — the save could
	-- be written but never reopened. Spreading them over frames is the same treatment the injected
	-- -ready queue above already gets, and for the same reason.
	if not s_GameObject.isCloneRespawn and s_GameObject:HasOverrides() then
		self.m_PendingOverrides[#self.m_PendingOverrides + 1] = tostring(s_GameObject.guid)
	end
end

function GameObjectManager:ResolveRootObject(p_GameObject, p_PendingInfo)
	self.m_GameObjects[tostring(p_GameObject.guid)] = nil -- Remove temp guid from array

	if p_PendingInfo then                              -- We spawned this custom entitybus
		p_GameObject.parentData = GameObjectParentData {
			guid = p_PendingInfo.parentData.guid,
			typeName = p_PendingInfo.parentData.typeName,
			primaryInstanceGuid = p_PendingInfo.parentData.primaryInstanceGuid,
			partitionGuid = p_PendingInfo.parentData.partitionGuid
		}
		p_GameObject.guid = Guid(p_PendingInfo.customGuid)
		p_GameObject.origin = GameObjectOriginType.Custom
		-- if not p_GameObject.timeStamp or p_GameObject.timeStamp == 0 then
		-- 	self:InsertTimestamp(p_GameObject)
		-- end
	else
		if string.find(p_GameObject.blueprintCtrRef.name:lower(), "nohavok") then
			local s_BundleName = p_GameObject.blueprintCtrRef.name:gsub('NoHavok_', '')
			p_GameObject.origin = GameObjectOriginType.NoHavok
			-- No parent data, add the bundle name as an offset and use a predefined havok guid
			p_GameObject.guid = self:GetNoHavokGuid(HAVOK_GUID, s_BundleName .. '/' .. p_GameObject.name, p_GameObject.transform.trans)
			-- if not p_GameObject.timeStamp or p_GameObject.timeStamp == 0 then
			-- 	self:InsertTimestamp(p_GameObject)
			-- end
		else
			-- This is a vanilla root object
			p_GameObject.guid = self:GetVanillaGuid(p_GameObject.name, p_GameObject.transform.trans)
			p_GameObject.origin = GameObjectOriginType.Vanilla
			-- if not p_GameObject.timeStamp or p_GameObject.timeStamp == 0 then
			-- 	self:InsertTimestamp(p_GameObject)
			-- end

			--table.insert(self.m_VanillaGameObjectGuids, p_GameObject.guid)
			self.m_VanillaGameObjectGuids[tostring(p_GameObject.guid)] = p_GameObject.guid
		end
	end
	-- if p_GameObject.timeStamp == 0 then
	-- 	self:InsertTimestamp(p_GameObject)
	-- end

	self.m_GameObjects[tostring(p_GameObject.guid)] = p_GameObject
end

---@param p_GameObject GameObject
function GameObjectManager:InsertTimestamp(p_GameObject)
	local s_ObjectTimeStamp = self.m_GUID_To_Timestamps[tostring(p_GameObject.guid)]
	if not s_ObjectTimeStamp then
		s_ObjectTimeStamp = SharedUtils:GetTimeMS()
	end
	p_GameObject.timeStamp = s_ObjectTimeStamp
end

function GameObjectManager:ResolveChildObject(p_GameObject, p_ParentGameObject)
	-- This is a child of either a custom gameObject or a vanilla gameObject, find the parent!
	p_GameObject.parentData = GameObjectParentData {
		guid = p_ParentGameObject.guid,
		typeName = p_ParentGameObject.blueprintCtrRef.typeName,
		primaryInstanceGuid = p_ParentGameObject.blueprintCtrRef.instanceGuid,
		partitionGuid = p_ParentGameObject.blueprintCtrRef.partitionGuid
	}

	if p_GameObject.originalRef.partitionGuid == nil then
		p_GameObject.originalRef.partitionGuid = p_ParentGameObject.blueprintCtrRef.partitionGuid -- TODO: Confirm that this is correct
	end

	p_GameObject.origin = p_ParentGameObject.origin
	self.m_GameObjects[tostring(p_GameObject.guid)] = nil -- Remove temp guid from array

	if p_GameObject.origin == GameObjectOriginType.Vanilla then
		p_GameObject.guid = self:GetVanillaGuid(p_GameObject.name, p_GameObject.transform.trans)
		--table.insert(self.m_VanillaGameObjectGuids, p_GameObject.guid)
		-- if not p_GameObject.timeStamp or p_GameObject.timeStamp == 0 then
		-- 	self:InsertTimestamp(p_GameObject)
		-- end
		self.m_VanillaGameObjectGuids[tostring(p_GameObject.guid)] = p_GameObject.guid
	elseif p_GameObject.origin == GameObjectOriginType.NoHavok then
		p_GameObject.guid = self:GetNoHavokGuid(p_GameObject.parentData.guid, p_GameObject.name, p_GameObject.transform.trans)

		-- if not p_GameObject.timeStamp or p_GameObject.timeStamp == 0 then
		-- 	self:InsertTimestamp(p_GameObject)
		-- end
	else
		local i = 1
		local s_CustomGuid

		repeat
			s_CustomGuid = GenerateChildGuid(p_GameObject.parentData.guid, i)
			i = i + 1
		until self.m_GameObjects[tostring(s_CustomGuid)] == nil

		p_GameObject.guid = s_CustomGuid
		p_GameObject.origin = GameObjectOriginType.CustomChild

		-- if not p_GameObject.timeStamp or p_GameObject.timeStamp == 0 then
		-- 	self:InsertTimestamp(p_GameObject)
		-- end
	end

	self.m_GameObjects[tostring(p_GameObject.guid)] = p_GameObject
	table.insert(p_ParentGameObject.children, p_GameObject)
end

function GameObjectManager:UpdateGameObjectRealm(p_Guid, p_Realm)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error('Tried to update realm of a gameobject that doesn\'t exist')
		return
	end

	s_GameObject.realm = p_Realm
end

function GameObjectManager:GetVanillaGameObjectsGuids()
	return self.m_VanillaGameObjectGuids
end

function GameObjectManager:AddGameObjectToTable(p_GameObject)
	local s_GuidAsString = tostring(p_GameObject.guid)

	if self.m_GameObjects[s_GuidAsString] ~= nil then
		m_Logger:Warning("GameObject with the same guid already exists: " .. s_GuidAsString)
	end

	--m_Logger:Write(tostring(p_GameObject.guid) .. " | " .. p_GameObject.name .. " | " .. tostring(p_GameObject.transform.trans))

	self.m_GameObjects[s_GuidAsString] = p_GameObject -- add gameObject to our array of gameObjects now that it is finalized
end

function GameObjectManager:GetVanillaGuid(p_Name, p_Transform)
	local s_VanillaGuid = GenerateVanillaGuid(p_Name, p_Transform, 0)
	local s_Increment = 1

	while self.m_GameObjects[tostring(s_VanillaGuid)] ~= nil do
		s_VanillaGuid = GenerateVanillaGuid(p_Name, p_Transform, s_Increment)
		s_Increment = s_Increment + 1
	end

	return s_VanillaGuid
end

function GameObjectManager:GetNoHavokGuid(p_ParentGuid, p_Name, p_Transform)
	local s_NewGuid = GenerateNoHavokGuid(p_ParentGuid, p_Name, p_Transform, 0)
	local s_Increment = 1

	while self.m_GameObjects[tostring(s_NewGuid)] ~= nil do
		s_NewGuid = GenerateNoHavokGuid(p_ParentGuid, p_Name, p_Transform, s_Increment)
		s_Increment = s_Increment + 1
	end

	return s_NewGuid
end

-- How far from its object a spatial entity may sit and still be considered part of that object's
-- silhouette, in metres. Generous next to a vehicle (~10m) and nowhere near the stray
-- origin-parked entities this exists to reject (20m+ on the measured cases).
local MAX_OUTLINE_OFFSET = 25.0

---Vec3/LinearTransform do not survive a NetEvent, so flatten to plain numbers.
local function PlainVec3(p_Vec)
	if p_Vec == nil then
		return nil
	end

	return { x = p_Vec.x, y = p_Vec.y, z = p_Vec.z }
end

local function PlainTransform(p_Transform)
	if p_Transform == nil then
		return nil
	end

	return {
		left = PlainVec3(p_Transform.left),
		up = PlainVec3(p_Transform.up),
		forward = PlainVec3(p_Transform.forward),
		trans = PlainVec3(p_Transform.trans),
	}
end

---Send an object's spatial entities to the client so it can draw a selection outline.
---
---Only the server ever sees a networked vehicle's entities: the client's own entity bus for one
---comes back EMPTY (measured: server 3, client 0) and the replicated entities never reach its
---hooks either. A lone vehicle had zero entities on the client after 60s, so clicking it outlined
---nothing while mis-filed scenery outlined a neighbour.
function GameObjectManager:ReplicateSpatialEntities(p_GameObject, p_Player)
	if p_GameObject == nil or p_GameObject.guid == nil then
		return
	end

	if p_GameObject.origin ~= GameObjectOriginType.Custom and
		p_GameObject.origin ~= GameObjectOriginType.CustomChild then
		return
	end

	-- Level-injected objects are Custom too, and there are thousands of them. Only objects the user
	-- actually spawned need this; blanket-broadcasting during load is a lot of traffic for nothing.
	if p_GameObject.wasInjected then
		return
	end

	-- A deleted object is not worth re-measuring, and its entities are exactly the ones most
	-- likely to be mid-teardown.
	if p_GameObject.isDeleted then
		return
	end

	local s_Entities = {}

	for _, l_GameEntity in pairs(p_GameObject.gameEntities or {}) do
		if l_GameEntity ~= nil and l_GameEntity.isSpatial and l_GameEntity.aabb ~= nil then
			-- Recompute from the LIVE entity rather than trusting the stored box. The stored one is
			-- captured in the create hook, before the engine has moved the entity to its final
			-- position: a vehicle spawned at x=60 sent a box that drew at x=30. By the time this
			-- runs the entity is placed, so the fresh reading is the correct one.
			local s_Transform = l_GameEntity.transform
			local s_Aabb = l_GameEntity.aabb

			-- Is the handle still usable? This runs a few times a second while a vehicle is
			-- selected, and a vehicle blowing up frees its entities underneath us. Reading a cheap
			-- property first turns a dead handle into a catchable Lua error here, instead of
			-- whatever SpatialEntity() would do to a freed one.
			local s_Alive = false

			if l_GameEntity.entity ~= nil then
				s_Alive = pcall(function() return l_GameEntity.entity.typeInfo.name end)
			end

			if s_Alive then
				local s_Ok, s_Fresh = pcall(function()
					local s_Spatial = SpatialEntity(l_GameEntity.entity)

					return {
						transform = ToLocal(s_Spatial.transform, p_GameObject.transform),
						aabb = AABB {
							min = SanitizeVec3(s_Spatial.aabb.min:Clone()),
							max = SanitizeVec3(s_Spatial.aabb.max:Clone()),
							transform = ToLocal(s_Spatial.aabbTransform, p_GameObject.transform),
						},
					}
				end)

				if s_Ok and s_Fresh ~= nil then
					s_Transform, s_Aabb = s_Fresh.transform, s_Fresh.aabb
				end
			end

			-- Skip entities that are not anywhere near their object. A vehicle carries a
			-- ServerTargetEntity that sits at the WORLD ORIGIN: measured on vehicles at x=20 and
			-- x=40, its box came through at local -20 and -40, i.e. world 0 both times, while the
			-- ServerVehicleEntity's own box was exactly right. So the outline was correct AND there
			-- was a second stray box parked at 0,0,0 -- which is what a user sees as "the outline
			-- is on the wrong vehicle".
			--
			-- A silhouette box belongs to the thing it outlines; anything tens of metres away is
			-- not part of it, whatever it is called.
			local s_Offset = s_Aabb.transform ~= nil and s_Aabb.transform.trans or nil
			local s_TooFar = false

			if s_Offset ~= nil then
				local s_DistSq = s_Offset.x * s_Offset.x + s_Offset.y * s_Offset.y +
					s_Offset.z * s_Offset.z

				s_TooFar = s_DistSq > (MAX_OUTLINE_OFFSET * MAX_OUTLINE_OFFSET)
			end

			if s_TooFar then
				goto skip
			end

			table.insert(s_Entities, {
				instanceId = l_GameEntity.instanceId,
				typeName = l_GameEntity.typeName,
				indexInBlueprint = l_GameEntity.indexInBlueprint,
				transform = PlainTransform(s_Transform),
				aabb = {
					min = PlainVec3(s_Aabb.min),
					max = PlainVec3(s_Aabb.max),
					transform = PlainTransform(s_Aabb.transform),
				},
			})

			::skip::
		end
	end

	if #s_Entities == 0 then
		return
	end

	local s_Detail = ''

	for _, l_E in ipairs(s_Entities) do
		local s_Wx = 'nil'

		if l_E.aabb ~= nil and l_E.aabb.transform ~= nil and l_E.aabb.transform.trans ~= nil then
			s_Wx = string.format('%.1f', l_E.aabb.transform.trans.x)
		end

		s_Detail = s_Detail .. ' [' .. tostring(l_E.typeName) .. ' localX=' .. s_Wx .. ']'
	end

	m_Logger:Error('REPL-SEND obj=' .. tostring(p_GameObject.guid):sub(-6) ..
		' objX=' .. string.format('%.1f', p_GameObject.transform.trans.x) ..
		' spatial=' .. #s_Entities .. s_Detail)

	local s_Payload = json.encode({
		guid = tostring(p_GameObject.guid),
		entities = s_Entities,
	})

	if p_Player ~= nil then
		NetEvents:SendTo('MapEditor:ReplicatedEntities', p_Player, s_Payload)
	else
		NetEvents:Broadcast('MapEditor:ReplicatedEntities', s_Payload)
	end
end

---Undo the most recent "apply to blueprint", restoring the values it overwrote.
---
---Apply mutates the SHARED blueprint, so undoing it has to write the old values back the same way
---(by replacement -- an in-place write is what makes a blueprint unspawnable). Returns how many
---paths were restored so the caller can report honestly instead of implying success.
function GameObjectManager:UndoApplyOverridesToBlueprint(p_Guid)
	if self.m_AppliedUndo == nil or #self.m_AppliedUndo == 0 then
		m_Logger:Warning('UndoApply: nothing on the apply-undo stack')
		return false, 0
	end

	local s_Entry = table.remove(self.m_AppliedUndo)
	local s_GameObject = self.m_GameObjects[tostring(s_Entry.guid)]

	if s_GameObject == nil or s_GameObject.blueprintCtrRef == nil then
		m_Logger:Error('UndoApply: the applying object is gone (' .. tostring(s_Entry.guid) .. ')')
		return false, 0
	end

	local s_Shared = s_GameObject.blueprintCtrRef:Get()

	if s_Shared == nil then
		m_Logger:Error('UndoApply: shared blueprint not resolvable')
		return false, 0
	end

	VehiclePreview:Restore()
	VehiclePreview:Suspend()

	local s_Restored = 0

	for l_Key, l_Field in pairs(s_Entry.fields) do
		local s_Before = s_Entry.previous[l_Key]

		if s_Before ~= nil then
			local s_Ok = VehiclePreview:WriteChainValueByReplacement(s_Shared, l_Field, s_Before)

            if s_Ok then
				s_Restored = s_Restored + 1
			else
				m_Logger:Error("UndoApply: could not restore '" .. tostring(l_Key) .. "'")
			end
		else
			m_Logger:Error("UndoApply: no pre-apply value recorded for '" .. tostring(l_Key) ..
				"' -- leaving it as applied rather than guessing")
		end
	end

	VehiclePreview:ForgetBlueprint(tostring(s_Entry.blueprintGuid))
	VehiclePreview:Resume()

	m_Logger:Warning('UndoApply: restored ' .. s_Restored .. ' path(s) on ' ..
		tostring(s_GameObject.name))

	return s_Restored > 0, s_Restored
end

---Server: a client is asking for up-to-date boxes for the objects it has selected.
---
---Only the selected ones, and only while they are selected: a vehicle under physics needs its box
---re-sent to stay on it, but doing that for every spawned object all the time is a lot of traffic
---for boxes nobody is looking at.
function GameObjectManager:OnRequestBoxes(p_Player, p_Payload)
	local s_Ok, s_Guids = pcall(function() return json.decode(p_Payload) end)

	if not s_Ok or type(s_Guids) ~= 'table' then
		return
	end

	for _, l_Guid in ipairs(s_Guids) do
		local s_GameObject = self.m_GameObjects[tostring(l_Guid)]

		if s_GameObject ~= nil then
			self:ReplicateSpatialEntities(s_GameObject, p_Player)
		end
	end
end

---Client: adopt the spatial entities the server just sent, then refresh the WebUI.
function GameObjectManager:OnReplicatedEntities(p_Payload)
	local s_Ok, s_Data = pcall(function() return json.decode(p_Payload) end)

	if not s_Ok or type(s_Data) ~= 'table' or s_Data.guid == nil then
		return
	end

	local s_GameObject = self.m_GameObjects[tostring(s_Data.guid)]

	if s_GameObject == nil then
		-- The server finishes its spawn before the client registers its own GameObject, so this
		-- payload routinely arrives early. Dropping it lost the vehicle's only source of AABB data
		-- on this realm; retry briefly instead.
		local s_Attempt = (self.m_ReplicaRetries and self.m_ReplicaRetries[tostring(s_Data.guid)] or 0) + 1

		self.m_ReplicaRetries = self.m_ReplicaRetries or {}
		self.m_ReplicaRetries[tostring(s_Data.guid)] = s_Attempt

		if s_Attempt <= 20 then
			Timer:Simple(0.5, function() self:OnReplicatedEntities(p_Payload) end)
		else
			NetEvents:SendLocal('MapEditor:AabbDiag',
				'REPL-RECV obj=' .. tostring(s_Data.guid):sub(-6) .. ' GAVE UP: object never appeared')
		end

		return
	end

	self.m_ReplicaRetries = self.m_ReplicaRetries or {}
	self.m_ReplicaRetries[tostring(s_Data.guid)] = nil

	local s_Added = 0

	for _, l_Entity in pairs(s_Data.entities or {}) do
		local s_Existing = s_GameObject.gameEntities[l_Entity.instanceId]

		if s_Existing == nil then
			-- Never clobber an entity the client genuinely owns; this only fills a gap.
			s_GameObject.gameEntities[l_Entity.instanceId] = ReplicatedSpatialEntity {
				instanceId = l_Entity.instanceId,
				typeName = l_Entity.typeName,
				indexInBlueprint = l_Entity.indexInBlueprint,
				transform = l_Entity.transform,
				aabb = l_Entity.aabb,
			}
			s_Added = s_Added + 1
		elseif s_Existing.isReplicated then
			-- A refresh: the vehicle drives away under physics and the box has to follow it. Only
			-- ever update our OWN stub -- a real GameEntity is the client's and is left alone.
			s_Existing:Update(l_Entity.transform, l_Entity.aabb)
		end
	end

	NetEvents:SendLocal('MapEditor:AabbDiag',
		'REPL-RECV obj=' .. tostring(s_Data.guid):sub(-6) .. ' added=' .. s_Added ..
		' sent=' .. tostring(#(s_Data.entities or {})))

	if s_Added > 0 then
		Events:DispatchLocal('GameObjectManager:GameObjectReady', s_GameObject)
	end
end

---Is p_Object p_Ancestor itself, or nested somewhere beneath it?
function GameObjectManager:IsDescendantOf(p_Object, p_Ancestor)
	local s_Node = p_Object
	local s_Depth = 0

	-- Depth-capped: a malformed parent chain must not hang the entity loop.
	while s_Node ~= nil and s_Depth < 32 do
		if s_Node == p_Ancestor then
			return true
		end

		local s_ParentGuid = s_Node.parentData ~= nil and s_Node.parentData.guid or nil

		if s_ParentGuid == nil then
			return false
		end

		s_Node = self.m_GameObjects[tostring(s_ParentGuid)]
		s_Depth = s_Depth + 1
	end

	return false
end

function GameObjectManager:DeleteGameObject(p_Guid)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error("GameObject not found: " .. p_Guid)
		return false
	end

	if s_GameObject.isDeleted == true then
		m_Logger:Error("GameObject was already marked as deleted: " .. p_Guid)
		return true
	end

	if s_GameObject.origin == GameObjectOriginType.Vanilla or s_GameObject.origin == GameObjectOriginType.NoHavok then
		s_GameObject:MarkAsDeleted()
	else
		s_GameObject:Destroy()
		self.m_GameObjects[tostring(p_Guid)] = nil
	end

	self.m_Placeholders[tostring(p_Guid)] = nil

	-- Give the object's live-preview shell back, or the pool leaks a slot per deleted vehicle.
	ShellPool:Release(p_Guid)

	-- A deleted object must not leave its preview written into the shared blueprint.
	VehiclePreview:ClearFor(p_Guid)

	return true
end

function GameObjectManager:UndeleteGameObject(p_Guid)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error("GameObject not found: " .. p_Guid)
		return false
	end

	if s_GameObject.isDeleted == false then
		m_Logger:Error("GameObject was not marked as deleted before undeleting: " .. p_Guid)
		return false
	end
	if s_GameObject.origin ~= GameObjectOriginType.Vanilla and s_GameObject.origin ~= GameObjectOriginType.NoHavok then
		m_Logger:Error("GameObject was not a vanilla object " .. p_Guid)
		return false
	end

	s_GameObject:MarkAsUndeleted()

	return true
end

function GameObjectManager:EnableGameObject(p_Guid)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error("Failed to find and enable blueprint: " .. p_Guid)
		return false
	end

	s_GameObject:Enable()

	return true
end

function GameObjectManager:DisableGameObject(p_Guid)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error("Failed to find and disable blueprint: " .. p_Guid)
		return false
	end

	s_GameObject:Disable()

	return true
end

function GameObjectManager:SetTransform(p_Guid, p_LinearTransform, p_UpdateCollision)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error('Object with id ' .. tostring(p_Guid) .. ' does not exist')
		return false
	end

	return s_GameObject:SetTransform(p_LinearTransform, p_UpdateCollision)
end

function GameObjectManager:SetVariation(p_Guid, p_Variation)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error('Object with id ' .. tostring(p_Guid) .. ' does not exist')
		return false
	end

	local s_TransferData = s_GameObject:GetGameObjectTransferData()
	s_TransferData.variation = p_Variation

	self:DeleteGameObject(p_Guid)
	--function GameObjectManager:InvokeBlueprintSpawn(p_GameObjectGuid, p_SenderName, p_BlueprintPartitionGuid, p_BlueprintInstanceGuid, p_ParentData, p_LinearTransform, p_Variation, p_IsPreviewSpawn)
	self:InvokeBlueprintSpawn(p_Guid, "server", s_TransferData.blueprintCtrRef.partitionGuid, s_TransferData.blueprintCtrRef.instanceGuid, s_TransferData.parentData, s_TransferData.transform, p_Variation, false, s_TransferData.overrides)
	return true
end

-- [M1] Register a per-instance blueprint clone for an editor GameObject. p_OriginalRefTable is
-- the object's ORIGINAL blueprintCtrRef (as a table) — the create hook restores it after a
-- clone respawn, since the clone's own guid isn't registered in InstanceParser/ResourceManager.
function GameObjectManager:RegisterInstanceClone(p_Guid, p_CloneDC, p_OriginalRefTable, p_VanillaRef)
	-- vanillaRef is the LEVEL's ReferenceObjectData this instance came from, not the blueprint.
	-- Editing a vanilla object's EBX re-registers it as Custom, and the respawn built a fresh
	-- GameObject with an empty originalRef — so the save no longer said which vanilla ROD to
	-- exclude, the baked level kept the original AND added ours, and you saw the untouched
	-- vanilla object sitting exactly where the edited one should be.
	local s_Existing = self.m_InstanceClones[tostring(p_Guid)]

	self.m_InstanceClones[tostring(p_Guid)] = {
		dc = p_CloneDC,
		originalRef = p_OriginalRefTable,
		vanillaRef = p_VanillaRef or (s_Existing ~= nil and s_Existing.vanillaRef or nil),
	}
end

-- Returns the cloned DataContainer for an editor GameObject, or nil if the instance hasn't been
-- made unique yet (still sharing the prefab blueprint).
function GameObjectManager:GetInstanceClone(p_Guid)
	local s_Entry = self.m_InstanceClones[tostring(p_Guid)]

	if s_Entry ~= nil then
		return s_Entry.dc
	end

	return nil
end

-- Re-instantiate an object's live entities from a per-instance clone DC, preserving its editor
-- identity (guid/transform/parent/variation/overrides). Mirrors SetVariation's proven
-- delete+respawn model but spawns from the clone directly (an unregistered runtime DC that
-- FindInstanceByGuid can't resolve).
function GameObjectManager:ReinstantiateFromClone(p_Guid, p_CloneDC)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error('ReinstantiateFromClone: object ' .. tostring(p_Guid) .. ' does not exist')
		return false
	end

	local s_TransferData = s_GameObject:GetGameObjectTransferData()

	-- Collect the CURRENT incarnation's descendants before we tear it down. Respawning a prefab
	-- creates fresh child GameObjects with new guids, and GameObject:Destroy only disables child
	-- ENTITIES — it never untracks the child GameObjects. Without this, every edit left its
	-- predecessor's children behind: the tracked-object count grew by one per edit (and they'd be
	-- saved into the project), on top of the WebUI keeping ghost tree entries.
	local s_Stale = {}

	local function s_Collect(p_Object)
		if p_Object.children == nil then
			return
		end

		for _, l_Child in pairs(p_Object.children) do
			s_Collect(l_Child)
			table.insert(s_Stale, tostring(l_Child.guid))
		end
	end

	s_Collect(s_GameObject)

	self:DeleteGameObject(p_Guid)

	-- Untrack the stale children and tell the WebUI to drop them (the fresh spawn sends its own).
	if #s_Stale > 0 then
		local s_Removals = {}

		for _, l_Guid in ipairs(s_Stale) do
			self.m_GameObjects[l_Guid] = nil
			table.insert(s_Removals, {
				type = CARType.DeletedGameObject,
				gameObjectTransferData = { guid = l_Guid },
			})
		end

		if WebUpdater ~= nil then
			WebUpdater:AddUpdate('HandleResponse', s_Removals)
		end
	end

	s_GameObject.children = {}

	self:InvokeBlueprintSpawnFromClone(p_Guid, "server", p_CloneDC, s_TransferData.parentData, s_TransferData.transform, s_TransferData.variation, s_TransferData.overrides, s_TransferData.timeStamp)
	return true
end

-- Like InvokeBlueprintSpawn, but spawns from a runtime clone DataContainer instead of resolving
-- a registered blueprint by guid. Pending is keyed on the clone's (unique) instanceGuid, since
-- the create hook fires with the clone as p_Blueprint.
function GameObjectManager:InvokeBlueprintSpawnFromClone(p_GameObjectGuid, p_SenderName, p_CloneDC, p_ParentData, p_LinearTransform, p_Variation, p_Overrides, p_TimeStamp)
	if p_CloneDC == nil or p_LinearTransform == nil then
		m_Logger:Error('InvokeBlueprintSpawnFromClone: clone or transform is nil.')
		return false
	end

	p_Variation = p_Variation or 0

	local s_ObjectBlueprint = _G[p_CloneDC.typeInfo.name](p_CloneDC)

	-- Networked blueprints cannot be built from a runtime clone. The engine either builds nothing
	-- (returns nil) or faults outright, and no amount of registering, partition-adding or renaming
	-- the clone changes that -- seven configurations measured in docs/vehicle-edit-crash.md.
	--
	-- What does work: only the SPAWN ROOT has to be a baked resource; everything it references may
	-- be synthesized (docs/bake-pipeline.md §10). So for these we spawn from a pooled baked SHELL
	-- wired to this clone's data, instead of from the clone itself.
	--
	-- With no baked pool ShellPool:Acquire returns nil and we spawn the clone directly, exactly as
	-- before: correct for static objects, and for networked ones simply no live preview (the edit
	-- is still recorded and still bakes correctly).
	local s_SpawnDC = p_CloneDC
	local s_Shell = nil

	if s_ObjectBlueprint.needNetworkId == true then
		s_Shell = ShellPool:Acquire(p_GameObjectGuid, p_CloneDC)

		if s_Shell ~= nil then
			s_SpawnDC = s_Shell
		end
	end

	-- Key the bookkeeping on whatever we actually spawn: OnEntityCreateFromBlueprint looks the
	-- entity up by the guid of the blueprint it was built from.
	local s_CloneGuid = tostring(s_SpawnDC.instanceGuid)

	self.m_PendingCustomBlueprintGuids[s_CloneGuid] = { customGuid = p_GameObjectGuid, creatorName = p_SenderName, parentData = p_ParentData, overrides = p_Overrides, timeStamp = p_TimeStamp }

	local s_Params = EntityCreationParams()
	s_Params.transform = p_LinearTransform
	s_Params.variationNameHash = p_Variation
	-- NON-networked: the clone DC isn't registered in ResourceManager, so replicating it would
	-- hand the peer a blueprint guid it can't resolve. Each realm renders its own clone locally.
	-- Now that both realms clone under the SAME (deterministic) instance guid, the peer can
	-- resolve what we replicate, so honour the blueprint's needNetworkId instead of forcing false.
	-- Vehicles MUST be spawned networked. Verified standalone (Admin/Mods/MakeWritableRepro):
	-- CreateEntitiesFromBlueprint on Vehicles/BMP2/BMP2 with networked = false kills the realm on
	-- the FIRST spawn, while the identical call with networked = true succeeds. A leftover
	-- diagnostic pinned this to false, which meant every post-edit respawn of a vehicle was doing
	-- the fatal thing.
	-- Read the flag off whatever we are spawning: a shell carries needNetworkId = true from the
	-- bake, and a static object's clone carries the original's value.
	s_Params.networked = _G[s_SpawnDC.typeInfo.name](s_SpawnDC).needNetworkId == true

	-- Same reasoning as InvokeBlueprintSpawn: never build entities while a preview is written into
	-- the shared blueprint.
	VehiclePreview:Suspend()

	self.m_SpawningForGuid = tostring(p_GameObjectGuid)
	local s_Ok, s_EntityBus = pcall(function()
		return EntityManager:CreateEntitiesFromBlueprint(s_SpawnDC, s_Params)
	end)
	self.m_SpawningForGuid = nil
	VehiclePreview:Resume()


	if not s_Ok or s_EntityBus == nil then
		m_Logger:Error("Spawning from " .. (s_Shell ~= nil and "shell" or "clone") ..
			" failed: " .. tostring(s_EntityBus))
		self.m_PendingCustomBlueprintGuids[s_CloneGuid] = nil

		-- Hand the shell back; holding it would leak a pool slot on every failed respawn.
		if s_Shell ~= nil then
			ShellPool:Release(p_GameObjectGuid)
		end

		return false
	end

	return true
end

-- [M3] "Apply to Blueprint" (Unity Apply-to-Prefab). Promote one instance's per-instance EBX
-- overrides onto the SHARED base blueprint, then rebuild every instance of that blueprint so they
-- pick up the new base. Siblings that have their OWN overrides keep them layered on top (they get
-- re-cloned from the new base and re-apply their overrides); the applying instance's overrides are
-- cleared, since they're now the base.
--
-- Reuses only proven-safe paths: the shared blueprint is a REGISTERED DC (so writing to it +
-- Disable/Enable is the original, crash-free EBX path), and re-cloning goes back through the
-- client-only SetOverrides from M1.
function GameObjectManager:ApplyOverridesToBlueprint(p_Guid)
	local s_GameObject = self.m_GameObjects[tostring(p_Guid)]

	if s_GameObject == nil then
		m_Logger:Error("ApplyOverridesToBlueprint: object " .. tostring(p_Guid) .. " does not exist")
		return false
	end

	if s_GameObject.overrides == nil or next(s_GameObject.overrides) == nil then
		m_Logger:Warning("ApplyOverridesToBlueprint: nothing to apply for " .. tostring(p_Guid))
		return false
	end

	local s_BpGuid = tostring(s_GameObject.blueprintCtrRef.instanceGuid)

	-- Undo any live preview BEFORE touching the shared blueprint, then keep previews OFF for the
	-- rest of Apply.
	--
	-- A preview is a temporary write to this same DC. Restoring first stops Apply recording preview
	-- values as the user's intent and baking them. Suspending matters just as much: step 3 rebuilds
	-- every instance of this blueprint, each rebuild re-enters SetOverrides, and a sibling carrying
	-- its own overrides would preview them onto the shared blueprint while Apply is walking it.
	VehiclePreview:Restore()
	VehiclePreview:Suspend()

	-- 1) Write the applying instance's overrides onto the SHARED registered blueprint DC.
	local s_Shared = s_GameObject.blueprintCtrRef:Get()

	if s_Shared == nil then
		m_Logger:Error("ApplyOverridesToBlueprint: shared blueprint not resolvable for " .. tostring(p_Guid))
		VehiclePreview:Resume()
		return false
	end

	local s_Applied = s_GameObject.overrides

	-- Keep any override whose write to the SHARED blueprint did not land.
	--
	-- SetField returns nil (or '') when it refuses or fails a write -- a reference it could not
	-- resolve, a type mismatch it refused rather than crash the client, or a chain that does not
	-- traverse on the shared container the way it did on the per-instance clone. This loop used to
	-- ignore that result while step 3 below cleared the instance's overrides unconditionally, so a
	-- failed write SILENTLY DISCARDED the user's edit: the value snapped back to base on Apply with
	-- nothing logged. Reported from the field as "changes to reference children get reverted when I
	-- press apply".
	--
	-- A failed write is now kept as an instance override (it still applies to THIS object via its
	-- own clone, which is where it was working before Apply) and reported. Losing the edit is the
	-- one outcome that is never acceptable.
	local s_Failed = {}
	local s_FailedCount = 0

	-- Snapshot what the blueprint held BEFORE this apply, so undo has something to restore.
	-- ApplyBlueprintOverridesCommand.undo() used to be an empty no-op: the entry still sat in the
	-- history, so undoing it moved the pointer, reverted nothing, and every vehicle spawned
	-- afterwards still carried the applied value. Reported as "I reverted my gravity change with
	-- the history but newly spawned ones still get the gravity I set".
	local s_Previous = {}

	for l_Key, l_Field in pairs(s_Applied) do
		local s_Ok, s_Before = pcall(function()
			return VehiclePreview:ReadChain(s_Shared, l_Field)
		end)

		if s_Ok and s_Before ~= nil then
			s_Previous[l_Key] = s_Before
		end
	end

	self.m_AppliedUndo = self.m_AppliedUndo or {}
	table.insert(self.m_AppliedUndo, { blueprintGuid = s_BpGuid, previous = s_Previous,
		fields = s_Applied, guid = tostring(p_Guid) })

	for l_Key, l_Field in pairs(s_Applied) do
		-- Write by REPLACEMENT, not in place.
		--
		-- An in-place write makes the shared blueprint's containers writable, and spawning that
		-- vehicle afterwards kills the client -- which is why this used to poison the blueprint for
		-- the rest of the session and spawns had to be refused. Replacement swaps in a modified copy
		-- and leaves the original untouched, so the blueprint stays spawnable.
		local s_Ok, s_Why = VehiclePreview:WriteChainByReplacement(s_Shared, l_Field)
		local s_Path = s_Ok and l_Key or nil

		if not s_Ok then
			m_Logger:Error("ApplyOverridesToBlueprint: replacement write failed for '" ..
				tostring(l_Key) .. "': " .. tostring(s_Why))
		end

		if s_Path == nil or s_Path == '' then
			s_Failed[l_Key] = l_Field
			s_FailedCount = s_FailedCount + 1
			m_Logger:Error("ApplyOverridesToBlueprint: could not write '" .. tostring(l_Key) ..
				"' onto the shared blueprint " .. tostring(s_GameObject.blueprintCtrRef.name) ..
				"; keeping it as an instance override instead of discarding the edit.")
		end
	end

	if s_FailedCount > 0 then
		m_Logger:Error("ApplyOverridesToBlueprint: " .. tostring(s_FailedCount) .. " of " ..
			tostring(GetLength(s_Applied)) .. " override(s) did not apply to the shared blueprint.")
	end

	-- Remember that this blueprint's shared DC is no longer stock. The overrides are cleared from
	-- the instance right after this, so this table is the ONLY remaining record that the baked
	-- level has to ship a modified copy of the blueprint (GH #396).
	-- NOT marked unspawnable any more: Apply writes by replacement above, so the blueprint's own
	-- containers were never made writable and it stays safe to spawn.

	-- The applied value IS the baseline now, so any preview restore data for this blueprint is
	-- stale. Left in place, the next restore would put the pre-Apply value back and undo this.
	VehiclePreview:ForgetBlueprint(s_BpGuid)

	self.m_AppliedBlueprints[s_BpGuid] = {
		partitionGuid = tostring(s_GameObject.blueprintCtrRef.partitionGuid),
		name = tostring(s_GameObject.blueprintCtrRef.name),
	}

	-- 2) Collect every instance of this blueprint BEFORE we start respawning (respawns mutate
	--    m_GameObjects, so we can't iterate it live).
	local s_InstanceGuids = {}

	for l_Guid, l_GO in pairs(self.m_GameObjects) do
		if l_GO ~= nil and l_GO.blueprintCtrRef ~= nil and
			tostring(l_GO.blueprintCtrRef.instanceGuid) == s_BpGuid then
			table.insert(s_InstanceGuids, l_Guid)
		end
	end

	-- 3) Rebuild each instance against the new base.
	--
	-- SKIPPED for networked blueprints. Rebuilding an instance re-enters the spawn path, and doing
	-- that for a vehicle right after its blueprint changed is what kills the realm -- measured:
	-- edit + Apply + spawn survived one round and killed the server on the second, while a preview
	-- alone (no Apply) survives 6 of 6. The instances do not need it: the value is already on the
	-- shared blueprint, so anything spawned from here on carries it, and the live ones pick it up on
	-- the next level load or bake.
	local s_SkipRebuild = false

	pcall(function()
		s_SkipRebuild = s_Shared ~= nil and s_Shared.needNetworkId == true
	end)

	if s_SkipRebuild then
		m_Logger:Write("ApplyOverridesToBlueprint: not rebuilding instances of '" ..
			tostring(s_GameObject.blueprintCtrRef.name) .. "' -- rebuilding a networked blueprint's " ..
			"instances crashes the realm. New spawns carry the value; existing ones need a reload.")
	end

	for _, l_Guid in ipairs(s_SkipRebuild and {} or s_InstanceGuids) do
		local l_GO = self.m_GameObjects[l_Guid]

		if l_GO ~= nil then
			local l_HadClone = self.m_InstanceClones[l_Guid] ~= nil
			local l_IsApplier = (l_Guid == tostring(p_Guid))
			-- The applier's overrides are now the base -> drop them, EXCEPT any that failed to
			-- write onto the shared blueprint: those never became the base, so dropping them
			-- would throw the edit away.
			local l_Remaining = l_IsApplier and s_Failed or l_GO.overrides

			-- Reset any per-instance clone so it re-clones from the MUTATED shared base.
			self.m_InstanceClones[l_Guid] = nil
			l_GO.internalBlueprint = nil
			l_GO.overrides = {}
			l_GO:SetField('overrides', l_GO.overrides)

			if l_HadClone or next(l_Remaining) ~= nil then
				-- Was unique (or still has its own overrides): re-clone from the new base and
				-- re-apply the remaining overrides. SetOverrides respawns client-side only (safe).
				l_GO:SetOverrides(l_Remaining)
			else
				-- Clone-less, no overrides: its live entities read the shared DC directly, so a
				-- Disable/Enable re-reads the new base (the original crash-free refresh).
				l_GO:Disable(true)
				l_GO:Enable(true)
			end
		end
	end

	VehiclePreview:Resume()
	return true
end

function GameObjectManager:OnEntityCreate(p_Hook, p_EntityData, p_Transform)
	local s_Entity = p_Hook:Call()

	if not s_Entity then
		return
	end

	---@type GameEntity|nil
	local s_GameEntity = self.m_PendingEntities[s_Entity.instanceId]

	if s_GameEntity ~= nil then
		m_Logger:Write('Entity already pending its processing')
		return
	end

	---@type GameEntity
	s_GameEntity = GameEntity {
		entity = s_Entity,
		instanceId = s_Entity.instanceId,
		typeName = s_Entity.typeInfo.name,
		-- Created while one of our own spawns was in flight, so it's ours to free later.
		-- Everything the level creates on its own falls outside the window and stays untagged.
		isEditorSpawned = self.m_SpawningForGuid ~= nil,
	}
	local s_PartitionGuid = InstanceParser:GetPartition(p_EntityData.instanceGuid);
	s_GameEntity.initiatorRef = CtrRef {
		typeName = p_EntityData.typeInfo.name,
		instanceGuid = tostring(p_EntityData.instanceGuid),
		partitionGuid = s_PartitionGuid
	}

	-- Prefer the object whose blueprint is being built right now; fall back to the partition slot
	-- for entities that arrive outside any blueprint creation (level load).
	--
	-- Getting this wrong is not a cosmetic miss: this hook marks the entity in m_ProcessedEntities,
	-- and the authoritative entity-bus loop skips anything already processed. So a wrong guess here
	-- is permanent -- the correct owner never gets the entity, and an object with no entities has
	-- no AABB and therefore no selection outline.
	local s_PendingGameObject = self.m_BlueprintStack[#self.m_BlueprintStack]

	if s_PendingGameObject == nil then
		s_PendingGameObject = self.m_PendingBlueprint[s_PartitionGuid]
	end

	-- Never file a late-arriving entity onto an editor-spawned object through the PARTITION slot.
	-- That slot holds one object per partition, so it is stale the moment a blueprint has two
	-- instances -- and worse, it keeps pointing at a user-spawned object while the level streams,
	-- so the FIRST vehicle spawned quietly absorbed ~200 level entities. Their boxes are scattered
	-- across the map, which is why clicking that vehicle outlined a completely different one.
	--
	-- Objects the editor spawned do not need this path: statics get their entities from the entity
	-- bus, and vehicles get their boxes replicated from the server (the client never sees a
	-- networked vehicle's entities at all). Level objects still rely on the slot, so they keep it.
	if s_PendingGameObject ~= nil and self.m_BlueprintStack[#self.m_BlueprintStack] == nil and
		not s_PendingGameObject.wasInjected and
		(s_PendingGameObject.origin == GameObjectOriginType.Custom or
			s_PendingGameObject.origin == GameObjectOriginType.CustomChild) then
		return
	end

	-- TEMP DIAG (AABB mis-association, reported 2026-08-26): the outline follows the WRONG vehicle.
	-- m_PendingBlueprint is keyed by PARTITION, and two BMP2s share one partition, so this slot is
	-- a single cell two objects fight over. Log every time the entity we are about to attach lands
	-- on an object other than the one being spawned. Silence here means this route is innocent.
	if s_PendingGameObject ~= nil and self.m_SpawningForGuid ~= nil and
		tostring(s_PendingGameObject.guid) ~= self.m_SpawningForGuid then
		local s_Line = 'MISMATCH entity->object=' .. tostring(s_PendingGameObject.guid):sub(-6) ..
			' spawningFor=' .. tostring(self.m_SpawningForGuid):sub(-6)

		if SharedUtils:IsClientModule() then
			NetEvents:SendLocal('MapEditor:AabbDiag', s_Line)
		else
			m_Logger:Error('AABB-DIAG SERVER ' .. s_Line)
		end
	elseif s_PendingGameObject ~= nil and self.m_SpawningForGuid == nil then
		local s_Line = 'LATE entity->object=' .. tostring(s_PendingGameObject.guid):sub(-6) ..
			' (no spawn in flight)'

		if SharedUtils:IsClientModule() then
			NetEvents:SendLocal('MapEditor:AabbDiag', s_Line)
		else
			m_Logger:Error('AABB-DIAG SERVER ' .. s_Line)
		end
	end

	if s_PendingGameObject then
		if s_Entity:Is("SpatialEntity") and s_Entity.typeInfo.name ~= "OccluderVolumeEntity" then
			s_Entity = SpatialEntity(s_Entity)
			s_GameEntity.isSpatial = true
			s_GameEntity.transform = ToLocal(s_Entity.transform, s_PendingGameObject.transform)
			s_GameEntity.aabb = AABB {
				min = SanitizeVec3(s_Entity.aabb.min:Clone()),
				max = SanitizeVec3(s_Entity.aabb.max:Clone()),
				transform = ToLocal(s_Entity.aabbTransform, s_PendingGameObject.transform)
			}
		end

		-- Set custom objects' entities enabled by default. This can't be done in CreateEntitiesFromBlueprint, for
		-- some reason it doesn't work
		if not s_PendingGameObject.wasInjected and (s_PendingGameObject.origin == GameObjectOriginType.Custom or s_PendingGameObject.origin == GameObjectOriginType.CustomChild) and
			(s_Entity:Is('GameEntity') or s_Entity:Is('EffectEntity')) and
			s_Entity.typeInfo.name ~= "ServerVehicleEntity" then
			-- Small delay before firing an event, otherwise it may crash
			Timer:Simple(0.2, function()
				s_GameEntity:Enable()
			end)
		end

		s_PendingGameObject.gameEntities[s_Entity.instanceId] = s_GameEntity
		self.m_EntityOwners[s_Entity.instanceId] = s_PendingGameObject
		self.m_PendingEntities[s_Entity.instanceId] = nil
		self.m_ProcessedEntities[s_Entity.instanceId] = true


		-- No GameObjectReady re-dispatch here, deliberately.
		--
		-- It was added so a vehicle's entity data would reach the WebUI, but it fired on EVERY late
		-- attach, including level objects streaming in. Each dispatch makes the UI tear down and
		-- rebuild that object's spatial children, and inspector_sweep_e2e caught the result: 199
		-- "Entity with id ... already exists" errors across a 40-blueprint sweep.
		--
		-- It is redundant now anyway: a vehicle's boxes arrive through OnReplicatedEntities, which
		-- dispatches once, for the one object that actually changed.
	else
		self.m_PendingEntities[s_Entity.instanceId] = s_GameEntity

		m_Logger:Write('Couldnt find entity\'s pending GO, saving')
	end
end

if SharedUtils:IsClientModule() then
	GameObjectManager = GameObjectManager(Realm.Realm_Client)
else
	GameObjectManager = GameObjectManager(Realm.Realm_Server)
end

return GameObjectManager
