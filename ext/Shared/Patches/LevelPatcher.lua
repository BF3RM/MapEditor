---@class LevelPatcher
LevelPatcher = class 'LevelPatcher'

local m_Logger = Logger("LevelPatcher", false)

function LevelPatcher:__init()
	m_Logger:Write("Initializing Patches")
end

function LevelPatcher:PatchLevelData(p_LevelData)
	local s_Instance = LevelData(p_LevelData)
	s_Instance:MakeWritable()
	s_Instance.levelDescription.isCoop = false
	s_Instance.levelDescription.isMultiplayer = true
	s_Instance.levelDescription.isMenu = false
end

function LevelPatcher:PatchLevelDescription(p_LevelDescription)
	local s_Instance = LevelDescriptionAsset(p_LevelDescription)
	s_Instance:MakeWritable()
	s_Instance.description.isCoop = false
	s_Instance.description.isMultiplayer = true
	s_Instance.description.isMenu = false

	local s_Category = LevelDescriptionInclusionCategory()
	s_Category.category = "GameMode"

	for _, l_GameMode in pairs(GameModes) do
		s_Category.mode:add(l_GameMode.GameModeName)
	end

	s_Instance.categories:add(s_Category)
	s_Instance.startPoints:clear()
end

return LevelPatcher()
