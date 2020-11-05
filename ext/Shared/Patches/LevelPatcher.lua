class 'LevelPatcher'
local m_Logger = Logger("LevelPatcher", true)

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

	local cat = LevelDescriptionInclusionCategory()
	cat.category = "GameMode"
	for k,v in pairs(GameModes) do
		cat.mode:add(v.GameModeName)
	end
	s_Instance.categories:add(cat)
	s_Instance.startPoints:clear()
end

return LevelPatcher()
