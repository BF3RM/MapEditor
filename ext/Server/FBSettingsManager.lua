local m_Logger = Logger("FBSettingsManager", false)

local function _modifyClientTimeoutSettings(p_Instance)
	p_Instance = ClientSettings(p_Instance)
	p_Instance:MakeWritable()
	p_Instance.loadedTimeout = math.max(ME_CONFIG.LOADING_TIMEOUT, p_Instance.loadedTimeout or 0)
	p_Instance.loadingTimeout = math.max(ME_CONFIG.LOADING_TIMEOUT, p_Instance.loadingTimeout or 0)
	p_Instance.ingameTimeout = math.max(ME_CONFIG.LOADING_TIMEOUT, p_Instance.ingameTimeout or 0)
	m_Logger:Write("Changed ClientSettings")
end

local function _modifyServerTimeoutSettings(p_Instance)
	p_Instance = ServerSettings(p_Instance)
	p_Instance:MakeWritable()
	p_Instance.loadingTimeout = math.max(ME_CONFIG.LOADING_TIMEOUT, p_Instance.loadingTimeout or 0)
	p_Instance.ingameTimeout = math.max(ME_CONFIG.LOADING_TIMEOUT, p_Instance.ingameTimeout or 0)
	p_Instance.timeoutTime = math.max(ME_CONFIG.LOADING_TIMEOUT, p_Instance.timeoutTime or 0)
	m_Logger:Write("Changed ServerSettings")
end

local m_ClientSettingsGuids = {
	partitionGuid = Guid('C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4'),
	instanceGuid = Guid('B479A8FA-67FF-8825-9421-B31DE95B551A'),
}

local m_ServerSettingsGuids = {
	partitionGuid = Guid('C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4'),
	instanceGuid = Guid('818334B3-CEA6-FC3F-B524-4A0FED28CA35'),
}

ResourceManager:RegisterInstanceLoadHandler(m_ClientSettingsGuids.partitionGuid, m_ClientSettingsGuids.instanceGuid, _modifyClientTimeoutSettings)
ResourceManager:RegisterInstanceLoadHandler(m_ServerSettingsGuids.partitionGuid, m_ServerSettingsGuids.instanceGuid, _modifyServerTimeoutSettings)
