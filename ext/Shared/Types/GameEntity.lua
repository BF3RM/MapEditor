class 'GameEntity'

local m_Logger = Logger("GameEntity", true)

function GameEntity:__init(arg)
    self.entity = arg.entity
    self.indexInBlueprint = arg.indexInBlueprint
    self.instanceId = arg.instanceId
    self.typeName = arg.typeName
    self.isSpatial = arg.isSpatial or false
    self.transform = arg.transform
    self.aabb = arg.aabb
end

function GameEntity:GetGameEntityTransferData()
    local s_GameEntityTransferData = {
        indexInBlueprint = self.indexInBlueprint,
        instanceId = self.instanceId,
        typeName = self.typeName,
        isSpatial = self.isSpatial,
        transform = self.transform,
        aabb = self.aabb,
    }

    return s_GameEntityTransferData
end

return GameEntity