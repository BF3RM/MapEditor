---@class VegetationPatcher
VegetationPatcher = class 'VegetationPatcher'

local m_Logger = Logger("VegetationPatcher", false)

function VegetationPatcher:__init()
	m_Logger:Write("Initializing Vegetation Patches")
end

function VegetationPatcher:Patch(p_VegetationTree)
	local s_Instance = VegetationTreeEntityData(p_VegetationTree)
	local s_ReplacementData = StaticModelEntityData(p_VegetationTree.instanceGuid)

	local s_BoneCount = 0

	for _, l_Transform in pairs(s_Instance.basePoseTransforms) do
		-- s_ReplacementData.basePoseTransforms:add(l_Transform)
		s_BoneCount = s_BoneCount + 1
	end

	s_ReplacementData.transform = s_Instance.transform
	s_ReplacementData.enabled = true
	s_ReplacementData.boneCount = s_BoneCount
	s_ReplacementData.visible = true

	if s_Instance.mesh.isLazyLoaded then
		s_Instance.mesh:RegisterLoadHandlerOnce(function(p_Mesh)
			s_ReplacementData.mesh = MeshAsset(p_Mesh)
		end)
	else
		s_ReplacementData.mesh = MeshAsset(s_Instance.mesh)
	end

	s_Instance:ReplaceReferences(s_ReplacementData)
end

return VegetationPatcher()
