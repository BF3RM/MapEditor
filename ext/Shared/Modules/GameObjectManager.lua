class 'GameObjectManager'

local m_Logger = Logger("GameObjectManager", true)

function GameObjectManager:__init(p_Realm)
    m_Logger:Write("Initializing GameObjectManager: " .. tostring(p_Realm))
    self.m_Realm = p_Realm;
    self:RegisterVars()
end

function GameObjectManager:RegisterVars()
    self.m_VanillaBlueprintNumber = 0

    self.m_GameObjects = {}
    self.m_PendingCustomBlueprintGuids = {}
    self.m_Entities = {}
    self.m_UnresolvedGameObjects = {}
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

function GameObjectManager:InvokeBlueprintSpawn(p_GameObjectGuid, p_SenderName, p_BlueprintPartitionGuid, p_BlueprintInstanceGuid, p_ParentData, p_LinearTransform, p_Variation)
    if p_BlueprintPartitionGuid == nil or
        p_BlueprintInstanceGuid == nil or
        p_LinearTransform == nil then

        m_Logger:Error('InvokeBlueprintSpawn: One or more parameters are nil.')
        return false
    end

    if self.m_Entities[p_GameObjectGuid] ~= nil then
        m_Logger:Write('Object with id ' .. p_GameObjectGuid .. ' already existed as a spawned entity!')
        return false
    end

    p_Variation = p_Variation or 0

    local s_Blueprint = ResourceManager:FindInstanceByGUID(Guid(p_BlueprintPartitionGuid), Guid(p_BlueprintInstanceGuid))

    if s_Blueprint == nil then
        m_Logger:Error("Couldn't find the specified instance")
        return false
    end

    local s_ObjectBlueprint = _G[s_Blueprint.typeInfo.name](s_Blueprint)

    m_Logger:Write('Invoking spawning of blueprint: '.. s_ObjectBlueprint.name .. " | ".. s_Blueprint.typeInfo.name .. ", ID: " .. p_GameObjectGuid .. ", Instance: " .. tostring(p_BlueprintInstanceGuid) .. ", Variation: " .. p_Variation)
    self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = { customGuid = p_GameObjectGuid, creatorName = p_SenderName, parentData = p_ParentData }

    local s_Params = EntityCreationParams()
    s_Params.transform = p_LinearTransform
    s_Params.variationNameHash = p_Variation
    s_Params.networked = s_ObjectBlueprint.needNetworkId

    local s_ObjectEntities = EntityManager:CreateEntitiesFromBlueprint(s_Blueprint, s_Params)

    if #s_ObjectEntities == 0 then
        m_Logger:Error("Spawning failed")
        self.m_PendingCustomBlueprintGuids[p_BlueprintInstanceGuid] = nil
        return false
    end

    for _,l_Entity in pairs(s_ObjectEntities) do
        l_Entity:Init(self.m_Realm, true)
    end

    return true
end

