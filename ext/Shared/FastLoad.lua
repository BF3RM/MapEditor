---@class FastLoad
FastLoad = class 'FastLoad'

---@type number
local m_InitialSimFPS = nil

local function _SetSimFPS()
	---@type DataContainer|GameTimeSettings|nil
	local s_GameTimeSettings = ResourceManager:GetSettings('GameTimeSettings')

	if s_GameTimeSettings ~= nil then
		s_GameTimeSettings = GameTimeSettings(s_GameTimeSettings)

		if s_GameTimeSettings.maxSimFps > 200.0 then
			return
		end

		m_InitialSimFPS = s_GameTimeSettings.maxSimFps
		s_GameTimeSettings.maxSimFps = 10000.0
	end
end

local function _ResetSimFPS()
	if m_InitialSimFPS == nil then
		return
	end

	---@type DataContainer|GameTimeSettings|nil
	local s_GameTimeSettings = ResourceManager:GetSettings('GameTimeSettings')

	if s_GameTimeSettings ~= nil then
		s_GameTimeSettings = GameTimeSettings(s_GameTimeSettings)
		s_GameTimeSettings.maxSimFps = m_InitialSimFPS
		m_InitialSimFPS = nil
	end
end

---@param p_LevelName string
---@param p_GameMode string
---@param p_IsDedicatedServer boolean
function FastLoad:OnLoadResources(p_LevelName, p_GameMode, p_IsDedicatedServer)
	_SetSimFPS()
end

---@param p_LevelName string
---@param p_GameMode string
function FastLoad:OnLevelLoaded(p_LevelName, p_GameMode)
	_ResetSimFPS()
end

function FastLoad:OnExtensionUnloading()
	_ResetSimFPS()
end

FastLoad = FastLoad()

return FastLoad
