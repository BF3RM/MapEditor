class 'MapEditorServer'

local m_Logger = Logger("MapEditorServer", true)

EditorServer = require "EditorServer"

--VanillaBlueprintsParser = VanillaBlueprintsParser(Realm.Realm_Client)
InstanceParser = InstanceParser(Realm.Realm_Server)
--ObjectManager = ObjectManager(Realm.Realm_ClientAndServer)
GameObjectManager = GameObjectManager(Realm.Realm_ClientAndServer)
CommandActions = CommandActions(Realm.Realm_ClientAndServer)
EditorCommon = EditorCommon(Realm.Realm_ClientAndServer)

function MapEditorServer:__init()
	m_Logger:Write("Initializing MapEditorServer")
	self:RegisterEvents()
end

function MapEditorServer:RegisterEvents()
	NetEvents:Subscribe('EnableInputRestriction', self, self.OnEnableInputRestriction)
	NetEvents:Subscribe('DisableInputRestriction', self, self.OnDisableInputRestriction)

	NetEvents:Subscribe('MapEditorServer:ReceiveCommand', self, self.OnReceiveCommands)
	NetEvents:Subscribe('MapEditorServer:RequestSave', self, self.OnRequestSave)

	NetEvents:Subscribe('MapEditorServer:RequestUpdate', self, self.OnRequestUpdate)

	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
    Events:Subscribe('Server:LevelLoaded', self, self.OnLevelLoaded)
    Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)

	Events:Subscribe('GameObjectManager:GameObjectReady', self, self.OnGameObjectReady)

    Hooks:Install('ServerEntityFactory:CreateFromBlueprint', 999, self, self.OnEntityCreateFromBlueprint)
end
----------- Game functions----------------
function MapEditorServer:OnUpdatePass(p_Delta, p_Pass)
	EditorServer:OnUpdatePass(p_Delta, p_Pass)
end

function MapEditorServer:OnLevelLoaded(p_Map, p_GameMode, p_Round)
	EditorServer:OnLevelLoaded(p_Map, p_GameMode, p_Round)
end

function MapEditorServer:OnLevelDestroy()
	m_Logger:Write("Destroy!")
	GameObjectManager:OnLevelDestroy()
end

function MapEditorServer:OnPartitionLoaded(p_Partition)
	InstanceParser:OnPartitionLoaded(p_Partition)
	EditorCommon:OnPartitionLoaded(p_Partition)
end

function MapEditorServer:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
	GameObjectManager:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
end

function MapEditorServer:SetInputRestriction(p_Player, p_Enabled)
	for i=0, 125 do
		p_Player:EnableInput(i, p_Enabled)
	end
end
----------- Editor functions----------------

function MapEditorServer:OnGameObjectReady(p_GameObject)
	EditorServer:OnGameObjectReady(p_GameObject)
end

function MapEditorServer:OnReceiveCommands(p_Player, p_CommandsJson)
	local s_Commands = DecodeParams(json.decode(p_CommandsJson))

	EditorServer:OnReceiveCommands(p_Player, s_Commands)
end

function MapEditorServer:OnRequestUpdate(p_Player, p_TransactionId)
	EditorServer:OnRequestUpdate(p_Player, p_TransactionId)
end

function MapEditorServer:OnEnableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, false)
end

function MapEditorServer:OnDisableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, true)
end












return MapEditorServer()