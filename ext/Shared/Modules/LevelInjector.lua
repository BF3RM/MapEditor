---@class LevelInjector
---@overload fun():LevelInjector
--
-- Loads a project's saved objects DURING the loading screen instead of streaming them in as
-- runtime commands after the level is up. It patches the primary LevelData while the level is
-- still loading (the proven MapLoader technique): custom objects are added as fresh
-- ReferenceObjectData in a new WorldPartData, and modified/deleted vanilla objects are patched
-- in place (blueprintTransform / excluded). Everything then spawns NATIVELY with the level, so
-- there is no post-load popping.
--
-- The extra piece MapLoader doesn't need: MapEditor must keep every one of these objects
-- EDITABLE (selectable, movable, re-saveable) with its exact saved identity. So for each object
-- we inject/patch we record a map  rodInstanceGuid -> savedEntry . GameObjectManager's create
-- hook reads it (LevelInjector:GetInjected) to ADOPT the saved guid/origin/variation/overrides
-- instead of computing a fresh vanilla guid — and to bypass the baked-static skip so a
-- user-moved StaticModelEntityData is still tracked (keku's rule: anything the user touched is
-- an editable object, never dropped as baked vanilla).
LevelInjector = class 'LevelInjector'

local m_Logger = Logger("LevelInjector", false)

--- Build the "<bpGuid>|x,y,z" key used to match custom injected objects in the create hook.
--- p_Trans works for both a JSON transform table and a LinearTransform (both expose .trans.x/y/z).
local function _BpPosKey(p_BlueprintInstanceGuid, p_Trans)
	if p_Trans == nil or p_Trans.trans == nil then
		return nil
	end
	local t = p_Trans.trans
	return tostring(p_BlueprintInstanceGuid):upper() .. '|' ..
		string.format('%.2f,%.2f,%.2f', t.x, t.y, t.z)
end

function LevelInjector:__init()
	self:RegisterVars()
	self:RegisterEvents()
end

function LevelInjector:RegisterVars()
	-- The project data to inject: { header = ..., data = { savedEntry, ... } }
	self.m_LevelData = nil

	-- Guids of the primary LevelData DataContainer (captured on Partition:Loaded).
	self.m_PrimaryLevelGuids = nil

	-- key: original ROD instanceGuid (string, upper) -> savedEntry. Vanilla objects only (they
	-- keep a real, stable instanceGuid). Read by GameObjectManager to adopt.
	self.m_InjectedByRodGuid = {}

	-- Custom objects are fresh ReferenceObjectData with NO (settable) instanceGuid, so the engine
	-- passes a nil parent guid to the create hook. We can't key those by guid, so we key them by
	-- blueprint instanceGuid + world position instead (each prop sits at a distinct spot).
	-- key: "<bpGuid>|x,y,z" -> savedEntry.
	self.m_InjectedByBpPos = {}

	-- ObjectVariation lookup + objects still waiting for their variation to load.
	self.m_ObjectVariations = {}
	self.m_PendingVariations = {} -- key: nameHash -> array of ReferenceObjectData

	self.m_IndexCount = 0
	self.m_HasPatched = false -- guard against double-patching within a single load

	-- Blueprint instanceGuids we injected, so the hook only does the bppos lookup for OUR objects.
	self.m_InjectedBlueprints = {}
end

--- DIAG: was this blueprint one we injected? (used only by the hook's miss-diagnostic)
function LevelInjector:IsInjectedBlueprint(p_BlueprintInstanceGuid)
	if p_BlueprintInstanceGuid == nil then
		return false
	end
	return self.m_InjectedBlueprints[tostring(p_BlueprintInstanceGuid):upper()] == true
end

function LevelInjector:RegisterEvents()
	Events:Subscribe('Level:LoadResources', self, self.OnLoadResources)
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
	Events:Subscribe('Level:LoadingInfo', self, self.OnLoadingInfo)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)

	if SharedUtils:IsClientModule() then
		-- Data arrives CHUNKED (a single NetEvent with a 2500+ object save is too big for the
		-- reliable channel → the client times out / gets kicked). Server pushes it before the
		-- restart; on a full MAP CHANGE the client VM reloads and loses it → re-request on
		-- Partition:Loaded.
		NetEvents:Subscribe('MapEditor:InjBegin', self, self.OnInjBegin)
		NetEvents:Subscribe('MapEditor:InjChunk', self, self.OnInjChunk)
		NetEvents:Subscribe('MapEditor:InjEnd', self, self.OnInjEnd)
	else
		-- Answer a client's fallback request with the currently-armed project data (chunked).
		NetEvents:Subscribe('MapEditor:RequestInjectorData', self, self.OnRequestInjectorData)
		-- Pump the chunk send-queue a few messages per frame.
		Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)
	end

	self:RegisterTimeoutBump()
