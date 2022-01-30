---@class GameObjectParentData
GameObjectParentData = class 'GameObjectParentData'

local m_Logger = Logger("GameObjectParentData", false)

function GameObjectParentData:__init(p_Arg)
	self.guid = p_Arg.guid
	self.typeName = p_Arg.typeName -- TODO: do we need this?
	self.primaryInstanceGuid = p_Arg.primaryInstanceGuid
	self.partitionGuid = p_Arg.partitionGuid
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
