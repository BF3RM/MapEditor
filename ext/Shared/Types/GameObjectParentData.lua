class 'GameObjectParentData'

local m_Logger = Logger("GameObjectParentData", true)

function GameObjectParentData:__init(arg)
    self.guid = arg.guid
    self.typeName = arg.typeName
    self.primaryInstanceGuid = arg.primaryInstanceGuid
    self.partitionGuid = arg.partitionGuid
end

return GameObjectParentData