class 'GameObjectManager'

local m_Logger = Logger("GameObjectManager", true)

function GameObjectManager:__init(p_Realm)
    m_Logger:Write("Initializing GameObjectManager: " .. tostring(p_Realm))
    self.m_Realm = p_Realm;
    self:RegisterVars()
end

function GameObjectManager:RegisterVars()
    self.m_GameObjects = {}
    self.m_Entities = {}

    self.m_UnresolvedGameObjects = {}
end

function GameObjectManager:OnLevelDestroy()
end

function GameObjectManager:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)

    local s_TempGuid = GenerateGuid()

    local s_BlueprintInstanceGuid = tostring(p_Blueprint.instanceGuid)
    local s_BlueprintPartitionGuid = InstanceParser:GetPartition(p_Blueprint.instanceGuid)
    local s_BlueprintPrimaryInstance = InstanceParser:GetPrimaryInstance(s_BlueprintPartitionGuid)

    local s_ParentInstanceGuid = tostring(p_Parent.instanceGuid)
    local s_ParentPartitionGuid = InstanceParser:GetPartition(s_ParentInstanceGuid)
    local s_ParentPrimaryInstance = InstanceParser:GetPrimaryInstance(s_ParentPartitionGuid)

    local s_SpawnedEntities = p_Hook:Call()
    local s_EntityIds = {}

    for l_Index, l_Entity in ipairs(s_SpawnedEntities) do
        if (self.m_Entities[l_Entity.instanceId] ~= nil) then
            self.m_Entities[l_Entity.instanceId] = l_Entity

            local s_GameEntity = GameEntity {
                entity = l_Entity,
                instanceId = l_Entity.instanceId,
                indexInBlueprint = l_Index,
                typeName = l_Entity.typeInfo.name,
            }
            if(l_Entity:Is("SpatialEntity")) then
                s_GameEntity.transform = ToLocal(s_Entity.transform, p_Transform)
                s_GameEntity.aabb = {
                    min = tostring(s_Entity.aabb.min),
                    max = tostring(s_Entity.aabb.max),
                    transform = ToLocal(s_Entity.aabbTransform, p_Transform)
                }
            end
            self.m_Entities[l_Entity.instanceId] = s_GameEntity
            table.insert(s_EntityIds, l_Entity.instanceId)
        end
    end


    local s_Bluepint = Blueprint(p_Blueprint)
    local s_GameObject = GameObject{
        guid = s_TempGuid,
        name = s_Blueprint.name,
        typeName = p_Blueprint.typeInfo.name,
        parentData = nil,
        transform = p_Transform,
        variation = p_Variation,
        isDeleted = false,
        isEnabled = true,
        entityIds = s_EntityIds,
        children = {}
    }

    s_GameObject.blueprintCtrRef = CtrRef{
        typeName = s_Bluepint.typeInfo.name,
        name = s_Bluepint.name,
        partitionGuid = s_BlueprintPartitionGuid,
        instanceGuid = s_Blueprint.instanceGuid
    }

    if (self.m_UnresolvedGameObjects[s_BlueprintInstanceGuid]) then

    end


    table.insert(self.m_UnresolvedGameObjects[s_ParentPrimaryInstance], s_GameObject)




end

return GameObjectManager