function GameObjectManager:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
    -- We dont load vanilla objects if the flag is active
    if not ME_CONFIG.LOAD_VANILLA and self.m_PendingCustomBlueprintGuids[tostring(p_Blueprint.instanceGuid)] == nil then
        return
    end

    local s_TempGuid = GenerateTempGuid()

    local s_BlueprintInstanceGuid = tostring(p_Blueprint.instanceGuid)
    local s_BlueprintPartitionGuid = InstanceParser:GetPartition(p_Blueprint.instanceGuid)
    local s_BlueprintPrimaryInstance = InstanceParser:GetPrimaryInstance(s_BlueprintPartitionGuid)

    local s_ParentInstanceGuid
    local s_ParentPartitionGuid
    local s_ParentPrimaryInstance

    if (p_Parent ~= nil) then
        s_ParentInstanceGuid = tostring(p_Parent.instanceGuid)
        s_ParentPartitionGuid = InstanceParser:GetPartition(s_ParentInstanceGuid)
        s_ParentPrimaryInstance = InstanceParser:GetPrimaryInstance(s_ParentPartitionGuid)
    end

    local s_SpawnedEntities = p_Hook:Call()
    local s_GameEntities = {}

    for l_Index, l_Entity in ipairs(s_SpawnedEntities) do

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

            self.m_Entities[l_Entity.instanceId] = s_TempGuid
            table.insert(s_GameEntities, s_GameEntity)
        end
    end

    local s_Blueprint = Blueprint(p_Blueprint) -- do we need that? for the name?
    local s_GameObject = GameObject{
        guid = s_TempGuid, -- we set a tempGuid, it will later be set to a vanilla or custom guid
        name = s_Blueprint.name,
        typeName = p_Blueprint.typeInfo.name,
        parentData = GameObjectParentData{},
        transform = p_Transform,
        variation = p_Variation,
        isVanilla = true,
        isDeleted = false,
        isEnabled = true,
        gameEntities = s_GameEntities,
        children = {}
    }

    s_GameObject.blueprintCtrRef = CtrRef {
        typeName = s_Blueprint.typeInfo.name,
        name = s_Blueprint.name,
        partitionGuid = s_BlueprintPartitionGuid,
        instanceGuid = s_BlueprintInstanceGuid
    }

    self:ResolveChildren(s_GameObject)

    if (p_Parent == nil) then -- no parent (custom spawned blueprint) -> proceed in postprocessing
        m_Logger:Write(">>>> PostProcessGameObjectAndChildren: blueprintName: " .. s_Blueprint.name)
        self:PostProcessGameObjectAndChildren(s_GameObject)
    elseif (InstanceParser:GetLevelData(s_ParentPrimaryInstance) ~= nil) then -- top level vanilla (level data) -> proceed in postprocessing
        m_Logger:Write(">>>> PostProcessGameObjectAndChildren: blueprintName: " .. s_Blueprint.name)
        s_GameObject.parentData = GameObjectParentData{
            guid = s_ParentPrimaryInstance,
            typeName = "LevelData",
            primaryInstanceGuid = s_ParentPrimaryInstance,
            partitionGuid = s_ParentPartitionGuid,
        }

        self:PostProcessGameObjectAndChildren(s_GameObject)
    elseif (s_ParentPrimaryInstance ~= nil) then
        if (self.m_UnresolvedGameObjects[s_ParentPrimaryInstance] == nil) then
            self.m_UnresolvedGameObjects[s_ParentPrimaryInstance] = { }
        end

        table.insert(self.m_UnresolvedGameObjects[s_ParentPrimaryInstance], s_GameObject)
    end
end

function GameObjectManager:ResolveChildren(p_GameObject)
    local s_ChildrenOfCurrentBlueprint = self.m_UnresolvedGameObjects[p_GameObject.blueprintCtrRef.instanceGuid]

    if (s_ChildrenOfCurrentBlueprint == nil) then -- no children
        return
    end

    for _, s_ChildGameObject in pairs(s_ChildrenOfCurrentBlueprint) do
        local s_ParentData = GameObjectParentData{
            guid = p_GameObject.guid,
            typeName = p_GameObject.blueprintCtrRef.typeName,
            primaryInstanceGuid = p_GameObject.blueprintCtrRef.instanceGuid,
            partitionGuid = p_GameObject.blueprintCtrRef.partitionGuid
        }

        s_ChildGameObject.parentData = s_ParentData
        table.insert(p_GameObject.children, s_ChildGameObject)
    end

    -- children successfully resolved
    self.m_UnresolvedGameObjects[p_GameObject.blueprintCtrRef.instanceGuid] = nil
end

