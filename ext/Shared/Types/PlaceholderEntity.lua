---@class PlaceholderEntity
--- Stand-in for a GameEntity on an object the editor deliberately did NOT instantiate.
---
--- Some gameplay prefabs (capture points and friends) fault natively inside
--- CreateEntitiesFromBlueprint — the client dies with no Lua error, no JS error and no crash dump
--- (GH #393). Those objects are still placed and saved so the level loader can emit the real
--- prefab at generation time (GH #394), but they have no engine entities behind them.
---
--- Without something in `gameEntities` such an object is invisible AND unpickable in the viewport:
--- the WebUI builds its selectable AABB boxes from the entity transfer data. This provides a
--- synthetic spatial entity with a nominal bounding box so the object can be hovered, clicked and
--- box-selected like anything else, while every operation that would touch a real engine entity is
--- a no-op.
PlaceholderEntity = class 'PlaceholderEntity'

-- Nominal box for the marker, in metres. Roughly person-sized so it reads as "a thing is here"
-- without swamping the view: 1m across, 2m tall, centred on the object's origin at ground level.
local PLACEHOLDER_MIN = Vec3(-0.5, 0.0, -0.5)
local PLACEHOLDER_MAX = Vec3(0.5, 2.0, 0.5)

---@param p_Arg table { instanceId, typeName }
function PlaceholderEntity:__init(p_Arg)
	self.instanceId = p_Arg.instanceId
	self.typeName = p_Arg.typeName or 'Placeholder'
	self.indexInBlueprint = 0
	self.isSpatial = true
	self.transform = LinearTransform()
	self.isEditorSpawned = false -- never destroy: there is no engine entity to destroy
	self.isPlaceholder = true
	self.entity = nil
end

--- Same shape GameEntity produces, so the WebUI treats it as an ordinary spatial entity.
function PlaceholderEntity:GetGameEntityTransferData()
	return {
		indexInBlueprint = self.indexInBlueprint,
		instanceId = self.instanceId,
		typeName = self.typeName,
		isSpatial = true,
		transform = self.transform,
		aabb = {
			min = PLACEHOLDER_MIN,
			max = PLACEHOLDER_MAX,
			transform = LinearTransform(),
		},
	}
end

-- No engine entity behind this, so every lifecycle call is intentionally inert. These exist
-- because GameObject loops over gameEntities and calls them unconditionally.
function PlaceholderEntity:Enable() end

function PlaceholderEntity:Disable() end

function PlaceholderEntity:Destroy() end

function PlaceholderEntity:SetTransform(p_LinearTransform, p_UpdateCollision, p_IsEnabled)
	-- The GameObject's own transform is authoritative and is what gets saved; just track it so
	-- the transfer data stays consistent if it's re-sent.
	self.transform = LinearTransform(p_LinearTransform)
	return true
end

return PlaceholderEntity