end

-- Big injected loads take a while; bump the loading/ingame timeouts so the client/server don't
-- kick during a heavy load (proven technique from LevelLoaderGen & MapLoader — we were missing it).
function LevelInjector:RegisterTimeoutBump()
	local s_Timeout = 1000

	if SharedUtils:IsClientModule() then
		ResourceManager:RegisterInstanceLoadHandler(
			Guid("C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4"),
			Guid("B479A8FA-67FF-8825-9421-B31DE95B551A"),
			function(p_Instance)
				p_Instance = ClientSettings(p_Instance)
				p_Instance:MakeWritable()
				p_Instance.loadingTimeout = math.max(s_Timeout, p_Instance.loadingTimeout or 0)
				p_Instance.loadedTimeout = math.max(s_Timeout, p_Instance.loadedTimeout or 0)
				p_Instance.ingameTimeout = math.max(s_Timeout, p_Instance.ingameTimeout or 0)
			end
		)
	else
		ResourceManager:RegisterInstanceLoadHandler(
			Guid("C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4"),
			Guid("818334B3-CEA6-FC3F-B524-4A0FED28CA35"),
			function(p_Instance)
				p_Instance = ServerSettings(p_Instance)
				p_Instance:MakeWritable()
				p_Instance.loadingTimeout = math.max(s_Timeout, p_Instance.loadingTimeout or 0)
				p_Instance.ingameTimeout = math.max(s_Timeout, p_Instance.ingameTimeout or 0)
				p_Instance.timeoutTime = math.max(s_Timeout, p_Instance.timeoutTime or 0)
			end
		)
	end
end

-- Objects per chunk. Small enough that a chunk NetEvent stays well under the reliable-message
-- size limit even with big transforms/overrides.
local INJ_CHUNK_SIZE = 100
-- Chunks flushed per server Engine:Update tick. Spreading the send over frames avoids a single
-- huge-serialization hitch (8000+ object saves) that would still time the client out.
local INJ_MSGS_PER_TICK = 8

