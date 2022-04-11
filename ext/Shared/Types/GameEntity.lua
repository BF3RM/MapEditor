---@class GameEntity
GameEntity = class 'GameEntity'

local m_Logger = Logger("GameEntity", false)

function GameEntity:__init(arg)
	self.entity = arg.entity
	self.indexInBlueprint = arg.indexInBlueprint
	self.instanceId = arg.instanceId
	self.typeName = arg.typeName
	self.isSpatial = arg.isSpatial or false
	self.transform = arg.transform -- local transform
	self.aabb = arg.aabb
	self.initiatorRef = arg.initiatorRef

	self.entity:RegisterDestroyCallback(self, self.OnDestroyed)
end

function GameEntity:__gc()
	self.entity = nil
end

function GameEntity:OnDestroyed()
	self.entity = nil
end
function GameEntity:GetGameEntityTransferData()
	local s_GameEntityTransferData = {
		indexInBlueprint = self.indexInBlueprint,
		instanceId = self.instanceId,
		typeName = self.typeName,
		isSpatial = self.isSpatial,
		transform = self.transform
	}

	if self.initiatorRef ~= nil then
		s_GameEntityTransferData.initiatorRef = self.initiatorRef:GetTable()
	end

	if self.aabb ~= nil then
		s_GameEntityTransferData.aabb = self.aabb:GetTable()
	end

	return s_GameEntityTransferData
end

function GameEntity:Disable()
	if self.entity then
		self.entity:FireEvent("Disable")
		self.entity:FireEvent("Stop")
	end
end

function GameEntity:Enable()
	if self.entity then
		self.entity:FireEvent("Enable")
		self.entity:FireEvent("Start")
	end
end

function GameEntity:Destroy()
	m_Logger:Write("Destroying entity: " .. self.entity.typeInfo.name)

	if self.entity then
		self.entity:Destroy()
	end

	GameObjectManager.m_PendingEntities[self.instanceId] = nil
end

function GameEntity:SetTransform(p_LinearTransform, p_UpdateCollision, p_Enabled)
	-- TODO: update self.transform
	local s_Entity = self.entity

	if s_Entity == nil then
		return true
	end

	if not self.isSpatial then
		return true
	end

	s_Entity = SpatialEntity(s_Entity)

	if s_Entity ~= nil then
		if s_Entity.typeInfo.name == "ServerVehicleEntity" then
			s_Entity.transform = LinearTransform(p_LinearTransform)
		else
			s_Entity.transform = ToWorld(self.transform, LinearTransform(p_LinearTransform))
			if p_UpdateCollision and p_Enabled then
				s_Entity:FireEvent("Disable")
				s_Entity:FireEvent("Stop")
				s_Entity:FireEvent("Enable")
				s_Entity:FireEvent("Start")

				--self:UpdateOffsets(p_Guid, s_Entity.instanceId, LinearTransform(p_LinearTransform))
			end
		end
	else
		m_Logger:Write("Entity is nil after casting it to SpatialEntity??")
	end

	return true
end

return GameEntity
