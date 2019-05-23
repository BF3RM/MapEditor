class 'CtrRef'

local m_Logger = Logger("CtrRef", true)

function CtrRef:__init(arg)
    self.typeName = arg.typeName
    self.name = arg.name
    self.partitionGuid = arg.partitionGuid
    self.instanceGuid = arg.instanceGuid
end

function CtrRef:GetTable()
    return {
        typeName = self.typeName,
        name = self.name,
        partitionGuid = self.partitionGuid,
        instanceGuid = self.instanceGuid
    }
end

return CtrRef