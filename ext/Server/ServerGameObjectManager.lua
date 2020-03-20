class ('ServerGameObjectManager')

local m_Logger = Logger("ServerGameObjectManager", true)

function ServerGameObjectManager:__init()
	m_Logger:Write("Initializing ServerGameObjectManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function ServerGameObjectManager:RegisterVars()
	self.m_FirstPlayerLoaded = false
end

function ServerGameObjectManager:RegisterEvents()
	NetEvents:Subscribe("ServerGameObjectManager:ServerOnlyGameObjectsGuids", self, self.OnServerOnlyGameObjectsGuids)
	NetEvents:Subscribe("ServerGameObjectManager:ClientOnlyGameObjectsTransferData", self, self.OnClientOnlyGameObjectsTransferData)
end

function ServerGameObjectManager:ClientReady(p_Player)
	if self.m_FirstPlayerLoaded then
		return
	end
	m_Logger:Write("Fist player ready, sending vanilla gameobjects guids")

	NetEvents:SendToLocal("ClientGameObjectManager:ServerGameObjectsGuids", p_Player, GameObjectManager:GetVanillaGameObjectsGuids())
end

function ServerGameObjectManager:OnServerOnlyGameObjectsGuids(p_Player, p_Guids)
	self.m_FirstPlayerLoaded = true
	m_Logger:Write("Received ".. #p_Guids .." server-only gameobjects")
end

function ServerGameObjectManager:OnClientOnlyGameObjectsTransferData(p_Player, p_TransferDatas)
	m_Logger:Write("Received ".. #p_TransferDatas .." client-only gameobjects")

	for _, l_TransferData in pairs(p_TransferDatas) do
		self:ProcessClientOnlyGameObject(l_TransferData)
	end
end

function ServerGameObjectManager:ProcessClientOnlyGameObject(p_TransferData)
    local s_GameObject = GameObjectTransferData(p_TransferData):GetGameObject()
    local s_GuidString = tostring(s_GameObject.guid)

    if (GameObjectManager.m_GameObjects[s_GuidString] ~= nil) then
        m_Logger:Warning("Already had a client only object received with the same guid")
        return
    end

    if (s_GameObject.parentData ~= nil) then
        local parentGuidString = tostring(s_GameObject.parentData.guid)
        local parent = GameObjectManager.m_GameObjects[parentGuidString]

        if (parent ~= nil) then
            --m_Logger:Write("Resolved child " .. tostring(s_GameObject.guid) .. " with parent " .. tostring(parent.guid))

            table.insert(parent.children, s_GameObject)
        else
            if (GameObjectManager.m_UnresolvedClientOnlyChildren[parentGuidString] == nil) then
				GameObjectManager.m_UnresolvedClientOnlyChildren[parentGuidString] = { }
            end

            table.insert(GameObjectManager.m_UnresolvedClientOnlyChildren[parentGuidString], tostring(s_GameObject.guid))
        end
    end

    if (GameObjectManager.m_UnresolvedClientOnlyChildren[s_GuidString] ~= nil and
            #GameObjectManager.m_UnresolvedClientOnlyChildren[s_GuidString] > 0) then -- current gameobject is some previous clientonly gameobject's parent

        for _, childGameObjectGuidString in pairs(GameObjectManager.m_UnresolvedClientOnlyChildren[s_GuidString]) do
            table.insert(s_GameObject.children, GameObjectManager.m_GameObjects[childGameObjectGuidString])
            --m_Logger:Write("Resolved child " .. childGameObjectGuidString .. " with parent " .. s_GuidString)
        end

		GameObjectManager.m_UnresolvedClientOnlyChildren[s_GuidString] = { }
    end

	GameObjectManager:AddGameObjectToTable(s_GameObject)
    m_Logger:Write("Added client only gameobject on server (without gameEntities). guid: " .. s_GuidString)
end

return ServerGameObjectManager()
