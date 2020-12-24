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

	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
    Events:Subscribe('Level:Loaded', self, self.OnLevelLoaded)
    Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
	Events:Subscribe('Player:Chat', self, self.OnChat)
	Events:Subscribe('Player:Authenticated', self, self.OnPlayerAuthenticated)

	Events:Subscribe('GameObjectManager:GameObjectReady', self, self.OnGameObjectReady)

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
	local firstPart = s_Parts[1]

	if firstPart == 'save' then
		ProjectManager:OnRequestProjectSave(p_Player, {
			projectName = "DebugProject",
			mapName = "XP2_Skybar",
			gameModeName = "TeamDeathMatchC0",
			requiredBundles = { "levels/XP2_Skybar/XP2_Skybar", "levels/XP2_Skybar/XP2_Skybar" }
		})
	end
end

----------- Game functions----------------
function MapEditorServer:OnUpdatePass(p_Delta, p_Pass)
	ServerTransactionManager:OnUpdatePass(p_Delta, p_Pass)
	ProjectManager:OnUpdatePass(p_Delta, p_Pass)
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
	print("Player Authenticated: " .. p_Player.name)
	p_Player:Fade(0, false)
end

function MapEditorServer:SetInputRestriction(p_Player, p_Enabled)
	for i=0, 125 do
		p_Player:EnableInput(i, p_Enabled)
	end
end
----------- Editor functions----------------

function MapEditorServer:OnGameObjectReady(p_GameObject)
	--ServerTransactionManager:OnGameObjectReady(p_GameObject)
end

function MapEditorServer:OnEnableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, false)
end

function MapEditorServer:OnDisableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, true)
end

return MapEditorServer()
