class 'ParentData'

local m_Logger = Logger("ParentData", true)

function ParentData:__init(arg)
    self.guid = arg.guid
    self.typeName = arg.typeName
    self.primaryInstanceGuid = arg.primaryInstanceGuid
    self.partitionGuid = arg.partitionGuid
end

function ParentData:GetTable()
    return {
        guid = self.guid,
        typeName = self.typeName,
        primaryInstanceGuid = self.primaryInstanceGuid,
        partitionGuid = self.partitionGuid
    }
end

return CtrRef