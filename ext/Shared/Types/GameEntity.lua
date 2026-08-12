---@class GameEntity
GameEntity = class 'GameEntity'

local m_Logger = Logger("GameEntity", false)

function GameEntity:__init(arg)
	---@type Entity
	self.entity = arg.entity
	self.indexInBlueprint = arg.indexInBlueprint
	self.instanceId = arg.instanceId
	self.typeName = arg.typeName
	self.isSpatial = arg.isSpatial or false
	self.transform = arg.transform -- local transform
	self.aabb = arg.aabb
	self.initiatorRef = arg.initiatorRef
	-- True only for entities the EDITOR created via CreateEntitiesFromBlueprint. Entities that
	-- came with the level must never be Destroy()ed — that crashes the game — so this flag is what
	-- makes it safe to actually free the ones we own (see GameObject:Destroy).
	self.isEditorSpawned = arg.isEditorSpawned or false

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
	-- Read self.entity only after establishing it exists: the log line below used to dereference
	-- it first, so a nil entity threw before the guard on the next line could do anything.
	if self.entity ~= nil then
		m_Logger:Write("Destroying entity: " .. tostring(self.entity.typeInfo.name))

		-- Not every entity type exposes Destroy. Calling it blind throws "attempt to call a nil
		-- value (method 'Destroy')", which GameObject:Destroy catches and downgrades to "disabling
		-- instead" — so the object survived, but the level-destroy path logged an error per entity
		-- on every project load. Disabling is the correct outcome for these; reach it deliberately
		-- instead of via an exception.
		if self.entity.Destroy ~= nil then
			self.entity:Destroy()
		elseif self.entity.FireEvent ~= nil then
			self.entity:FireEvent("Disable")
		end
	end

	GameObjectManager.m_PendingEntities[self.instanceId] = nil
	-- Also forget it as PROCESSED. That table is otherwise append-only, and the create hook skips
	-- any entity whose instanceId it has already seen — so once entities are genuinely destroyed
	-- (rather than just disabled) a recycled instanceId would make the hook silently drop the new
	-- entity, leaving an object that renders but can't be tracked or selected.
	GameObjectManager.m_ProcessedEntities[self.instanceId] = nil
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
