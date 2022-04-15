---@class CtrRef
CtrRef = class 'CtrRef'

local m_Logger = Logger("CtrRef", false)

function CtrRef:__init(arg)
	---@type string
	self.typeName = arg.typeName
	---@type string
	self.name = arg.name
	---@type Guid
	self.partitionGuid = arg.partitionGuid
	---@type Guid
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
	if s_Instance then
		s_Instance = _G[s_Instance.typeInfo.name](s_Instance)
		return s_Instance
	end

	return nil
end

return CtrRef
