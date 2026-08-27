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

-- `self.entity` staying non-nil does NOT mean the entity is still usable: the engine can destroy
-- the underlying EntityBusPeer while our Lua handle lives on, and firing an event at that handle
-- throws "tried accessing an invalid or destroyed EntityBusPeer". These run during every
-- refresh (Disable/Enable is the override re-read path) and during transforms, so one stale
-- handle in a group used to abort the whole operation mid-way -- leaving the object half
-- refreshed. The server log was carrying 24+ of these per session.
--
-- pcall so a dead handle skips that entity instead of killing the operation, and drop the handle
-- once it is known dead so we stop retrying it every refresh.
local function _fire(p_GameEntity, p_Events)
	if p_GameEntity.entity == nil then
		return
	end

	for _, l_Event in ipairs(p_Events) do
		local s_Ok = pcall(function() p_GameEntity.entity:FireEvent(l_Event) end)

		if not s_Ok then
			-- Destroyed out from under us: forget it rather than throwing on every later refresh.
			p_GameEntity.entity = nil
			return
		end
	end
end

function GameEntity:Disable()
	_fire(self, { "Disable", "Stop" })
end

function GameEntity:Enable()
	_fire(self, { "Enable", "Start" })
end

function GameEntity:Destroy()
	-- Read self.entity only after establishing it exists: the log line below used to dereference
	-- it first, so a nil entity threw before the guard on the next line could do anything.
	if self.entity ~= nil then
		-- Reading typeInfo alone throws if the EntityBusPeer is already destroyed -- the same
		-- dead-handle case Enable/Disable guard against. Four of these fired during a single
		-- re-instantiate ("entity Destroy failed ... invalid or destroyed EntityBusPeer"), each
		-- aborting one entity's teardown partway.
		local s_TypeOk, s_TypeName = pcall(function() return self.entity.typeInfo.name end)

		if not s_TypeOk then
			self.entity = nil
			GameObjectManager.m_PendingEntities[self.instanceId] = nil
			GameObjectManager.m_ProcessedEntities[self.instanceId] = nil
			return
		end

		m_Logger:Write("Destroying entity: " .. tostring(s_TypeName))

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
			-- Take the vehicle out of the physics step before writing its transform.
			--
			-- A live vehicle is simulated every tick, so a bare write is overwritten again before
			-- anything renders -- which is why dragging a parked vanilla vehicle moved the gizmo
			-- and the outline while the vehicle itself stayed put. Disabling first is the same move
			-- the delete path relies on to exile a hull it is not allowed to free, and that one
			-- demonstrably moves a vehicle.
			--
			-- Only cycle it if it was actually enabled: the exile path calls in with p_Enabled
			-- false precisely because the entity is already disabled and must stay that way.
			if p_Enabled then
				self:Disable()
			end

			s_Entity.transform = LinearTransform(p_LinearTransform)

			if p_Enabled then
				self:Enable()
			end
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
