class ('ServerGameObjectManager')

local m_Logger = Logger("ServerGameObjectManager", true)

function ServerGameObjectManager:__init()
	m_Logger:Write("Initializing ServerGameObjectManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function ServerGameObjectManager:RegisterVars()
	self:ResetVars()
end

function ServerGameObjectManager:OnLevelDestroy()
	self:ResetVars()
end

function ServerGameObjectManager:ResetVars()
	self.m_FirstPlayerLoaded = false
	self.m_UnresolvedClientOnlyChildren = {}
	self.m_ClientOnlyGameObjectGuids = {}
	self.m_ServerOnlyGameObjectGuids = {}
end

function ServerGameObjectManager:RegisterEvents()
	NetEvents:Subscribe("ServerGameObjectManager:ServerOnlyGameObjectsGuids", self, self.OnServerOnlyGameObjectsGuidsReceived)
	NetEvents:Subscribe("ServerGameObjectManager:ClientOnlyGameObjectsTransferData", self, self.OnClientOnlyGameObjectsTransferData)
end

function ServerGameObjectManager:ClientReady(p_Player)
	if p_Player == nil then
		return
	end

	-- If this isn't the first player we send the client only and server only objects directly
	if self.m_FirstPlayerLoaded then
		NetEvents:SendToLocal('ClientGameObjectManager:ClientOnlyGuids', p_Player, self.m_ClientOnlyGameObjectGuids)
		local s_ServerOnlyTransferDatas = self:GetServerOnlyGameObjectsTransferDatas(self.m_ServerOnlyGameObjectGuids)
		NetEvents:SendToLocal("ClientGameObjectManager:ServerOnlyGameObjectsTransferData", p_Player, s_ServerOnlyTransferDatas)
	-- If this is the first player we calculate which objects are server or client only
	else
		m_Logger:Write("Fist player ready, sending vanilla GameObjects guids")
		NetEvents:SendToLocal("ClientGameObjectManager:ServerGameObjectsGuids", p_Player, GameObjectManager:GetVanillaGameObjectsGuids())
	end
end

function ServerGameObjectManager:OnServerOnlyGameObjectsGuidsReceived(p_Player, p_Guids)
	m_Logger:Write("Received ".. #p_Guids .." server-only GameObjects, updating all clients")
	local s_ServerOnlyTransferDatas = self:GetServerOnlyGameObjectsTransferDatas(p_Guids)

	-- Set the flag to true, so players that connect after get the info directly instead of comparing like the first client
	self.m_FirstPlayerLoaded = true
	NetEvents:SendToLocal("ClientGameObjectManager:ServerOnlyGameObjectsTransferData", p_Player, s_ServerOnlyTransferDatas)
end

function ServerGameObjectManager:GetServerOnlyGameObjectsTransferDatas(p_Guids)
	local s_ServerOnlyTransferDatas = {}

	for _, l_GuidString in pairs(p_Guids) do
		self.m_ServerOnlyGameObjectGuids[tostring(l_GuidString)] = l_GuidString
		local s_GameObject = GameObjectManager:GetGameObject(l_GuidString)

		if s_GameObject == nil then
			m_Logger:Error('Received guid of a server-only object that doesn\' exist')
		else
			GameObjectManager:UpdateGameObjectRealm(l_GuidString, Realm.Realm_Server)
			table.insert(s_ServerOnlyTransferDatas, s_GameObject:GetTransferData())
		end
	end

	return s_ServerOnlyTransferDatas
end

function ServerGameObjectManager:OnClientOnlyGameObjectsTransferData(p_Player, p_TransferDatas)
	-- Check just in case if server has already received client-only objects from another client (shouldn't happen unless two clients join at the same time).
	if self.m_FirstPlayerLoaded then
		return
	end

	-- We dont set self.m_FirstPlayerLoaded to true until server-only are processed too, which
	-- is updated in the next netevent.

	m_Logger:Write("Received ".. #p_TransferDatas .." client-only GameObjects")

	for _, l_TransferData in pairs(p_TransferDatas) do
		self:ProcessClientOnlyGameObject(l_TransferData)
	end

	NetEvents:BroadcastLocal('ClientGameObjectManager:ClientOnlyGuids', self.m_ClientOnlyGameObjectGuids)
end

function ServerGameObjectManager:ProcessClientOnlyGameObject(p_TransferData)
    local s_GameObject = TransferData(p_TransferData):GetGameObject()
    local s_GuidString = tostring(s_GameObject.guid)

    if (GameObjectManager:GetGameObject(s_GuidString) ~= nil) then
        m_Logger:Warning("Already had a client-only object received with the same guid")
        return
    end

    if (s_GameObject.parentData ~= nil) then
        local parentGuidString = tostring(s_GameObject.parentData.guid)
        local parent = GameObjectManager:GetGameObject(parentGuidString)

        if (parent ~= nil) then
            --m_Logger:Write("Resolved child " .. tostring(s_GameObject.guid) .. " with parent " .. tostring(parent.guid))

            table.insert(parent.children, s_GameObject)
        else
            if (self.m_UnresolvedClientOnlyChildren[parentGuidString] == nil) then
				self.m_UnresolvedClientOnlyChildren[parentGuidString] = { }
            end

            table.insert(self.m_UnresolvedClientOnlyChildren[parentGuidString], tostring(s_GameObject.guid))
        end
    end

    if (self.m_UnresolvedClientOnlyChildren[s_GuidString] ~= nil and
            #self.m_UnresolvedClientOnlyChildren[s_GuidString] > 0) then -- current gameobject is some previous clientonly gameobject's parent

        for _, childGameObjectGuidString in pairs(self.m_UnresolvedClientOnlyChildren[s_GuidString]) do
            table.insert(s_GameObject.children, GameObjectManager:GetGameObject(childGameObjectGuidString))
            --m_Logger:Write("Resolved child " .. childGameObjectGuidString .. " with parent " .. s_GuidString)
        end

		self.m_UnresolvedClientOnlyChildren[s_GuidString] = { }
    end

	self.m_ClientOnlyGameObjectGuids[tostring(s_GameObject.guid)] = s_GameObject.guid

	GameObjectManager:AddGameObjectToTable(s_GameObject)

    --m_Logger:Write("Added client only gameobject on server (without gameEntities), guid: " .. s_GuidString)
end

return ServerGameObjectManager()
