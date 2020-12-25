class 'VegetationPatcher'
local m_Logger = Logger("VegetationPatcher", true)

function VegetationPatcher:__init()
	m_Logger:Write("Initializing Vegetation Patches")
end

function VegetationPatcher:PatchVegetationTree(p_VegetationTree)
	local s_Instance = VegetationTreeEntityData(p_VegetationTree)
	s_Instance:MakeWritable()
	s_Instance.clientSideOnly = true
end


return VegetationPatcher()
