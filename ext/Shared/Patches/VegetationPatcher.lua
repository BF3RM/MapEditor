class 'VegetationPatcher'

local m_Logger = Logger("VegetationPatcher", false)

function VegetationPatcher:__init()
	m_Logger:Write("Initializing Vegetation Patches")
	self:RegisterVars()
end

function VegetationPatcher:RegisterVars()
	self.m_Replacements = {}
end

function VegetationPatcher:OnLevelDestroy()
	self.m_Replacements = {}
end

function VegetationPatcher:PatchVegetationTree(p_VegetationTree)
	local s_Instance = VegetationTreeEntityData(p_VegetationTree)
	local s_ReplacementData = self.m_Replacements[tostring(s_Instance.instanceGuid)]

	if s_ReplacementData then
		return s_ReplacementData
	else
		s_ReplacementData = StaticModelEntityData(p_VegetationTree.instanceGuid)
	end

	local s_BoneCount = 0

	for _,_ in pairs(s_Instance.basePoseTransforms) do
		--s_ReplacementData.basePoseTransforms:add(v)
		s_BoneCount = s_BoneCount + 1
	end

	s_ReplacementData.transform = s_Instance.transform
	s_ReplacementData.enabled = true
	s_ReplacementData.boneCount = s_BoneCount
	s_ReplacementData.visible = true

	self.m_Replacements[tostring(s_Instance.instanceGuid)] = s_ReplacementData
	if (s_Instance.mesh.isLazyLoaded) then
		s_Instance.mesh:RegisterLoadHandlerOnce(function(p_Mesh)
			s_ReplacementData.mesh = MeshAsset(p_Mesh)
		end)
	else
		s_ReplacementData.mesh = MeshAsset(s_Instance.mesh)
	end

	return s_ReplacementData
end


return VegetationPatcher()
