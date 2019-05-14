class 'GameEntityData'

local m_Logger = Logger("GameEntityData", true)

function GameEntityData:__init(arg)
    self.indexInBlueprint = arg.indexInBlueprint;
    self.instanceId = arg.instanceId;
    self.typeName = arg.typeName;
    self.transform = arg.transform;
    self.aabb = arg.aabb;
end

return GameEntityData