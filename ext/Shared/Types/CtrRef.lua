class 'CtrRef'

local m_Logger = Logger("CtrRef", true)

function CtrRef:__init(arg)
    self.typeName = arg.typeName;
    self.name = arg.name;
    self.partitionGuid = arg.partitionGuid;
    self.instanceGuid = arg.instanceGuid;
end

return CtrRef