--- Queue the armed project data as small chunk-messages, flushed over frames (see OnEngineUpdate).
--- p_Player = nil → broadcast to all; else to one.
---@param p_Player Player|nil
function LevelInjector:SendChunked(p_Player)
	if not self:HasData() then
		return
	end

	local s_Data = self.m_LevelData.data
	local s_Msgs = {}
	s_Msgs[#s_Msgs + 1] = { e = 'MapEditor:InjBegin', p = { header = self.m_LevelData.header, total = #s_Data } }

	local s_Chunk = {}
	for i = 1, #s_Data do
		s_Chunk[#s_Chunk + 1] = s_Data[i]
		if #s_Chunk >= INJ_CHUNK_SIZE then
			s_Msgs[#s_Msgs + 1] = { e = 'MapEditor:InjChunk', p = s_Chunk }
			s_Chunk = {}
		end
	end
	if #s_Chunk > 0 then
		s_Msgs[#s_Msgs + 1] = { e = 'MapEditor:InjChunk', p = s_Chunk }
	end
	s_Msgs[#s_Msgs + 1] = { e = 'MapEditor:InjEnd', p = true }

	self.m_SendQueue = { player = p_Player, msgs = s_Msgs, idx = 1 }
end

--- SERVER: flush a few queued chunk-messages per frame.
function LevelInjector:OnEngineUpdate()
	local s_Q = self.m_SendQueue
	if s_Q == nil then
		return
	end

	local s_Sent = 0
	while s_Q.idx <= #s_Q.msgs and s_Sent < INJ_MSGS_PER_TICK do
		local s_M = s_Q.msgs[s_Q.idx]
		if s_Q.player == nil then
			NetEvents:BroadcastLocal(s_M.e, s_M.p)
		else
			NetEvents:SendToLocal(s_M.e, s_Q.player, s_M.p)
		end
		s_Q.idx = s_Q.idx + 1
		s_Sent = s_Sent + 1
	end

	if s_Q.idx > #s_Q.msgs then
		self.m_SendQueue = nil
	end
end

--- Server responder: a client asked for the injector data after its VM reloaded on a map change.
---@param p_Player Player
function LevelInjector:OnRequestInjectorData(p_Player)
	self:SendChunked(p_Player)
end

-- CLIENT: reassemble the chunked project data.
function LevelInjector:OnInjBegin(p_Info)
	self.m_IncomingHeader = p_Info and p_Info.header or nil
	self.m_IncomingData = {}
end

function LevelInjector:OnInjChunk(p_Objects)
	if self.m_IncomingData == nil then
		self.m_IncomingData = {}
	end
	if p_Objects ~= nil then
		for _, l_Object in ipairs(p_Objects) do
			self.m_IncomingData[#self.m_IncomingData + 1] = l_Object
		end
	end
end

function LevelInjector:OnInjEnd()
	if self.m_IncomingHeader ~= nil and self.m_IncomingData ~= nil then
		self:SetData({ header = self.m_IncomingHeader, data = self.m_IncomingData })
	end
	self.m_IncomingHeader = nil
	self.m_IncomingData = nil
end

--- Called on the SERVER by ProjectManager, and on the CLIENT via NetEvent, before the level (re)loads.
---@param p_LevelData table|nil  { header = ..., data = { ... } }  (nil clears)
function LevelInjector:SetData(p_LevelData)
	self.m_LevelData = p_LevelData

	if p_LevelData ~= nil and p_LevelData.header ~= nil then
		m_Logger:Write('Armed with project: ' .. tostring(p_LevelData.header.projectName) .. ' | ' ..
			tostring(p_LevelData.data and #p_LevelData.data or 0) .. ' objects')
	else
		m_Logger:Write('Data cleared')
	end
end

function LevelInjector:HasData()
	return self.m_LevelData ~= nil and self.m_LevelData.data ~= nil
end

--- Adoption hook read by GameObjectManager. Returns the saved entry for a spawned ROD, or nil.
---@param p_RodInstanceGuid string
function LevelInjector:GetInjected(p_RodInstanceGuid)
	if p_RodInstanceGuid == nil then
		return nil
	end

	return self.m_InjectedByRodGuid[tostring(p_RodInstanceGuid):upper()]
end

--- Adoption for custom objects (fresh RODs have no guid) keyed by blueprint + world position.
--- Consumes the entry so two identical props at the same spot resolve to distinct saved objects.
---@param p_BlueprintInstanceGuid string|Guid
---@param p_Transform LinearTransform
function LevelInjector:GetInjectedByBpPos(p_BlueprintInstanceGuid, p_Transform)
	local s_Key = _BpPosKey(p_BlueprintInstanceGuid, p_Transform)
	if s_Key == nil then
		return nil
	end

	local s_Bucket = self.m_InjectedByBpPos[s_Key]
	if s_Bucket == nil or #s_Bucket == 0 then
		return nil
	end

	-- Pop one (handles multiple identical props stacked at the exact same position).
	return table.remove(s_Bucket, 1)
end

-- nº 1 in calling order
function LevelInjector:OnLoadResources()
	self.m_ObjectVariations = {}
	self.m_PendingVariations = {}
	self.m_HasPatched = false
end

-- nº 2 in calling order
---@param p_Partition DatabasePartition
function LevelInjector:OnPartitionLoaded(p_Partition)
	if p_Partition == nil then
		return
	end

	local s_PrimaryInstance = p_Partition.primaryInstance

	if s_PrimaryInstance == nil then
		return
	end

	if s_PrimaryInstance.typeInfo.name == "LevelData" then
		local s_Instance = LevelData(s_PrimaryInstance)

		if s_Instance.name == SharedUtils:GetLevelName() then
			m_Logger:Write('Captured PrimaryLevel guids')
			s_Instance:MakeWritable()

			self.m_PrimaryLevelGuids = {
				instanceGuid = s_Instance.instanceGuid,
				partitionGuid = s_Instance.partitionGuid,
			}

			-- On a map change the client VM reloaded and lost the data; ask the server for it.
			-- Skip if chunks are already streaming in (m_IncomingData set) so we don't restart it.
			if SharedUtils:IsClientModule() and not self:HasData() and self.m_IncomingData == nil then
				NetEvents:Send('MapEditor:RequestInjectorData')
			end
		end
	elseif s_PrimaryInstance:Is("ObjectVariation") then
		local s_Variation = ObjectVariation(s_PrimaryInstance)
		self.m_ObjectVariations[s_Variation.nameHash] = s_Variation

		-- Resolve any injected refs that were waiting on this variation.
		local s_Pending = self.m_PendingVariations[s_Variation.nameHash]
		if s_Pending ~= nil then
			for _, l_Ref in ipairs(s_Pending) do
				l_Ref.objectVariation = s_Variation
			end
			self.m_PendingVariations[s_Variation.nameHash] = nil
		end
	end
end

-- nº 3 in calling order
---@param p_Info string
function LevelInjector:OnLoadingInfo(p_Info)
	if p_Info ~= "Registering entity resources" then
		return
	end

	if not self:HasData() then
		return -- No project to inject (e.g. a plain vanilla map load).
	end

	if self.m_HasPatched then
		return
	end

	if self.m_PrimaryLevelGuids == nil then
		m_Logger:Warning('PrimaryLevel guids missing, cannot inject')
		return
	end

	local s_PrimaryLevel = ResourceManager:FindInstanceByGuid(
		self.m_PrimaryLevelGuids.partitionGuid, self.m_PrimaryLevelGuids.instanceGuid)

	if s_PrimaryLevel == nil then
		m_Logger:Error("Couldn't find PrimaryLevel DataContainer, aborting injection")
		return
	end

	s_PrimaryLevel = LevelData(s_PrimaryLevel)

	m_Logger:Write('Patching level with project objects')

	local s_RegistryContainer = s_PrimaryLevel.registryContainer
	if s_RegistryContainer == nil then
		m_Logger:Error('No registryContainer found, aborting injection')
		return
	end
	s_RegistryContainer = RegistryContainer(s_RegistryContainer)
	s_RegistryContainer:MakeWritable()

	self:CreateWorldParts(s_PrimaryLevel, s_RegistryContainer)

	self.m_HasPatched = true
	m_Logger:Write('Level patched')
end

-- Native levels spread their objects across MANY WorldPartData (spatial partitions). Dumping
-- thousands of injected refs into ONE WorldPart makes the engine's parallel entity-registration
-- job choke/crash on huge saves, so we split them into parts of this size (mirrors the ~200-300
-- batch the old runtime-spawn path used without crashing).
local INJ_OBJECTS_PER_WORLDPART = 250

---@param p_PrimaryLevel LevelData
---@param p_RegistryContainer RegistryContainer
function LevelInjector:CreateWorldParts(p_PrimaryLevel, p_RegistryContainer)
	-- Find the highest existing indexInBlueprint so our custom refs don't collide.
	self.m_IndexCount = 0
	for _, l_Object in pairs(p_PrimaryLevel.objects) do
		-- Null entries are legal in a Frostbite object array — see the matching guard in
		-- GameObjectManager:OnEntityCreateFromBlueprint.
		if l_Object ~= nil and l_Object:Is("WorldPartReferenceObjectData") then
			local s_RefObjectData = WorldPartReferenceObjectData(l_Object)
			if s_RefObjectData.blueprint ~= nil and s_RefObjectData.blueprint:Is("WorldPartData") then
				local s_WorldPart = WorldPartData(s_RefObjectData.blueprint)
				if #s_WorldPart.objects ~= 0 then
					local s_ROD = s_WorldPart.objects[#s_WorldPart.objects]
					if s_ROD and s_ROD:Is("ReferenceObjectData") then
						s_ROD = ReferenceObjectData(s_ROD)
						if s_ROD.indexInBlueprint > self.m_IndexCount then
							self.m_IndexCount = s_ROD.indexInBlueprint
						end
					end
				end
			end
		end
	end

	-- Per-blueprint cache: 8000+ objects usually share a handful of blueprints, so resolving the
	-- blueprint (FindInstanceByGuid + Is/Banger checks) ONCE per unique guid instead of per object.
	self.m_BpCache = {}

	local s_World = nil
	local s_WorldCount = 0
	local s_Parts = 0

	-- Close the current WorldPart: reference it from the primary level + registry, then reset.
	local function s_FinalizePart()
		if s_World == nil then
			return
		end
		local s_Ref = WorldPartReferenceObjectData()
		s_Ref.blueprint = s_World
		s_Ref.isEventConnectionTarget = Realm.Realm_None
		s_Ref.isPropertyConnectionTarget = Realm.Realm_None
		s_Ref.excluded = false
		s_Ref.indexInBlueprint = #p_PrimaryLevel.objects
		p_PrimaryLevel.objects:add(s_Ref)
		p_RegistryContainer.referenceObjectRegistry:add(s_Ref)
		s_World = nil
		s_WorldCount = 0
	end

	for _, l_Object in pairs(self.m_LevelData.data) do
		local s_Origin = l_Object.origin

		if s_Origin == GameObjectOriginType.Vanilla then
			self:PatchOriginalObject(l_Object)
		elseif s_Origin == GameObjectOriginType.Custom or s_Origin == GameObjectOriginType.NoHavok then
			if s_World == nil then
				s_World = WorldPartData()
				p_RegistryContainer.blueprintRegistry:add(s_World)
				s_Parts = s_Parts + 1
			end
			self:AddCustomObject(l_Object, s_World, p_RegistryContainer)
			s_WorldCount = s_WorldCount + 1
			if s_WorldCount >= INJ_OBJECTS_PER_WORLDPART then
				s_FinalizePart()
			end
		end
		-- CustomChild is left to the post-load command path (needs its parent resolved first).
	end
	s_FinalizePart()
end

--- Move / delete a modified vanilla object in place. The object stays vanilla (byte-identical
--- geometry, auto-initialized by the engine); we only record it so the editor adopts it as an
--- editable, user-modified object with its saved guid.
---@param p_Object table savedEntry
function LevelInjector:PatchOriginalObject(p_Object)
	if p_Object.originalRef == nil or p_Object.originalRef.instanceGuid == nil then
		m_Logger:Write('Vanilla object without originalRef, skipping patch')
		return
	end

	local s_Reference

	if p_Object.originalRef.partitionGuid == nil or p_Object.originalRef.partitionGuid == "nil" then
		s_Reference = ResourceManager:SearchForInstanceByGuid(Guid(p_Object.originalRef.instanceGuid))
	else
		s_Reference = ResourceManager:FindInstanceByGuid(
			Guid(p_Object.originalRef.partitionGuid),
			Guid(p_Object.originalRef.instanceGuid))
	end

	if s_Reference == nil then
		m_Logger:Write('Unable to find original reference: ' .. tostring(p_Object.originalRef.instanceGuid))
		return
	end

	s_Reference = _G[s_Reference.typeInfo.name](s_Reference)
	s_Reference:MakeWritable()

	if p_Object.isDeleted then
		s_Reference.excluded = true
	end

	if p_Object.localTransform then
		s_Reference.blueprintTransform = LinearTransform(p_Object.localTransform)
	elseif p_Object.transform then
		s_Reference.blueprintTransform = LinearTransform(p_Object.transform)
	end

	-- Record for adoption: the original ROD instanceGuid is stable regardless of position.
	local s_Key = tostring(p_Object.originalRef.instanceGuid):upper()
	self.m_InjectedByRodGuid[s_Key] = p_Object
	if p_Object.blueprintCtrRef and p_Object.blueprintCtrRef.instanceGuid then
		self.m_InjectedBlueprints[tostring(p_Object.blueprintCtrRef.instanceGuid):upper()] = true
	end
end

--- Add a user-spawned (Custom / NoHavok) object as a fresh ReferenceObjectData.
---@param p_Object table savedEntry
---@param p_World WorldPartData
---@param p_RegistryContainer RegistryContainer
function LevelInjector:AddCustomObject(p_Object, p_World, p_RegistryContainer)
	if p_Object.blueprintCtrRef == nil or p_Object.blueprintCtrRef.instanceGuid == nil then
		m_Logger:Write('Custom object without blueprintCtrRef, skipping')
		return
	end

	-- Resolve the blueprint ONCE per unique guid (cached): the lookup + Is()/Banger checks +
	-- Blueprint wrapper are the per-object hot cost on huge saves.
	local s_BpKey = tostring(p_Object.blueprintCtrRef.instanceGuid)
	local s_Cached = self.m_BpCache[s_BpKey]

	if s_Cached == nil then
		local s_Blueprint = ResourceManager:FindInstanceByGuid(
			Guid(p_Object.blueprintCtrRef.partitionGuid),
			Guid(p_Object.blueprintCtrRef.instanceGuid))

		if s_Blueprint == nil then
			m_Logger:Write('Cannot find blueprint with guid ' .. s_BpKey)
			self.m_BpCache[s_BpKey] = false
			return
		end

		local s_IsBanger = false
		if s_Blueprint:Is("ObjectBlueprint") then
			local s_ObjectBlueprint = ObjectBlueprint(s_Blueprint)
			-- Filter BangerEntityData (crashes when injected this way), same as MapLoader.
			if s_ObjectBlueprint.object and s_ObjectBlueprint.object:Is("BangerEntityData") then
				s_IsBanger = true
			end
		end

		s_Cached = {
			isBanger = s_IsBanger,
			isEffect = s_Blueprint:Is("EffectBlueprint"),
			raw = s_Blueprint, -- the DataContainer; wrap per-object below (sharing one wrapper is risky)
		}
		self.m_BpCache[s_BpKey] = s_Cached
	elseif s_Cached == false then
		return -- blueprint not found (cached miss)
	end

	if s_Cached.isBanger then
		return
	end

	local s_Reference
	if s_Cached.isEffect then
		s_Reference = EffectReferenceObjectData()
		s_Reference.autoStart = true
	else
		s_Reference = ReferenceObjectData()
	end

	p_RegistryContainer.referenceObjectRegistry:add(s_Reference)

	if p_Object.localTransform then
		s_Reference.blueprintTransform = LinearTransform(p_Object.localTransform)
	else
		s_Reference.blueprintTransform = LinearTransform(p_Object.transform)
	end

	s_Reference.blueprint = Blueprint(s_Cached.raw)

	local s_Variation = p_Object.variation or 0
	if s_Variation ~= 0 then
		if self.m_ObjectVariations[s_Variation] == nil then
			-- Variation not loaded yet; queue this ref to be resolved on Partition:Loaded.
			if self.m_PendingVariations[s_Variation] == nil then
				self.m_PendingVariations[s_Variation] = {}
			end
			table.insert(self.m_PendingVariations[s_Variation], s_Reference)
		else
			s_Reference.objectVariation = self.m_ObjectVariations[s_Variation]
		end
	end

	-- Index within THIS world part + base offset above existing level objects (like MapLoader).
	-- `#p_World.objects` is now cheap because each part is capped at INJ_OBJECTS_PER_WORLDPART.
	s_Reference.indexInBlueprint = #p_World.objects + self.m_IndexCount + 1
	s_Reference.isEventConnectionTarget = Realm.Realm_None
	s_Reference.isPropertyConnectionTarget = Realm.Realm_None
	s_Reference.excluded = false

	p_World.objects:add(s_Reference)

	-- Record for adoption keyed by blueprint + world position (fresh RODs have no usable guid).
	local s_BpGuid = tostring(p_Object.blueprintCtrRef.instanceGuid):upper()
	self.m_InjectedBlueprints[s_BpGuid] = true

	local s_ChosenTransform = p_Object.localTransform or p_Object.transform
	local s_Key = _BpPosKey(s_BpGuid, s_ChosenTransform)
	if s_Key ~= nil then
		if self.m_InjectedByBpPos[s_Key] == nil then
			self.m_InjectedByBpPos[s_Key] = {}
		end
		table.insert(self.m_InjectedByBpPos[s_Key], p_Object)
	end
end

function LevelInjector:OnLevelDestroy()
	self.m_InjectedByRodGuid = {}
	self.m_InjectedByBpPos = {}
	self.m_InjectedBlueprints = {}
	self.m_ObjectVariations = {}
	self.m_PendingVariations = {}
	self.m_IndexCount = 0
	self.m_HasPatched = false
	-- NOTE: m_PrimaryLevelGuids is intentionally KEPT. On a same-map restart the LevelData
	-- partition stays mounted and Partition:Loaded does NOT re-fire, so we must reuse the guids
	-- captured on the initial map entry. On a full map change Partition:Loaded fires again and
	-- overwrites them with the fresh instance. m_LevelData is likewise kept (ProjectManager
	-- replaces it on a new project load).
end

LevelInjector = LevelInjector()

return LevelInjector
