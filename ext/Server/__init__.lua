class 'MapEditorServer'

local m_Logger = Logger("MapEditorServer", false)

ServerTransactionManager = require "ServerTransactionManager"
ProjectManager = require "ProjectManager"
DataBaseManager = require "DataBaseManager"
ServerGameObjectManager = require "ServerGameObjectManager"
EBXManager = require "__shared/Modules/EBXManager"
GameObjectManager = GameObjectManager(Realm.Realm_Server)
--VanillaBlueprintsParser = VanillaBlueprintsParser(Realm.Realm_Client)
InstanceParser = InstanceParser(Realm.Realm_Server)
CommandActions = CommandActions(Realm.Realm_ClientAndServer)
EditorCommon = EditorCommon(Realm.Realm_ClientAndServer)

local m_ClientSettingsGuids = {
	partitionGuid = Guid('C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4'),
	instanceGuid = Guid('B479A8FA-67FF-8825-9421-B31DE95B551A'),
}

local m_ServerSettingsGuids = {
	partitionGuid = Guid('C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4'),
	instanceGuid = Guid('818334B3-CEA6-FC3F-B524-4A0FED28CA35'),
}

function MapEditorServer:__init()
	m_Logger:Write("Initializing MapEditorServer")
	self:RegisterEvents()

	ResourceManager:RegisterInstanceLoadHandler(m_ClientSettingsGuids.partitionGuid, m_ClientSettingsGuids.instanceGuid, self, self._modifyClientTimeoutSettings)
	ResourceManager:RegisterInstanceLoadHandler(m_ServerSettingsGuids.partitionGuid, m_ServerSettingsGuids.instanceGuid, self, self._modifyServerTimeoutSettings)
end

function MapEditorServer:RegisterEvents()
	NetEvents:Subscribe('EnableInputRestriction', self, self.OnEnableInputRestriction)
	NetEvents:Subscribe('DisableInputRestriction', self, self.OnDisableInputRestriction)
	NetEvents:Subscribe('TeleportSoldierToPosition', self, self.OnTeleportSoldierToPosition)

	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
	Events:Subscribe('Level:Loaded', self, self.OnLevelLoaded)
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
	Events:Subscribe('Player:Chat', self, self.OnChat)
	Events:Subscribe('Player:Authenticated', self, self.OnPlayerAuthenticated)

	Hooks:Install('ResourceManager:LoadBundles', 999, self, self.OnLoadBundles)
    Hooks:Install('EntityFactory:CreateFromBlueprint', 999, self, self.OnEntityCreateFromBlueprint)
	Hooks:Install('EntityFactory:Create', 999, self, self.OnEntityCreate)
end

function MapEditorServer:_modifyClientTimeoutSettings(p_Instance)
	p_Instance = ClientSettings(p_Instance)
	p_Instance:MakeWritable()
	p_Instance.loadedTimeout = ME_CONFIG.LOADING_TIMEOUT
	p_Instance.loadingTimeout = ME_CONFIG.LOADING_TIMEOUT
	p_Instance.ingameTimeout = ME_CONFIG.LOADING_TIMEOUT
	m_Logger:Write("Changed ClientSettings")
end

function MapEditorServer:_modifyServerTimeoutSettings(p_Instance)
	p_Instance = ServerSettings(p_Instance)
	p_Instance:MakeWritable()
	p_Instance.loadingTimeout = ME_CONFIG.LOADING_TIMEOUT
	p_Instance.ingameTimeout = ME_CONFIG.LOADING_TIMEOUT
	p_Instance.timeoutTime = ME_CONFIG.LOADING_TIMEOUT
	m_Logger:Write("Changed ServerSettings")
end

----------- Debug ----------------
function MapEditorServer:OnChat(p_Player, p_RecipientMask, p_Message)
	if p_Message == '' then
		return
	end

	if p_Player == nil then
		return
	end

	m_Logger:Write('Chat: ' .. p_Message)

	p_Message = p_Message:lower()

	local s_Parts = p_Message:split(' ')
	local s_FirstPart = s_Parts[1]

	if s_FirstPart == 'save' then
		ProjectManager:OnRequestProjectSave(p_Player, {
			projectName = "DebugProject",
			mapName = "XP2_Skybar",
			gameModeName = "TeamDeathMatchC0",
			requiredBundles = { "levels/XP2_Skybar/XP2_Skybar", "levels/XP2_Skybar/XP2_Skybar" }
		})
	end
end

----------- Game functions----------------
function MapEditorServer:OnUpdatePass(p_DeltaTime, p_UpdatePass)
	ServerTransactionManager:OnUpdatePass(p_DeltaTime, p_UpdatePass)
	ProjectManager:OnUpdatePass(p_DeltaTime, p_UpdatePass)
end

function MapEditorServer:OnLevelLoaded(p_Map, p_GameMode, p_Round)
	--ServerTransactionManager:OnLevelLoaded(p_Map, p_GameMode, p_Round)
	ProjectManager:OnLevelLoaded(p_Map, p_GameMode, p_Round)
end

function MapEditorServer:OnLevelDestroy()
	m_Logger:Write("Destroy!")
	GameObjectManager:OnLevelDestroy()
	ServerTransactionManager:OnLevelDestroy()
	ServerGameObjectManager:OnLevelDestroy()
	ProjectManager:OnLevelDestroy()
end

function MapEditorServer:OnPartitionLoaded(p_Partition)
	InstanceParser:OnPartitionLoaded(p_Partition)
end

function MapEditorServer:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
	GameObjectManager:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
end

function MapEditorServer:OnEntityCreate(p_Hook, p_EntityData, p_Transform)
	GameObjectManager:OnEntityCreate(p_Hook, p_EntityData, p_Transform )
end

function MapEditorServer:OnLoadBundles(p_Hook, p_Bundles, p_Compartment)
	EditorCommon:OnLoadBundles(p_Hook, p_Bundles, p_Compartment, ProjectManager.m_CurrentProjectHeader)
	ProjectManager:OnLoadBundles(p_Bundles, p_Compartment)
end

function MapEditorServer:OnPlayerAuthenticated(p_Player)

end

function MapEditorServer:SetInputRestriction(p_Player, p_Enabled)
	for i = 0, 125 do
		p_Player:EnableInput(i, p_Enabled)
	end
end
----------- Editor functions----------------

function MapEditorServer:OnEnableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, false)
end

function MapEditorServer:OnDisableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, true)
end

function MapEditorServer:OnTeleportSoldierToPosition(p_Player, p_NewTransform)
	if p_Player.soldier == nil then
		return
	end

	p_Player.soldier:SetTransform(p_NewTransform)
end

return MapEditorServer()
