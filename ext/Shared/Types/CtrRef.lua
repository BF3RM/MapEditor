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
        partitionGuid = tostring(self.partitionGuid),
        instanceGuid = tostring(self.instanceGuid)
    }
end

function CtrRef:Get()
	local s_Instance = ResourceManager:FindInstanceByGuid(Guid(self.partitionGuid), Guid(self.instanceGuid))
	-- TODO: More resolving for custom objects or whatever? Idk
	if(s_Instance) then
		s_Instance = _G[s_Instance.typeInfo.name](s_Instance)
		return s_Instance
	end
	return null
end

return CtrRef
