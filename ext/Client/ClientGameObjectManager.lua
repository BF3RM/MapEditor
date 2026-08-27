---@class ClientGameObjectManager
---@overload fun():ClientGameObjectManager
ClientGameObjectManager = class 'ClientGameObjectManager'

local m_Logger = Logger("ClientGameObjectManager", false)

function ClientGameObjectManager:__init()
	m_Logger:Write("Initializing ClientGameObjectManager")
	self:RegisterEvents()
	self:RegisterVars()
end

function ClientGameObjectManager:RegisterEvents()
	NetEvents:Subscribe("ClientGameObjectManager:ServerGameObjectsGuids", self, self.OnServerGameObjectsGuidsReceived)
	NetEvents:Subscribe("ClientGameObjectManager:ClientOnlyGuids", self, self.OnClientOnlyGuidsReceived)
	NetEvents:Subscribe("ClientGameObjectManager:ServerOnlyGameObjectsTransferData", self, self.OnServerOnlyGameObjectsTransferData)
end

function ClientGameObjectManager:RegisterVars()
	self:ResetVars()
end

function ClientGameObjectManager:OnLevelDestroy()
	self:ResetVars()
end

function ClientGameObjectManager:ResetVars()
	self.m_UnresolvedServerOnlyChildren = {}
	-- Guids linked into a parent's children during the batch being processed.
	self.m_LinkedToParent = {}
end

--- Called when this client is done loading. We compare server and client guids to check which objects are client or server
--- only.
function ClientGameObjectManager:OnServerGameObjectsGuidsReceived(p_GameObjectsGuids)
	m_Logger:Write('Resolving client-only and server-only GameObjects')
	local s_ClientGuids = GameObjectManager:GetVanillaGameObjectsGuids()
	local s_ServerGuids = p_GameObjectsGuids
	local s_ClientOnlyGuids, n = self:FindMissingValues(s_ClientGuids, s_ServerGuids)
	m_Logger:Write("Found ".. n .." client-only GameObjects")
	local s_ServerOnlyGuids, m = self:FindMissingValues(s_ServerGuids, s_ClientGuids) -- Might not be needed, havent found server-only objects yet
	m_Logger:Write("Found ".. m .." server-only GameObjects")

	local s_ClientOnlyGameObjectTransferDatas = {}

	for _, l_Guid in pairs(s_ClientOnlyGuids) do
		local s_GameObject = GameObjectManager.m_GameObjects[tostring(l_Guid)]

		if s_GameObject == nil then
			m_Logger:Error("Couldn't find client-only GameObject with guid: ".. tostring(l_Guid))
		else
			s_GameObject.realm = Realm.Realm_Client
			table.insert(s_ClientOnlyGameObjectTransferDatas, s_GameObject:GetGameObjectTransferData())
		end
	end

	NetEvents:SendLocal("ServerGameObjectManager:ClientOnlyGameObjectsTransferData", s_ClientOnlyGameObjectTransferDatas)
	NetEvents:SendLocal("ServerGameObjectManager:ServerOnlyGameObjectsGuids", s_ServerOnlyGuids)
	m_Logger:Write("Done resolving")
end

