-- ext/Client/HudToggle.lua
-- Editor-only, per-client vanilla HUD toggle via UIGraph FireEvent.
-- Ported from Terrain_Tools (RE'd from VU-BattleRoyale / realitymod).
--
-- The in-game HUD lives in the UIGraph owned by ClientUIGraphEntity 133D3825-...
--   Hide: fire "ExitUIGraph" on it  -> HUD (minimap/tickets/ammo/etc) disappears.
--   Show: fire "EnterUIGraph" on it -> HUD comes back.
-- Acts ONLY on the HUD graph (not the game-menu graph) so freecam/input keep working.

HudToggle = class("HudToggle")

local HUD_GRAPH_GUID = Guid("133D3825-5F17-4210-A4DB-3694FDBAD26D") -- in-game HUD UIGraph

-- Fire an event on the first ClientUIGraphEntity matching the given instance guid.
local function FireOnUIGraph(p_Guid, p_Event)
	local s_It = EntityManager:GetIterator("ClientUIGraphEntity")
	local s_Entity = s_It:Next()

	while s_Entity do
		if s_Entity.data ~= nil and s_Entity.data.instanceGuid == p_Guid then
			s_Entity = Entity(s_Entity)
			s_Entity:FireEvent(p_Event)
			return true
		end

		s_Entity = s_It:Next()
	end

	return false
end

function HudToggle:__init()
	self.m_Hidden = false
end

function HudToggle:Hide()
	if self.m_Hidden then
		return
	end
	self.m_Hidden = true
	FireOnUIGraph(HUD_GRAPH_GUID, "ExitUIGraph")
end

function HudToggle:Show()
	if not self.m_Hidden then
		return
	end
	self.m_Hidden = false
	FireOnUIGraph(HUD_GRAPH_GUID, "EnterUIGraph")
end


-- The DEPLOY screen is a DIFFERENT ClientUIGraphEntity from the HUD graph above, so Hide() leaves
-- its blue tint and blur over the render whenever the editor is opened without a live soldier
-- (ME_CONFIG.DEV_FREECAM_WITHOUT_SOLDIER). Every in-game screenshot this repo has ever taken from
-- the deploy screen carries that tint. HideAll fires ExitUIGraph on EVERY UIGraph entity, which is
-- the only handle there is on the deploy graph -- measured 2026-09-06: the viewport comes back
-- clean. It is deliberately NOT called on the normal (deployed) enter path, because the comment at
-- the top of this file is right that touching the game-menu graph can cost freecam input.
function HudToggle:HideAll()
	local s_It = EntityManager:GetIterator("ClientUIGraphEntity")
	local s_Entity = s_It:Next()
	local s_Count = 0

	while s_Entity do
		local s_Guid = s_Entity.data ~= nil and tostring(s_Entity.data.instanceGuid) or "?"
		local s_Ok = pcall(function() Entity(s_Entity):FireEvent("ExitUIGraph") end)
		s_Count = s_Count + 1
		print('[MapEditor] HideAll UIGraph ' .. s_Guid .. ' ok=' .. tostring(s_Ok))
		s_Entity = s_It:Next()
	end

	self.m_Hidden = true
	print('[MapEditor] HideAll fired on ' .. tostring(s_Count) .. ' UIGraph entity(ies)')
	return s_Count
end

return HudToggle()
