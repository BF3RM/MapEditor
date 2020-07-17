class 'GameObjectParentData'

local m_Logger = Logger("GameObjectParentData", true)

function GameObjectParentData:__init(arg)
    self.guid = arg.guid
    self.typeName = arg.typeName -- TODO: do we need this?
    self.primaryInstanceGuid = arg.primaryInstanceGuid
    self.partitionGuid = arg.partitionGuid
end

function GameObjectParentData:GetTable()
    return {
        guid = self.guid,
        typeName = self.typeName,
        primaryInstanceGuid = self.primaryInstanceGuid,
        partitionGuid = self.partitionGuid
    }
end

return GameObjectParentData
