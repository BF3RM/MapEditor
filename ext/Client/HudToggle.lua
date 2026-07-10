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

return HudToggle()
