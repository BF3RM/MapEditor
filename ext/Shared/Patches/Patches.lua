class 'Patches'
require "__shared/Patches/CommonRosePatcher"
require "__shared/Patches/LevelPatcher"
require "__shared/Patches/SequencePatcher"
require "__shared/Patches/HealthStatePatcher"

local m_Logger = Logger("Patches", true)

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

		if(l_Instance.typeInfo == LevelData.typeInfo) then
			LevelPatcher:PatchLevelData(l_Instance)
		end
		if(l_Instance.typeInfo == LevelDescriptionAsset.typeInfo) then
			LevelPatcher:PatchLevelDescription(l_Instance)
		end
		if(l_Instance.typeInfo == SequenceEntityData.typeInfo) then
			SequencePatcher:PatchSequence(l_Instance)
		end
		if(l_Instance.typeInfo == HealthStateData.typeInfo) then
			HealthStatePatcher:PatchHealthStateData(l_Instance)
		end
		--[[
		if(l_Instance.typeInfo.name == "DynamicModelEntityData") then
			local s_Instance = DynamicModelEntityData(l_Instance)
			local s_StaticModel = StaticModelEntityData(s_Instance.instanceGuid)
			s_StaticModel.indexInBlueprint = s_Instance.indexInBlueprint
			s_StaticModel.transform = s_Instance.transform
			s_StaticModel.enabled = true
			s_StaticModel.visible = true
			if(s_Instance.mesh.isLazyLoaded) then
				s_Instance.mesh:RegisterLoadHandlerOnce(function(ctr)
					s_StaticModel.mesh = _G[ctr.typeInfo.name](ctr)
				end)
			else
				s_StaticModel.mesh = s_Instance.mesh
			end
			for k,v in pairs(s_Instance.components) do
				print(k)
				s_StaticModel.components:add(v)
			end
			s_StaticModel.runtimeComponentCount = s_Instance.runtimeComponentCount
			s_StaticModel.physicsData = s_Instance.physicsData

			p_Partition:ReplaceInstance(l_Instance, s_StaticModel, true)
			if(p_Partition.primaryInstance.typeInfo.name == "ObjectBlueprint") then
				local s_PrimaryInstance = ObjectBlueprint(p_Partition.primaryInstance)
				s_PrimaryInstance:MakeWritable()
				s_PrimaryInstance.object = s_StaticModel
			else
				print(s_PrimaryInstance.typeInfo.name)
			end
		end
		-]]
		::continue::
	end
end
return Patches()
