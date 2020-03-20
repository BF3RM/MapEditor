class 'GameObjectManager'

local m_Logger = Logger("GameObjectManager", true)

function GameObjectManager:__init(p_Realm)
    m_Logger:Write("Initializing GameObjectManager: " .. tostring(p_Realm))
    self.m_Realm = p_Realm
    self:RegisterVars()
    self:RegisterEvents()
end

function GameObjectManager:RegisterVars()
    self.m_GameObjects = {}
    self.m_PendingCustomBlueprintGuids = {} -- this table contains all user spawned blueprints that await resolving
    self.m_Entities = {}
    self.m_UnresolvedGameObjects = {}
    self.m_UnresolvedClientOnlyChildren = {}
    self.m_VanillaGameObjectGuids = {}
end

function GameObjectManager:OnLevelDestroy()
    self:RegisterVars()
end

function GameObjectManager:RegisterEvents()
    ---- Client events:
    --NetEvents:Subscribe("GameObjectManager:ServerGameObjectsGuids", self, self.OnServerGameObjectsGuidsReceived)
    --
    ---- Server events:
    --NetEvents:Subscribe("GameObjectManager:ClientOnlyObjectFound", self, self.OnClientOnlyObjectFound)
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

    local s_Blueprint = ResourceManager:FindInstanceByGUID(Guid(tostring(p_BlueprintPartitionGuid)), Guid(tostring(p_BlueprintInstanceGuid)))

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
    if ME_CONFIG.LOAD_VANILLA == false and self.m_PendingCustomBlueprintGuids[tostring(p_Blueprint.instanceGuid)] == nil then
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
        children = {},
        realm = Realm.Realm_ClientAndServer
    }

    s_GameObject.blueprintCtrRef = CtrRef {
        typeName = p_Blueprint.typeInfo.name,
        name = s_Blueprint.name,
        partitionGuid = s_BlueprintPartitionGuid,
        instanceGuid = s_BlueprintInstanceGuid
    }

    self:ResolveChildren(s_GameObject)

    if (p_Parent == nil) then -- no parent (custom spawned blueprint) -> proceed in postprocessing
        --m_Logger:Write(">>>> PostProcessGameObjectAndChildren: blueprintName: " .. s_Blueprint.name)
        self:PostProcessGameObjectAndChildren(s_GameObject)
    elseif (InstanceParser:GetLevelData(s_ParentPrimaryInstance) ~= nil) then -- top level vanilla (level data) -> proceed in postprocessing
        --m_Logger:Write(">>>> PostProcessGameObjectAndChildren: blueprintName: " .. s_Blueprint.name)
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
        m_Logger:WriteTable(s_ParentData)
        m_Logger:Write( "PendingInfo guid: " .. tostring(s_PendingInfo.customGuid) .. " - ParentData: " .. tostring(s_PendingInfo.parentData))

        if s_ParentData.guid ~= "root" and s_ParentData.guid ~= "00000000-0000-0000-0000-000000000000" and s_ParentData.guid ~= "previewSpawn" then
            local s_ParentObject = self.m_GameObjects[s_ParentData.guid]

            if s_ParentObject == nil then
                m_Logger:Error("Couldn't find the parent instance. Parent guid: ".. s_ParentData.guid)
            end

            table.insert(s_ParentObject.children, p_GameObject)
        end

        self:SetGuidAndAddGameObjectRecursively(p_GameObject, false, s_PendingInfo.customGuid, s_PendingInfo.creatorName)
    else
        --self.m_VanillaBlueprintNumber = self.m_VanillaBlueprintNumber + 1

        local s_VanillaGuid = self:GetVanillaGuid(p_GameObject.name, p_GameObject.transform.trans, p_GameObject.typeName)

        self:SetGuidAndAddGameObjectRecursively(p_GameObject, true, s_VanillaGuid, "VanillaHook")
    end

    self.m_PendingCustomBlueprintGuids[s_BlueprintInstanceGuid] = nil

    if p_GameObject.parentData.guid ~= "previewSpawn" then
        -- at this point, the gameObject and all its children are fully ready to be transferred to JS -> invoke sending of CommandActionResults
        Events:DispatchLocal("GameObjectManager:GameObjectReady", p_GameObject)
    end
end

function GameObjectManager:SetGuidAndAddGameObjectRecursively(p_GameObject, p_IsVanilla, p_CustomGuid, p_CreatorName)
    p_GameObject.guid = p_CustomGuid
    p_GameObject.isVanilla = p_IsVanilla
    p_GameObject.creatorName = p_CreatorName
    
    if p_GameObject.children ~= nil then
        for _, s_ChildGameObject in pairs(p_GameObject.children) do
            local s_ChildGuid

            if (p_IsVanilla == true) then
                --self.m_VanillaBlueprintNumber = self.m_VanillaBlueprintNumber + 1

                s_ChildGuid = self:GetVanillaGuid(s_ChildGameObject.name, s_ChildGameObject.transform.trans, s_ChildGameObject.typeName)
            else
                s_ChildGuid = GenerateCustomGuid()
            end

            -- Update parentData as well:
            s_ChildGameObject.parentData.guid = p_CustomGuid
            --s_ChildGameObject.parentData.typeName = p_GameObject.blueprintCtrRef.typeName
            --s_ChildGameObject.parentData.primaryInstanceGuid = p_GameObject.blueprintCtrRef.instanceGuid
            --s_ChildGameObject.parentData.partitionGuid = p_GameObject.blueprintCtrRef.partitionGuid

            self:SetGuidAndAddGameObjectRecursively(s_ChildGameObject, p_IsVanilla, s_ChildGuid, p_CreatorName)
	        --self.m_GameObjects[tostring(s_ChildGameObject.guid)] = s_ChildGameObject
            --self:AddGameObjectToTable(s_ChildGameObject)
        end
    end

    if p_GameObject.gameEntities ~= nil then
        for _, l_Entity in pairs(p_GameObject.gameEntities) do
            self.m_Entities[l_Entity.instanceId] = p_GameObject.guid
        end
    end

    self:AddGameObjectToTable(p_GameObject)

    -- Save guid if its a vanilla object
    if p_IsVanilla then
        table.insert(self.m_VanillaGameObjectGuids, tostring(p_GameObject.guid))
    end

    return p_GameObject
    --
    --    --if m_Realm == Realm.Realm_Server then
    --    --elseif m_Realm == Realm.Realm_Client then
    --    --    self:CheckIfClientOnly(s_GuidString, p_GameObject)
    --    --end


    --if m_Realm == Realm.Realm_Client and p_IsVanilla then
    --    --self:NotifyServerAboutVanillaObject(p_GameObject.guid)
    --end

    --if (p_GameObject.isClientOnly == true) then
    --    self:NotifyServerAboutClientOnlyObject(p_GameObject.guid)
    --end
    --self.m_GameObjects[tostring(p_GameObject.guid)] = p_GameObject -- add gameObject to our array of gameObjects now that it is finalized