function GameObjectManager:PostProcessGameObjectAndChildren(p_GameObject)
    local s_BlueprintInstanceGuid = p_GameObject.blueprintCtrRef.instanceGuid
    local s_PendingInfo = self.m_PendingCustomBlueprintGuids[s_BlueprintInstanceGuid]

    if (s_PendingInfo ~= nil) then -- the spawning of this blueprint was invoked by the user

        local s_ParentData = GameObjectParentData{
            guid = s_PendingInfo.parentData.guid,
            typeName = s_PendingInfo.parentData.typeName,
            primaryInstanceGuid = s_PendingInfo.parentData.primaryInstanceGuid,
            partitionGuid = s_PendingInfo.parentData.partitionGuid
        }

        p_GameObject.parentData = s_ParentData

        if s_ParentData.guid ~= "root" then
            local s_ParentObject = self.m_GameObjects[s_ParentData.guid]

            if s_ParentObject == nil then
                m_Logger:Error("Couldn't find the parent instance. Parent guid: ".. s_ParentData.guid)
            end

            table.insert(s_ParentObject.children, p_GameObject)

        end

        self:SetGuidAndAddGameObjectRecursively(p_GameObject, false, s_PendingInfo.customGuid, s_PendingInfo.creatorName)
    else
        self.m_VanillaBlueprintNumber = self.m_VanillaBlueprintNumber + 1
        local s_VanillaGuid = GenerateVanillaGuid(self.m_VanillaBlueprintNumber)

        self:SetGuidAndAddGameObjectRecursively(p_GameObject, true, s_VanillaGuid, "VanillaHook")
    end

    self.m_PendingCustomBlueprintGuids[s_BlueprintInstanceGuid] = nil

    -- at this point, the gameObject and all its children are fully ready to be transferred to JS -> invoke sending of CommandActionResults
    Events:DispatchLocal("GameObjectManager:GameObjectReady", p_GameObject)
end

function GameObjectManager:SetGuidAndAddGameObjectRecursively(p_GameObject, p_IsVanilla, p_CustomGuid, p_CreatorName)
    p_GameObject.guid = p_CustomGuid
    p_GameObject.isVanilla = p_IsVanilla
    p_GameObject.creatorName = p_CreatorName

    if p_GameObject.children ~= nil then
        for _, s_ChildGameObject in pairs(p_GameObject.children) do
            local s_ChildGuid

            if (p_IsVanilla == true) then
                self.m_VanillaBlueprintNumber = self.m_VanillaBlueprintNumber + 1

                s_ChildGuid = GenerateVanillaGuid(self.m_VanillaBlueprintNumber)
            else
                s_ChildGuid = GenerateCustomGuid()
            end

            -- Update parentData as well:
            s_ChildGameObject.parentData.guid = p_CustomGuid
            --s_ChildGameObject.parentData.typeName = p_GameObject.blueprintCtrRef.typeName
            --s_ChildGameObject.parentData.primaryInstanceGuid = p_GameObject.blueprintCtrRef.instanceGuid
            --s_ChildGameObject.parentData.partitionGuid = p_GameObject.blueprintCtrRef.partitionGuid

            self:SetGuidAndAddGameObjectRecursively(s_ChildGameObject, p_IsVanilla, s_ChildGuid, p_CreatorName)
	        self.m_GameObjects[tostring(s_ChildGameObject.guid)] = s_ChildGameObject
        end
    end

    if p_GameObject.gameEntities ~= nil then
        for _, l_Entity in pairs(p_GameObject.gameEntities) do
            self.m_Entities[l_Entity.instanceId] = p_GameObject.guid
        end
    end

    self.m_GameObjects[tostring(p_GameObject.guid)] = p_GameObject -- add gameObject to our array of gameObjects now that it is finalized
end

function GameObjectManager:DestroyGameObject(p_Guid)
    local s_GameObject = self.m_GameObjects[p_Guid]

    if (s_GameObject == nil) then
        m_Logger:Error("Failed to destroy blueprint: " .. p_Guid)
        return false
    end

    s_GameObject:Destroy()

    return true
end


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
    local s_GameObject = self.m_GameObjects[p_Guid]

    if s_GameObject == nil then
        m_Logger:Error('Object with id ' .. p_Guid .. ' does not exist')
        return false
    end

    return s_GameObject:SetTransform(p_LinearTransform, p_UpdateCollision)
end

return GameObjectManager