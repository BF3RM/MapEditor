---@class GameEntityTransferData
GameEntityTransferData = class 'GameEntityTransferData'

local m_Logger = Logger("GameEntityTransferData", false)

function GameEntityTransferData:__init(arg)
	self.indexInBlueprint = arg.indexInBlueprint
	self.instanceId = arg.instanceId
	self.typeName = arg.typeName
	self.isSpatial = arg.isSpatial or false
	self.transform = arg.transform
	self.aabb = arg.aabb
end

return GameEntityTransferData