end

function GameObjectManager:GetVanillaGameObjectsGuids()
    return self.m_VanillaGameObjectGuids
end

----- CLIENT v v v v
--
--function GameObjectManager:OnServerGameObjectsGuidsReceived(p_GameObjectsGuids)
--    m_VanillaGameObjectGuids = p_GameObjectsGuids
--end
--
----- CLIENT ^ ^ ^ ^ --
--
----- SERVER v v v v --
--
--function GameObjectManager:OnClientOnlyObjectFound(p_Player, p_GameObjectTransferData)
--    local s_GameObject = GameObjectTransferData(p_GameObjectTransferData):GetGameObject()
--    local s_GuidString = tostring(s_GameObject.guid)
--
--    if (self.m_GameObjects[s_GuidString] ~= nil) then
--        m_Logger:Warning("Already had a client only object received with the same guid")
--        return
--    end
--
--    if (s_GameObject.parentData ~= nil) then
--        local parentGuidString = tostring(s_GameObject.parentData.guid)
--        local parent = self.m_GameObjects[parentGuidString]
--
--        if (parent ~= nil) then
--            --m_Logger:Write("Resolved child " .. tostring(s_GameObject.guid) .. " with parent " .. tostring(parent.guid))
--
--            table.insert(parent.children, s_GameObject)
--        else
--            if (self.m_UnresolvedClientOnlyChildren[parentGuidString] == nil) then
--                self.m_UnresolvedClientOnlyChildren[parentGuidString] = { }
--            end
--
--            table.insert(self.m_UnresolvedClientOnlyChildren[parentGuidString], tostring(s_GameObject.guid))
--        end
--    end
--
--    if (self.m_UnresolvedClientOnlyChildren[s_GuidString] ~= nil and
--            #self.m_UnresolvedClientOnlyChildren[s_GuidString] > 0) then -- current gameobject is some previous clientonly gameobject's parent
--
--        for _, childGameObjectGuidString in pairs(self.m_UnresolvedClientOnlyChildren[s_GuidString]) do
--            table.insert(s_GameObject.children, self.m_GameObjects[childGameObjectGuidString])
--            --m_Logger:Write("Resolved child " .. childGameObjectGuidString .. " with parent " .. s_GuidString)
--        end
--
--        self.m_UnresolvedClientOnlyChildren[s_GuidString] = { }
--    end
--
--    self:AddGameObjectToTable(s_GameObject)
--    m_Logger:Write("Added client only gameobject on server (without gameEntities). guid: " .. s_GuidString)
--end

--- SERVER ^ ^ ^ ^ --

function GameObjectManager:AddGameObjectToTable(p_GameObject)
    local guidAsString = tostring(p_GameObject.guid)

    if (self.m_GameObjects[guidAsString] ~= nil) then
        m_Logger:Warning("GAMEOBJECT WITH SAME GUID ALREADY EXISTS: " ..  guidAsString)
    end

    m_Logger:Write(tostring(p_GameObject.guid) .. " | " .. p_GameObject.name .. " | " .. tostring(p_GameObject.transform.trans))

    self.m_GameObjects[guidAsString] = p_GameObject -- add gameObject to our array of gameObjects now that it is finalized
end

function GameObjectManager:GetVanillaGuid(p_Name, p_Transform, p_TypeName)
    local s_VanillaGuid = GenerateVanillaGuid(p_Name, p_Transform, 0)
    local s_Increment = 1


    while (self.m_GameObjects[tostring(s_VanillaGuid)] ~= nil) do

        s_VanillaGuid = GenerateVanillaGuid(p_Name, p_Transform, s_Increment)

        s_Increment = s_Increment + 1
    end

    --if p_IsClientOnly then
    --    m_Logger:Write(tostring(s_VanillaGuid) .. " - " .. p_TypeName .. " - CLIENT ONLY")
    --else
    --    m_Logger:Write(tostring(s_VanillaGuid) .. " - " .. p_TypeName)
    --end
    
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
        return false
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
    local s_GameObject = self.m_GameObjects[p_Guid]

    if s_GameObject == nil then
        m_Logger:Error('Object with id ' .. p_Guid .. ' does not exist')
        return false
    end

    return s_GameObject:SetTransform(p_LinearTransform, p_UpdateCollision)
end

return GameObjectManager
