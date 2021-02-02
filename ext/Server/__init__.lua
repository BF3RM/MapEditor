class 'MapEditorServer'

local m_Logger = Logger("MapEditorServer", true)

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

function MapEditorServer:__init()
	m_Logger:Write("Initializing MapEditorServer")
	self:RegisterEvents()
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
