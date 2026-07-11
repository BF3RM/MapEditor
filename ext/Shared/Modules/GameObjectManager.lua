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
	Events:Subscribe("Shared:StoreTimeStamps", self, self.StoreTimeStamps)
	-- Drain the deferred "GameObjectReady" queue for load-injected objects a few per frame, so
	-- registering thousands of injected objects into the editor/WebUI tree doesn't block the frame
	-- (the objects already rendered NATIVELY with the level; this only makes them editable/appear
	-- in the tree, and doing it all at once on a huge save froze/crashed the client).
	Events:Subscribe("Engine:Update", self, self.OnInjectedReadyPump)
end

---@param p_GUID_To_Timestamps table
function GameObjectManager:StoreTimeStamps(p_GUID_To_Timestamps)
	self.m_GUID_To_Timestamps = p_GUID_To_Timestamps
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

function GameObjectManager:RegisterVars()
	---@type table<string, GameObject>
	self.m_GameObjects = {}
	self.m_PendingCustomBlueprintGuids = {} -- this table contains all user spawned blueprints that await resolving
	self.m_PendingBlueprint = {}

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
	self:RegisterVars()
end

---@param p_GameObjectGuid string|Guid
function GameObjectManager:GetGameObject(p_GameObjectGuid)
	return self.m_GameObjects[tostring(p_GameObjectGuid)]
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

	local s_Params = EntityCreationParams()
	s_Params.transform = p_LinearTransform
	s_Params.variationNameHash = p_Variation
	s_Params.networked = s_ObjectBlueprint.needNetworkId

	local s_EntityBus = EntityManager:CreateEntitiesFromBlueprint(s_Blueprint, s_Params)

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
function GameObjectManager:OnEntityCreateFromBlueprint(p_HookCtx, p_Blueprint, p_Transform, p_Variation, p_Parent)
	local s_PendingCustomBlueprintInfo = self.m_PendingCustomBlueprintGuids[tostring(p_Blueprint.instanceGuid)]

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
	-- Skip TRACKING baked static geometry the editor can't edit (a bare return is a hook
	-- PASS-THROUGH in VU, so the engine still creates and RENDERS it — we just don't track it),
	-- keeping B2K/XP1's thousands of baked statics out of the Scene Instances tree and the hover
	-- pick scan (what froze the game). ONLY for vanilla level objects: a USER spawn of such a
	-- prop from Project Data (s_PendingCustomBlueprintInfo set) MUST still be tracked, or it'd
	-- appear nowhere even though the command "succeeded".
	if s_PendingCustomBlueprintInfo == nil and s_InjectedInfo == nil and s_Blueprint:Is("ObjectBlueprint") and s_Blueprint.object ~= nil then
		local s_ObjType = s_Blueprint.object.typeInfo.name
		if s_ObjType == "DebrisClusterData"
			or s_ObjType == "StaticModelEntityData"
			or s_ObjType == "StaticModelGroupEntityData" then
			return
		end
	end

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
		s_TimeStamp = SharedUtils:GetTimeMS()
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
		s_GameObject.overrides = s_PendingCustomBlueprintInfo.overrides
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
			if l_Member:Is('ReferenceObjectData') then
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
	---@type EntityBus|nil
	local s_EntityBus = p_HookCtx:Call()

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

	for l_Index, l_Entity in pairs(s_EntityBus.entities) do
		if self.m_ProcessedEntities[l_Entity.instanceId] then
			goto continue
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
			if s_GameObject.wasInjected then
				-- Defer: register into the editor/WebUI tree over frames (see OnInjectedReadyPump)
				-- so a huge save doesn't block the frame while thousands register at once. The
				-- object is already in m_GameObjects (selectable) and rendered natively.
				table.insert(self.m_PendingInjectedReady, s_GameObject)
			else
				Events:DispatchLocal("GameObjectManager:GameObjectReady", s_GameObject)
			end
		end
	end

	--- If its a root custom object we remove it from pending and call ready event.
	if s_PendingCustomBlueprintInfo ~= nil then
		self.m_PendingCustomBlueprintGuids[tostring(s_GameObject.blueprintCtrRef.instanceGuid)] = nil

		if s_GameObject.guid ~= PREVIEW_GUID then
			--m_Logger:Write("Spawning: " .. s_GameObject.guid)
			Events:DispatchLocal("GameObjectManager:GameObjectReady", s_GameObject)
		end
	end

	if s_GameObject.guid == PREVIEW_GUID then -- Set collision to 0,0,0 so we don't hit the same object over and over
		s_GameObject:SetTransform(LinearTransform(), true)
		s_GameObject:SetTransform(p_Transform, false)
	end

	if s_GameObject:HasOverrides() then
		m_Logger:Write("Patching GameObject: " .. tostring(s_GameObject.guid))
		s_GameObject:SetOverrides(s_GameObject.overrides)
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
	}
	local s_PartitionGuid = InstanceParser:GetPartition(p_EntityData.instanceGuid);
	s_GameEntity.initiatorRef = CtrRef {
		typeName = p_EntityData.typeInfo.name,
		instanceGuid = tostring(p_EntityData.instanceGuid),
		partitionGuid = s_PartitionGuid
	}

	local s_PendingGameObject = self.m_PendingBlueprint[s_PartitionGuid]

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
		self.m_PendingEntities[s_Entity.instanceId] = nil
		self.m_ProcessedEntities[s_Entity.instanceId] = true
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
