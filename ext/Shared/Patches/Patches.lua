class 'Patches'

require "__shared/Patches/CommonRosePatcher"

local m_LevelPatcher = require "__shared/Patches/LevelPatcher"
local m_SequencePatcher = require "__shared/Patches/SequencePatcher"
local m_HealthStatePatcher = require "__shared/Patches/HealthStatePatcher"
local m_PreRoundPatcher = require "__shared/Patches/PreRoundPatcher"
local m_VegetationPatcher = require "__shared/Patches/VegetationPatcher"
local m_DynamicModelPatcher = require "__shared/Patches/DynamicModelPatcher"

local m_Logger = Logger("Patches", false)

function Patches:__init()
	m_Logger:Write("Initializing Patches")
	Hooks:Install('EntityFactory:Create', 999, self, self.OnEntityCreate)
end

function Patches:OnEntityCreate(p_Hook, p_Data, p_Transform)
	if p_Data.typeInfo == VegetationTreeEntityData.typeInfo then
		p_Hook:Pass(m_VegetationPatcher:PatchVegetationTree(p_Data), p_Transform)
	end
end

function Patches:OnLevelLoaded(p_MapName, p_GameModeName)
	m_PreRoundPatcher:PatchPreRound()
end

function Patches:OnLevelDestroy()
	m_VegetationPatcher:OnLevelDestroy()
	m_DynamicModelPatcher:OnLevelDestroy()
end

function Patches:OnPartitionLoaded(p_Partition)
	if p_Partition == nil then
		return
	end

	local s_Instances = p_Partition.instances

	for _, l_Instance in pairs(s_Instances) do
		if l_Instance:Is('LevelData') then
			m_LevelPatcher:PatchLevelData(l_Instance)
		elseif l_Instance:Is('LevelDescriptionAsset') then
			m_LevelPatcher:PatchLevelDescription(l_Instance)
		elseif l_Instance:Is('SequenceEntityData') then
			m_SequencePatcher:PatchSequence(l_Instance)
		elseif l_Instance:Is('HealthStateData') then
			m_HealthStatePatcher:PatchHealthStateData(l_Instance)
		elseif l_Instance:Is('DynamicModelEntityData') then
			m_DynamicModelPatcher:Patch(l_Instance)
		elseif l_Instance:Is('PreRoundEntityData') then
			m_PreRoundPatcher:PatchPreRoundEntityData(l_Instance)
		end
	end
end

return Patches()
