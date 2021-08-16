class 'HealthStatePatcher'

local m_Logger = Logger("HealthStatePatcher", false)

function HealthStatePatcher:__init()
	m_Logger:Write("Initializing Patches")
end

function HealthStatePatcher:PatchHealthStateData(p_Instance)
	local s_Instance = HealthStateData(p_Instance)
	s_Instance:MakeWritable()
	s_Instance.health = 10000000
end

return HealthStatePatcher()
