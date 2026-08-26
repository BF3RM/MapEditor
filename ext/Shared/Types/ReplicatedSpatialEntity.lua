---@class ReplicatedSpatialEntity
--- Carries a spatial entity that exists on the SERVER but never reaches the client's entity hooks.
---
--- A networked vehicle is built by the server and replicated to the client. The client's own
--- CreateEntitiesFromBlueprint returns an EMPTY entity bus for it (measured: server 3 entities,
--- client 0), and the replicated entities never surface through OnEntityCreate either. So the
--- client has no AABB for a vehicle and cannot draw its selection outline: clicking a vehicle
--- highlighted nothing, while scenery that had been mis-filed onto a neighbouring object made the
--- WRONG vehicle light up. A lone vehicle, with nothing to confuse it with, had zero entities on
--- the client even after 60 seconds.
---
--- The server does hold the boxes (spatial entities with a usable aabb), so it sends them over and
--- this holds them on the client. Every lifecycle call is inert -- the engine entity lives in the
--- other realm and must not be touched from here.
ReplicatedSpatialEntity = class 'ReplicatedSpatialEntity'

-- The payload arrives as plain JSON tables. The native viewport hands these straight to
-- DebugRenderer:DrawOBB, which needs real Vec3/LinearTransform, so rebuild them here rather than
-- at every draw call.
local function ToVec3(p_T)
	if p_T == nil then
		return Vec3(0, 0, 0)
	end

	return Vec3(p_T.x or 0, p_T.y or 0, p_T.z or 0)
end

local function ToLinearTransform(p_T)
	if p_T == nil then
		return LinearTransform()
	end

	local s_Transform = LinearTransform()

	s_Transform.left = ToVec3(p_T.left)
	s_Transform.up = ToVec3(p_T.up)
	s_Transform.forward = ToVec3(p_T.forward)
	s_Transform.trans = ToVec3(p_T.trans)

	return s_Transform
end

local function ToAabb(p_T)
	if p_T == nil then
		return nil
	end

	return {
		min = ToVec3(p_T.min),
		max = ToVec3(p_T.max),
		transform = ToLinearTransform(p_T.transform),
	}
end


---@param p_Arg table { instanceId, typeName, transform, aabb }
function ReplicatedSpatialEntity:__init(p_Arg)
	self.instanceId = p_Arg.instanceId
	self.typeName = p_Arg.typeName or 'ReplicatedSpatial'
	self.indexInBlueprint = p_Arg.indexInBlueprint or 0
	self.isSpatial = true
	self.transform = ToLinearTransform(p_Arg.transform)
	self.aabb = ToAabb(p_Arg.aabb)
	self.isEditorSpawned = false -- never destroy: the entity is not ours, and not even in this realm
	self.isReplicated = true
	self.entity = nil
end

--- Re-point the box after the server re-measures it. A networked vehicle moves under physics and
--- this realm has no handle to follow, so the server re-sends and this keeps the box on the hull.
function ReplicatedSpatialEntity:Update(p_Transform, p_Aabb)
	self.transform = ToLinearTransform(p_Transform)

	if p_Aabb ~= nil then
		self.aabb = ToAabb(p_Aabb)
	end
end

--- Same shape GameEntity produces, so the WebUI treats it as an ordinary spatial entity.
function ReplicatedSpatialEntity:GetGameEntityTransferData()
	return {
		indexInBlueprint = self.indexInBlueprint,
		instanceId = self.instanceId,
		typeName = self.typeName,
		isSpatial = true,
		transform = self.transform,
		aabb = self.aabb,
	}
end

-- Inert for the same reason PlaceholderEntity's are: GameObject loops over gameEntities and calls
-- these unconditionally, and there is no local engine entity behind this one.
function ReplicatedSpatialEntity:Enable() end

function ReplicatedSpatialEntity:Disable() end

function ReplicatedSpatialEntity:Destroy() end

function ReplicatedSpatialEntity:SetTransform(p_LinearTransform, p_UpdateCollision, p_IsEnabled)
	self.transform = LinearTransform(p_LinearTransform)
	return true
end

return ReplicatedSpatialEntity