function ClientGameObjectManager:OnServerOnlyGameObjectsTransferData(p_TransferDatas)
	m_Logger:Write("Received ".. #p_TransferDatas .." server-only GameObjects")

	-- Build the whole batch BEFORE telling the WebUI about any of it, then announce only the
	-- objects that are roots *of this batch*.
	--
	-- The client's EntityFactory:CreateFromBlueprint hook never fires (measured: 0 calls against
	-- 19169 EntityFactory:Create calls), so the client resolves no hierarchy of its own and the
	-- server classifies EVERY object as server-only -- ~2950 of them, in the arbitrary order a
	-- table iteration produced. Announcing them one at a time made each object its own WebUI
	-- batch, and the tree builder can only attach a node whose parent is already in the tree or
	-- in the same batch: a child announced before its parent has neither, so it fell back to the
	-- 'vanilla_root' bucket. That is why subworlds and worldparts stopped being parents and the
	-- whole level appeared as one flat list under Vanilla.
	--
	-- Announcing roots only puts each subtree in ONE batch, children first and root last, which
	-- is exactly the order the tree builder's flush expects (it flushes on the batch's last
	-- element). Objects whose parent came from an earlier batch are announced individually --
	-- their parent node already exists, so the tree finds it.
	local s_Objects = {}

	for _, l_TransferData in pairs(p_TransferDatas) do
		local s_GameObject = self:ProcessServerOnlyGameObject(l_TransferData)

		if s_GameObject ~= nil then
			table.insert(s_Objects, s_GameObject)
		end
	end

	for _, l_GameObject in ipairs(s_Objects) do
		-- Linked children ride along inside their parent's subtree; announcing them again would
		-- add a second node for the same guid.
		if self.m_LinkedToParent[tostring(l_GameObject.guid)] == nil then
			Events:DispatchLocal("GameObjectManager:GameObjectReady", l_GameObject)
		end
	end


	self.m_LinkedToParent = {}
end

function ClientGameObjectManager:ProcessServerOnlyGameObject(p_TransferData)
	local s_GameObject = GameObjectTransferData(p_TransferData):GetGameObject()
	local s_GuidString = tostring(s_GameObject.guid)

	if GameObjectManager:GetGameObject(s_GuidString) ~= nil then
		m_Logger:Warning("Already had a server-only object received with the same guid")
		return nil
	end

	if s_GameObject.parentData ~= nil then
		local s_ParentGuidString = tostring(s_GameObject.parentData.guid)
		local s_Parent = GameObjectManager:GetGameObject(s_ParentGuidString)

		if s_Parent ~= nil then
			--m_Logger:Write("Resolved child " .. tostring(s_GameObject.guid) .. " with parent " .. tostring(parent.guid))

			table.insert(s_Parent.children, s_GameObject)
			self.m_LinkedToParent[s_GuidString] = true
		else
			if self.m_UnresolvedServerOnlyChildren[s_ParentGuidString] == nil then
				self.m_UnresolvedServerOnlyChildren[s_ParentGuidString] = { }
			end

			table.insert(self.m_UnresolvedServerOnlyChildren[s_ParentGuidString], tostring(s_GameObject.guid))
		end
	end

	if self.m_UnresolvedServerOnlyChildren[s_GuidString] ~= nil and #self.m_UnresolvedServerOnlyChildren[s_GuidString] > 0 then
	-- Current GameObject is some previous server-only GameObject's parent
		for _, l_ChildGameObjectGuidString in pairs(self.m_UnresolvedServerOnlyChildren[s_GuidString]) do
			table.insert(s_GameObject.children, GameObjectManager:GetGameObject(l_ChildGameObjectGuidString))
			self.m_LinkedToParent[l_ChildGameObjectGuidString] = true
			--m_Logger:Write("Resolved child " .. childGameObjectGuidString .. " with parent " .. s_GuidString)
		end

		self.m_UnresolvedServerOnlyChildren[s_GuidString] = { }
	end

	GameObjectManager:AddGameObjectToTable(s_GameObject)

	-- The caller announces this batch's roots once the whole batch is linked up; a subtree has to
	-- reach the WebUI in one piece or its children lose their parent.
	return s_GameObject
end

function ClientGameObjectManager:OnClientOnlyGuidsReceived(p_ClientOnlyGuids)
	m_Logger:Write('Received client only guids, updating their realm.')

	for l_GuidString, l_Guid in pairs(p_ClientOnlyGuids) do
		GameObjectManager:UpdateGameObjectRealm(l_GuidString, Realm.Realm_Client)
		local s_GameObject = GameObjectManager:GetGameObject(l_GuidString)
		Events:DispatchLocal('ClientGameObjectManager:UpdateGameObjectRealm', s_GameObject)
	end
end

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

ClientGameObjectManager = ClientGameObjectManager()

return ClientGameObjectManager
