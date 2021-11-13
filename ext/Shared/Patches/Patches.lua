class 'Patches'

require "__shared/Patches/CommonRosePatcher"
require "__shared/Patches/LevelPatcher"
require "__shared/Patches/SequencePatcher"
require "__shared/Patches/HealthStatePatcher"

VegetationPatcher = require "__shared/Patches/VegetationPatcher"
DynamicModelPatcher = require "__shared/Patches/DynamicModelPatcher"
MeshProxyPatcher = require "__shared/Patches/MeshProxyPatcher"

local m_Logger = Logger("Patches", false)

function Patches:__init()
	m_Logger:Write("Initializing Patches")
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
end

function Patches:OnPartitionLoaded(p_Partition)
	if p_Partition == nil then
		return
	end

	local s_Instances = p_Partition.instances

	for _, l_Instance in ipairs(s_Instances) do
		if l_Instance == nil then
			m_Logger:Write('Instance is null?')
			goto continue
		end

		if l_Instance:Is('LevelData') then
			LevelPatcher:PatchLevelData(l_Instance)
		elseif l_Instance:Is('LevelDescriptionAsset') then
			LevelPatcher:PatchLevelDescription(l_Instance)
		elseif l_Instance:Is('SequenceEntityData') then
			SequencePatcher:PatchSequence(l_Instance)
		elseif l_Instance:Is('HealthStateData') then
			HealthStatePatcher:PatchHealthStateData(l_Instance)
		elseif l_Instance:Is('MeshProxyEntityData') then
			MeshProxyPatcher:Patch(l_Instance)
		elseif l_Instance:Is('DynamicModelEntityData') then
			DynamicModelPatcher:Patch(l_Instance)
		elseif l_Instance:Is('VegetationTreeEntityData') then
			VegetationPatcher:Patch(l_Instance)
		end

		::continue::
	end
end

return Patches()
