class 'GameEntity'

local m_Logger = Logger("GameEntity", true)

function GameEntity:__init(arg)
    self.entity = arg.entity
    self.indexInBlueprint = arg.indexInBlueprint
    self.instanceId = arg.instanceId
    self.typeName = arg.typeName
    self.isSpatial = arg.isSpatial or false
    self.transform = arg.transform -- local transform
    self.aabb = arg.aabb
end

function GameEntity:GetGameEntityTransferData()
    local s_GameEntityTransferData = {
        indexInBlueprint = self.indexInBlueprint,
        instanceId = self.instanceId,
        typeName = self.typeName,
        isSpatial = self.isSpatial,
        transform = self.transform,
    }
    if(self.aabb ~= nil) then
        s_GameEntityTransferData.aabb = self.aabb:GetTable()
    end
    return s_GameEntityTransferData
end

function GameEntity:Disable()
    self.entity:FireEvent("Disable")
    self.entity:FireEvent("Stop")
end

function GameEntity:Enable()
    self.entity:FireEvent("Enable")
    self.entity:FireEvent("Start")
end

function GameEntity:Destroy()
    m_Logger:Write("Destroying entity: " .. self.entity.typeInfo.name)
    self.entity:Destroy()
    GameObjectManager.m_Entities[self.instanceId] = nil
end

function GameEntity:SetTransform(p_LinearTransform, p_UpdateCollision, p_Enabled)
    -- TODO: update self.transform

    local s_Entity = self.entity

    if(s_Entity == nil) then
        m_Logger:Error("Entity is nil?")
        return false
    end

    if (not s_Entity:Is("SpatialEntity"))then
        m_Logger:Warning("Entity is not spatial")
        return true
    end


    s_Entity = SpatialEntity(s_Entity)

    if s_Entity ~= nil then
        if(s_Entity.typeInfo.name == "ServerVehicleEntity") then
            s_Entity.transform = LinearTransform(p_LinearTransform)
        else
            s_Entity.transform = ToWorld(self.transform, LinearTransform(p_LinearTransform))

            if(p_UpdateCollision and p_Enabled) then
                s_Entity:FireEvent("Disable")
                s_Entity:FireEvent("Enable")
                --self:UpdateOffsets(p_Guid, s_Entity.instanceId, LinearTransform(p_LinearTransform))
            end
        end
    else
        m_Logger:Write("Entity is nil after casting it to SpatialEntity??")
    end

    return true
end


return GameEntity
