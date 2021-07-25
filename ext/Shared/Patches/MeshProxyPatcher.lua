class 'MeshProxyPatcher'

local m_Logger = Logger("MeshProxyPatcher", true)

function MeshProxyPatcher:__init()
	m_Logger:Write("Initializing Vegetation Patches")
end

function MeshProxyPatcher:Patch(p_DynamicModel)
	local s_Instance = MeshProxyEntityData(p_DynamicModel)
	local s_ReplacementData = StaticModelEntityData(p_DynamicModel.instanceGuid)

	s_ReplacementData.transform = s_Instance.transform
	s_ReplacementData.enabled = true
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

return MeshProxyPatcher()
