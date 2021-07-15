class 'GameObjectParentData'

local m_Logger = Logger("GameObjectParentData", true)

function GameObjectParentData:__init(arg)
    self.guid = arg.guid
    self.typeName = arg.typeName -- TODO: do we need this?
    self.primaryInstanceGuid = arg.primaryInstanceGuid
    self.partitionGuid = arg.partitionGuid
end

function GameObjectParentData.static:GetRootParentData()
    return {
        guid = EMPTY_GUID,
        typeName = 'custom_root',
        primaryInstanceGuid = EMPTY_GUID,
        partitionGuid = EMPTY_GUID
    }
end

function GameObjectParentData:GetTable()
    return {
        guid = tostring(self.guid),
        typeName = self.typeName,
        primaryInstanceGuid = tostring(self.primaryInstanceGuid),
        partitionGuid = tostring(self.partitionGuid)
    }
end

return GameObjectParentData
