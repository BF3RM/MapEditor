class ('ClientGameObjectManager')

local m_Logger = Logger("ClientGameObjectManager", true)

function ClientGameObjectManager:__init()
	m_Logger:Write("Initializing ClientGameObjectManager")
	self:RegisterEvents()
end


function ClientGameObjectManager:RegisterEvents()
	NetEvents:Subscribe("ClientGameObjectManager:ServerGameObjectsGuids", self, self.OnServerGameObjectsGuidsReceived)
end

--- Called when this client is done loading. We compare server and client guids to check which objects are client or server
--- only.
function ClientGameObjectManager:OnServerGameObjectsGuidsReceived(p_GameObjectsGuids)
	m_Logger:Write('Resolving client-only and server-only gameobjects')
	local s_ClientGuids = GameObjectManager:GetVanillaGameObjectsGuids()
	local s_ServerGuids = p_GameObjectsGuids
	local s_ClientOnlyGuids, n = self:FindMissingValues(s_ClientGuids, s_ServerGuids)
	m_Logger:Write("Found ".. n .." client-only gameobjects")
	local s_ServerOnlyGuids, m = self:FindMissingValues(s_ServerGuids, s_ClientGuids) -- Might not be needed, havent found server-only objects yet
	m_Logger:Write("Found ".. m .." server-only gameobjects")

	local s_ClientOnlyGameObjectTransferDatas = {}

	for _, l_Guid in pairs(s_ClientOnlyGuids) do
		local s_GameObject = GameObjectManager.m_GameObjects[tostring(l_Guid)]
		if s_GameObject == nil then
			m_Logger:Error("Couldn't find client-only gameobject with guid: ".. tostring(l_Guid))
		else
			s_GameObject.realm = Realm.Realm_Client
			table.insert(s_ClientOnlyGameObjectTransferDatas, s_GameObject:GetGameObjectTransferData())
		end
	end
	NetEvents:SendLocal("ServerGameObjectManager:ClientOnlyGameObjectsTransferData", s_ClientOnlyGameObjectTransferDatas)
	NetEvents:SendLocal("ServerGameObjectManager:ServerOnlyGameObjectsGuids", s_ServerOnlyGuids)
	m_Logger:Write("Done resolving")
end

---- TODO: Find better algorithm
----- Returns array with values of the new table that are not on the original table.
--function ClientGameObjectManager:FindMissingValues(p_OriginalTable, p_NewTable)
--	local s_MissingValues = {}
--	for _, l_OriginalValue in pairs(p_OriginalTable) do
--		local s_Found = false
--
--		for _, l_NewValue in pairs(p_NewTable) do
--			if l_OriginalValue == l_NewValue then
--				s_Found = true
--				break
--			end
--		end
--
--		if not s_Found then
--			table.insert(s_MissingValues, l_OriginalValue)
--		end
--	end
--	return s_MissingValues
--end

--- Returns array with values of the new table that are not on the original table.
function ClientGameObjectManager:FindMissingValues(p_OriginalTable, p_NewTable)
	local s_MissingValues = {}
	local s_Count = 0
	for l_GuidString, l_Guid in pairs(p_OriginalTable) do
		if p_NewTable[l_GuidString] == nil then
			table.insert(s_MissingValues, l_GuidString)
			s_Count = s_Count + 1
		end
	end
	return s_MissingValues, s_Count
end

return ClientGameObjectManager()
