---@class GameObjectSaveData
GameObjectSaveData = class 'GameObjectSaveData'

local m_Logger = Logger("GameObjectSaveData", false)

function GameObjectSaveData:__init(p_GameObject)
	self.guid = p_GameObject.guid
	self.name = p_GameObject.name
	self.blueprintCtrRef = p_GameObject.blueprintCtrRef
	self.transform = p_GameObject.transform
	self.timeStamp = p_GameObject.timeStamp
	self.origin = p_GameObject.origin
	self.original = p_GameObject.original
	self.localTransform = p_GameObject.localTransform

	-- Only save if they aren't the default value
	if p_GameObject.isDeleted then
		self.isDeleted = true
	end

	if p_GameObject.parentData and p_GameObject.parentData.typeName ~= "custom_root" then
		self.parentData = p_GameObject.parentData
	end

	if p_GameObject.variation ~= 0 then
		self.variation = p_GameObject.variation
	end

	if not p_GameObject.isEnabled then
		self.isEnabled = false
	end

	if p_GameObject.originalRef and p_GameObject.originalRef.instanceGuid and p_GameObject.originalRef.partitionGuid then
		self.originalRef = p_GameObject.originalRef
	end

	if p_GameObject.overrides and next(p_GameObject.overrides) then
		self.overrides = p_GameObject.overrides
	end
end

function GameObjectSaveData:GetAsTable()
	local s_Out = {
		guid = tostring(self.guid),
		name = self.name,
		blueprintCtrRef = self.blueprintCtrRef:GetTable(),
		transform = self.transform,
		variation = self.variation,
		localTransform = self.localTransform,
		isDeleted = self.isDeleted,
		isEnabled = self.isEnabled,
		origin = self.origin,
		timeStamp = self.timeStamp
	}

	if self.parentData then
		s_Out.parentData = self.parentData:GetTable()
	end

	if self.originalRef then
		s_Out.originalRef = self.originalRef:GetTable()
	end

	if self.overrides then
		s_Out.overrides = self.overrides
	end

	return s_Out
end

return GameObjectSaveData
