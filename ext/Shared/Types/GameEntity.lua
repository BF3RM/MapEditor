class 'GameEntity'

local m_Logger = Logger("GameEntity", true)

function GameEntity:__init(arg)
    self.entity = arg.entity
    self.indexInBlueprint = arg.indexInBlueprint;
    self.instanceId = arg.instanceId;
    self.typeName = arg.typeName;
    self.transform = arg.transform;
    self.aabb = arg.aabb;
end

return GameEntity