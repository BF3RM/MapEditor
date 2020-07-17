class 'GameObjectManager'

local m_Logger = Logger("GameObjectManager", true)

function GameObjectManager:__init(p_Realm)
	m_Logger:Write("Initializing GameObjectManager: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
	self:RegisterVars()
end

function GameObjectManager:RegisterVars()
	self.m_GameObjects = {}
	self.m_PendingCustomBlueprintGuids = {} -- this table contains all user spawned blueprints that await resolving
	self.m_Entities = {}
	self.m_VanillaGameObjectGuids = {}

	--- key: child (ReferenceObjectData) guid, value: parent GameObject guid
	self.m_ReferenceObjectDatas = {}
end

function GameObjectManager:OnLevelDestroy()
	self:RegisterVars()
end

function GameObjectManager:GetGameEntities(p_EntityIds)
	local s_GameEntities = {}

	for _, l_EntityId in pairs(p_EntityIds) do
		local s_Entity = self.m_Entities[l_EntityId]

		if (s_Entity == nil) then
			m_Logger:Error("Entity not found: " .. tostring(l_EntityId))
		end

		table.insert(s_GameEntities, s_Entity)
	end

	return s_GameEntities
end

function GameObjectManager:InvokeBlueprintSpawn(p_GameObjectGuid, p_SenderName, p_BlueprintPartitionGuid, p_BlueprintInstanceGuid, p_ParentData, p_LinearTransform, p_Variation, p_IsPreviewSpawn)
	if p_BlueprintPartitionGuid == nil or
			p_BlueprintInstanceGuid == nil or
			p_LinearTransform == nil then

		m_Logger:Error('InvokeBlueprintSpawn: One or more parameters are nil.')
		return false
	end

	if self.m_Entities[p_GameObjectGuid] ~= nil then
		m_Logger:Warning('Object with id ' .. p_GameObjectGuid .. ' already existed as a spawned entity!')
		return false
	end

	p_Variation = p_Variation or 0

	local s_Blueprint = ResourceManager:FindInstanceByGuid(Guid(tostring(p_BlueprintPartitionGuid)), Guid(tostring(p_BlueprintInstanceGuid)))

	if s_Blueprint == nil then
		m_Logger:Error("Couldn't find the specified instance: Partition: " .. tostring(p_BlueprintPartitionGuid) .. " | Instance: " .. tostring(p_BlueprintInstanceGuid))
		return false
	end

	local s_ObjectBlueprint = _G[s_Blueprint.typeInfo.name](s_Blueprint)

	m_Logger:Write('Invoking spawning of blueprint: '.. s_ObjectBlueprint.name .. " | ".. s_Blueprint.typeInfo.name .. ", ID: " .. p_GameObjectGuid .. ", Instance: " .. tostring(p_BlueprintInstanceGuid) .. ", Variation: " .. p_Variation)
	if p_IsPreviewSpawn == false then
		self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = { customGuid = p_GameObjectGuid, creatorName = p_SenderName, parentData = p_ParentData }
	else
		local s_PreviewSpawnParentData = GameObjectParentData{
			guid = "previewSpawn",
			typeName = "previewSpawn",
			primaryInstanceGuid = "previewSpawn",
			partitionGuid = "previewSpawn",
		}
		m_Logger:Write("Added s_PreviewSpawnParentData: " .. tostring(s_PreviewSpawnParentData.guid))
		m_Logger:WriteTable(s_PreviewSpawnParentData)
		self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = { customGuid = p_GameObjectGuid, creatorName = p_SenderName, parentData = s_PreviewSpawnParentData }
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
function GameObjectManager:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
	-- We dont load vanilla objects if the flag is active
	if ME_CONFIG.LOAD_VANILLA == false and self.m_PendingCustomBlueprintGuids[tostring(p_Blueprint.instanceGuid)] == nil then
		return
	end

	if p_Parent ~= nil and p_Parent.instanceGuid == Guid('FE9BF899-0000-0000-FF64-00FF64076739') then
		m_Logger:Write("Loading havok WorldPartData")
	end
	local s_BlueprintInstanceGuid = tostring(p_Blueprint.instanceGuid)
	local s_BlueprintPartitionGuid = InstanceParser:GetPartition(p_Blueprint.instanceGuid)
	--local s_BlueprintPrimaryInstance = InstanceParser:GetPrimaryInstance(s_BlueprintPartitionGuid)

	local s_ParentInstanceGuid
	local s_ParentPartitionGuid
	local s_ParentPrimaryInstance

	if (p_Parent ~= nil) then
		s_ParentInstanceGuid = tostring(p_Parent.instanceGuid)
		s_ParentPartitionGuid = InstanceParser:GetPartition(s_ParentInstanceGuid)
		s_ParentPrimaryInstance = InstanceParser:GetPrimaryInstance(s_ParentPartitionGuid)
	end
	local s_Blueprint = _G[p_Blueprint.typeInfo.name](p_Blueprint) -- do we need that? for the name?
	if (s_Blueprint:Is("ObjectBlueprint") and s_Blueprint.object ~= nil and s_Blueprint.object.typeInfo.name == "DebrisClusterData") then
		return
	end
	local original = CtrRef{}
	if(p_Parent ~= nil) then
		original = CtrRef {
			typeName = p_Parent.typeInfo.name,
			instanceGuid = s_ParentInstanceGuid,
			partitionGuid = tostring(p_Parent.partitionGuid)
		}
	end
	local s_GameObject = GameObject{
		guid = GenerateTempGuid(), -- we set a tempGuid, it will later be set to a vanilla or custom guid
		name = s_Blueprint.name,
		--typeName = p_Blueprint.typeInfo.name,
		parentData = GameObjectParentData{},
		transform = p_Transform,
		variation = p_Variation,
		isVanilla = true,
		isDeleted = false,
		isEnabled = true,
		gameEntities = {},
		children = {},
		realm = Realm.Realm_ClientAndServer,
		original = original
	}

	s_GameObject.blueprintCtrRef = CtrRef {
		typeName = p_Blueprint.typeInfo.name,
		name = s_Blueprint.name,
		partitionGuid = s_BlueprintPartitionGuid,
		instanceGuid = s_BlueprintInstanceGuid
	}
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
			self:ResolveRootObject(s_GameObject)
			-- Child object
		else
			self:ResolveChildObject(s_GameObject, s_ParentGameObject)
			self.m_ReferenceObjectDatas[tostring(p_Parent.instanceGuid)] = nil
		end
	else
		if self.m_PendingCustomBlueprintGuids[tostring(p_Blueprint.instanceGuid)] == nil then
			m_Logger:Write('Found vanilla object without parent. Name: '..tostring(s_Blueprint.name)..', Guid: '..tostring(s_Blueprint.instanceGuid)) -- TODO: do we need to add these objects?
			-- Ignore, these are usually weapons and soldier entities, which we dont support (at least for now)
			self.m_GameObjects[tostring(s_GameObject.guid)] = nil
			return
		else
			m_Logger:Write('Found custom object without parent')
			-- Custom object, parent is root
			self:ResolveRootObject(s_GameObject)
		end
	end

	--- Save ReferenceObjectDatas that the blueprint might have, to resolve parents of descendants.
	--For prefabs:
	if (s_Blueprint.objects ~= nil) then
		for _, l_Member in pairs(s_Blueprint.objects) do
			if l_Member:Is('ReferenceObjectData') then
				self.m_ReferenceObjectDatas[tostring(l_Member.instanceGuid)] = { parentGuid = s_GameObject.guid, typeName = l_Member.typeInfo.name }
			end
		end
	end

	-- For blueprints:
	if (s_Blueprint.object ~= nil) then
		if s_Blueprint.object:Is('ReferenceObjectData') then
			self.m_ReferenceObjectDatas[tostring(s_Blueprint.object.instanceGuid)] = { parentGuid = s_GameObject.guid, typeName = s_Blueprint.object.typeInfo.name }
		end
	end

	---^^^^ This is parent to children / top to bottom ^^^^
	local s_EntityBus = p_Hook:Call()
	---vvvv This is children to parent / bottom to top vvvv

	-- Custom object have to be manually initialized.
	if not s_GameObject.isVanilla then
		for _,l_Entity in pairs(s_EntityBus.entities) do
			-- TODO: find out if the blueprint is client or server only and init in correct realm, maybe Realm_ClientAndServer otherwise.
			l_Entity:Init(self.m_Realm, true)
			--l_Entity:Init(Realm.Realm_ClientAndServer, true)
		end
	end

	for l_Index, l_Entity in pairs(s_EntityBus.entities) do
		if (self.m_Entities[l_Entity.instanceId] == nil) then -- Only happens for the direct children of the blueprint, they get yielded first
			local s_GameEntity = GameEntity{
				entity = l_Entity,
				instanceId = l_Entity.instanceId,
				indexInBlueprint = l_Index,
				typeName = l_Entity.typeInfo.name,
			}

			if(l_Entity:Is("SpatialEntity") and l_Entity.typeInfo.name ~= "OccluderVolumeEntity") then
				local s_Entity = SpatialEntity(l_Entity)
				s_GameEntity.isSpatial = true
				s_GameEntity.transform = ToLocal(s_Entity.transform, p_Transform)
				s_GameEntity.aabb = AABB {
					min = s_Entity.aabb.min,
					max = s_Entity.aabb.max,
					transform = ToLocal(s_Entity.aabbTransform, p_Transform)
				}
			end

			self.m_Entities[l_Entity.instanceId] = s_GameObject.guid
			table.insert(s_GameObject.gameEntities, s_GameEntity)
		end
	end

	--- If its a root object all children are now resolved so we update WebUI.
	if s_GameObject.parentData.guid == nil then
		local s_UnresolvedRODCount = GetLength(self.m_ReferenceObjectDatas)
		if (s_UnresolvedRODCount ~= 0) then
			-- TODO: update blueprint data with the correct realm if its client or server only
			if self.m_Realm == Realm.Realm_Server then
				m_Logger:Write(s_UnresolvedRODCount .. ' client-only gameobjects weren\'t resolved')
				for l_Guid, l_Value in pairs(self.m_ReferenceObjectDatas) do
					m_Logger:Write(tostring(l_Guid) .. ', '..l_Value.typeName)
				end
			elseif self.m_Realm == Realm.Realm_Client then
				m_Logger:Write(s_UnresolvedRODCount .. ' server-only gameobjects weren\'t resolved')
				for l_Guid, l_Value in pairs(self.m_ReferenceObjectDatas) do
					m_Logger:Write(tostring(l_Guid) .. ', '..l_Value.typeName)
				end
			end

			self.m_ReferenceObjectDatas = {}
		end
		Events:DispatchLocal("GameObjectManager:GameObjectReady", s_GameObject)
	end

	--- If its a root custom object we remove it from pending and call ready event.
	if self.m_PendingCustomBlueprintGuids[tostring(s_GameObject.blueprintCtrRef.instanceGuid)] ~= nil then
		self.m_PendingCustomBlueprintGuids[tostring(s_GameObject.blueprintCtrRef.instanceGuid)] = nil
		Events:DispatchLocal("GameObjectManager:GameObjectReady", s_GameObject)
	end
end

function GameObjectManager:ResolveRootObject(p_GameObject)
	local s_PendingInfo = self.m_PendingCustomBlueprintGuids[tostring(p_GameObject.blueprintCtrRef.instanceGuid)]
	self.m_GameObjects[tostring(p_GameObject.guid)] = nil -- Remove temp guid from array

	if (s_PendingInfo) then -- We spawned this custom entitybus
		p_GameObject.parentData = GameObjectParentData{
			guid = s_PendingInfo.parentData.guid,
			typeName = s_PendingInfo.parentData.typeName,
			primaryInstanceGuid = s_PendingInfo.parentData.primaryInstanceGuid,
			partitionGuid = s_PendingInfo.parentData.partitionGuid
		}
		p_GameObject.guid = s_PendingInfo.customGuid
		p_GameObject.isVanilla = false
	else -- This is a vanilla root object
		p_GameObject.guid = self:GetVanillaGuid(p_GameObject.name, p_GameObject.transform.trans)
		p_GameObject.isVanilla = true

		table.insert(self.m_VanillaGameObjectGuids, p_GameObject.guid)
	end

	self.m_GameObjects[tostring(p_GameObject.guid)] = p_GameObject
end

function GameObjectManager:ResolveChildObject(p_GameObject, p_ParentGameObject)
	-- This is a child of either a custom gameObject or a vanilla gameObject, find the parent!
	p_GameObject.parentData = GameObjectParentData{
		guid = p_ParentGameObject.guid,
		typeName = p_ParentGameObject.blueprintCtrRef.typeName,
		primaryInstanceGuid = p_ParentGameObject.blueprintCtrRef.instanceGuid,
		partitionGuid = p_ParentGameObject.blueprintCtrRef.partitionGuid
	}

	p_GameObject.isVanilla = p_ParentGameObject.isVanilla
	self.m_GameObjects[tostring(p_GameObject.guid)] = nil -- Remove temp guid from array
	if p_GameObject.isVanilla then
		p_GameObject.guid = self:GetVanillaGuid(p_GameObject.name, p_GameObject.transform.trans)
		table.insert(self.m_VanillaGameObjectGuids, p_GameObject.guid)
	else
		local i = 1
		local s_CustomGuid
		repeat
			s_CustomGuid = GenerateChildGuid(p_GameObject.parentData.guid, i)
			i = i + 1
		until self.m_GameObjects[tostring(s_CustomGuid)] == nil
		p_GameObject.guid = s_CustomGuid
	end
	self.m_GameObjects[tostring(p_GameObject.guid)] = p_GameObject
	table.insert(p_ParentGameObject.children, p_GameObject)
end

function GameObjectManager:GetVanillaGameObjectsGuids()
	return self.m_VanillaGameObjectGuids
end

function GameObjectManager:AddGameObjectToTable(p_GameObject)
	local guidAsString = tostring(p_GameObject.guid)

	if (self.m_GameObjects[guidAsString] ~= nil) then
		m_Logger:Warning("GAMEOBJECT WITH SAME GUID ALREADY EXISTS: " ..  guidAsString)
	end

	m_Logger:Write(tostring(p_GameObject.guid) .. " | " .. p_GameObject.name .. " | " .. tostring(p_GameObject.transform.trans))

	self.m_GameObjects[guidAsString] = p_GameObject -- add gameObject to our array of gameObjects now that it is finalized
end

function GameObjectManager:GetVanillaGuid(p_Name, p_Transform)
	local s_VanillaGuid = GenerateVanillaGuid(p_Name, p_Transform, 0)
	local s_Increment = 1
	while (self.m_GameObjects[tostring(s_VanillaGuid)] ~= nil) do
		s_VanillaGuid = GenerateVanillaGuid(p_Name, p_Transform, s_Increment)
		s_Increment = s_Increment + 1
	end
	return s_VanillaGuid
end

function GameObjectManager:DeleteGameObject(p_Guid)
	local s_GameObject = self.m_GameObjects[p_Guid]

	if (s_GameObject == nil) then
		m_Logger:Error("GameObject not found: " .. p_Guid)
		return false
	end

	if (s_GameObject.isDeleted == true) then
		m_Logger:Error("GameObject was already marked as deleted: " .. p_Guid)
		return true
	end

	if (s_GameObject.isVanilla) then
		s_GameObject:MarkAsDeleted()
	else
		s_GameObject:Destroy()

		self.m_GameObjects[p_Guid] = nil
	end

	return true
end

function GameObjectManager:UndeleteBlueprint(p_Guid)
	local s_GameObject = self.m_GameObjects[p_Guid]

	if (s_GameObject == nil) then
		m_Logger:Error("GameObject not found: " .. p_Guid)
		return false
	end

	if (s_GameObject.isDeleted == false) then
		m_Logger:Error("GameObject was not marked as deleted before undeleting: " .. p_Guid)
		return false
	end

	if (s_GameObject.isVanilla == false) then
		m_Logger:Error("GameObject was not a vanilla object " .. p_Guid)
		return false
	end

	s_GameObject:MarkAsUndeleted()

	return true
end

--function GameObjectManager:DestroyGameObject(p_Guid)
--    local s_GameObject = self.m_GameObjects[p_Guid]
--
--    if (s_GameObject == nil) then
--        m_Logger:Error("GameObject not found: " .. p_Guid)
--        return false
--    end
--
--    s_GameObject:Destroy()
--
--    self.m_GameObjects[self.guid] = nil
--
--    return true
--end

function GameObjectManager:EnableGameObject(p_Guid)
	local s_GameObject = self.m_GameObjects[p_Guid]

	if (s_GameObject == nil) then
		m_Logger:Error("Failed to find and enable blueprint: " .. p_Guid)
		return false
	end

	s_GameObject:Enable()

	return true
end

function GameObjectManager:DisableGameObject(p_Guid)
	local s_GameObject = self.m_GameObjects[p_Guid]

	if (s_GameObject == nil) then
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

return GameObjectManager
