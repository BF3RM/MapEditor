class 'DynamicModelPatcher'

local m_Logger = Logger("DynamicModelPatcher", true)

function DynamicModelPatcher:__init()
	m_Logger:Write("Initializing Vegetation Patches")
end

function DynamicModelPatcher:Patch(p_DynamicModel)
	local s_Instance = DynamicModelEntityData(p_DynamicModel)
	local s_ReplacementData = StaticModelEntityData(p_DynamicModel.instanceGuid)

	s_ReplacementData.transform = s_Instance.transform
	s_ReplacementData.enabled = true
	s_ReplacementData.visible = true

	--[[ Don't think this is necessary
	for l_Index, l_Component in pairs(s_Instance.components) do
		print(l_Index)
		s_ReplacementData.components:add(l_Component)
	end
	s_ReplacementData.runtimeComponentCount = s_Instance.runtimeComponentCount
	s_ReplacementData.physicsData = s_Instance.physicsData
	]]

	if s_Instance.mesh.isLazyLoaded then
		s_Instance.mesh:RegisterLoadHandlerOnce(function(p_Mesh)
			s_ReplacementData.mesh = MeshAsset(p_Mesh)
		end)
	else
		s_ReplacementData.mesh = MeshAsset(s_Instance.mesh)
	end
	s_Instance:ReplaceReferences(s_ReplacementData)
end

return DynamicModelPatcher()
