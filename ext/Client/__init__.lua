class 'MapEditorClient'

Freecam = require "Freecam"
Editor = require "Editor"
UIManager = require "UIManager"
MessageActions = require "MessageActions"

EditorCommon = EditorCommon(Realm.Realm_Client)
--VanillaBlueprintsParser = VanillaBlueprintsParser(Realm.Realm_Client)
--ObjectManager = ObjectManager(Realm.Realm_Client)
GameObjectManager = GameObjectManager(Realm.Realm_ClientAndServer)
CommandActions = CommandActions(Realm.Realm_Client)
InstanceParser = InstanceParser(Realm.Realm_Client)

function MapEditorClient:__init()
	print("Initializing MapEditorClient")
	self:RegisterVars()
	self:RegisterEvents()
end

function MapEditorClient:RegisterVars()

end

function MapEditorClient:RegisterEvents()
	--Game events
	Events:Subscribe('Client:UpdateInput', self, self.OnUpdateInput)
	Events:Subscribe('Extension:Loaded', self, self.OnLoaded)
	Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
	Events:Subscribe('Engine:Update', self, self.OnUpdate)
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
	Events:Subscribe('Client:LevelLoaded', self, self.OnLevelLoaded)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)

	-- Editor Events
	NetEvents:Subscribe('MapEditor:ReceiveCommand', self, self.OnReceiveCommands)
	NetEvents:Subscribe('MapEditorClient:ReceiveUpdate', self, self.OnReceiveUpdate)
	Events:Subscribe('GameObjectManager:GameObjectReady', self, self.OnGameObjectReady)

	-- WebUI events
	Events:Subscribe('MapEditor:SendToServer', self, self.OnSendCommandsToServer)
	-- Events:Subscribe('MapEditor:ReceiveCommand', self, self.OnReceiveCommands) -- meant for client side only commands, not used yet
	Events:Subscribe('MapEditor:ReceiveMessage', self, self.OnReceiveMessage)
	Events:Subscribe('MapEditor:RequestSave', self, self.OnRequestSave)

	Events:Subscribe('MapEditor:EnableFreecamMovement', self, self.OnEnableFreecamMovement)
	Events:Subscribe('MapEditor:DisableFreecam', self, self.OnDisableFreecam)
	Events:Subscribe('MapEditor:controlStart', self, self.OnCameraControlStart)
	Events:Subscribe('MapEditor:controlEnd', self, self.OnCameraControlEnd)
	Events:Subscribe('MapEditor:controlUpdate', self, self.OnCameraControlUpdate)

    Hooks:Install('Input:PreUpdate', 200, self, self.OnUpdateInputHook)
    Hooks:Install('UI:PushScreen', 999, self, self.OnPushScreen)
    Hooks:Install('ClientEntityFactory:Create', 999, self, self.OnEntityCreate)

    Hooks:Install('ClientEntityFactory:CreateFromBlueprint', 999, self, self.OnEntityCreateFromBlueprint)
end

----------- Game functions----------------

function MapEditorClient:OnUpdate(p_Delta, p_SimulationDelta)
	Editor:OnUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorClient:OnLevelLoaded(p_MapName, p_GameModeName)
	InstanceParser:OnLevelLoaded(p_MapName, p_GameModeName)
end

function MapEditorClient:OnLoaded()
	WebUI:Init()
	WebUI:Show()
end

function MapEditorClient:OnExtensionUnloading()
	Editor:OnExtensionUnloading()
end

function MapEditorClient:OnPartitionLoaded(p_Partition)
	Editor:OnPartitionLoaded(p_Partition)
	EditorCommon:OnPartitionLoaded(p_Partition)
end

function MapEditorClient:OnEngineMessage(p_Message) 
	Editor:OnEngineMessage(p_Message) 
end

function MapEditorClient:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	UIManager:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
end

function MapEditorClient:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
	Freecam:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
end

function MapEditorClient:OnUpdateInput(p_Delta)
	Freecam:OnUpdateInput(p_Delta)
	UIManager:OnUpdateInput(p_Delta)
end

function MapEditorClient:OnUpdatePass(p_Delta, p_Pass)
	Editor:OnUpdatePass(p_Delta, p_Pass)
end

function MapEditorClient:OnLevelDestroy()
	print("Destroy!")
	GameObjectManager:OnLevelDestroy()
end

function MapEditorClient:OnEntityCreate(p_Hook, p_Data, p_Transform)
	EditorCommon:OnEntityCreate(p_Hook, p_Data, p_Transform)
end

function MapEditorClient:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
	GameObjectManager:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
end

----------- Editor functions----------------

function MapEditorClient:OnGameObjectReady(p_GameObject)
	Editor:OnGameObjectReady(p_GameObject)
end

function MapEditorClient:OnSendCommandsToServer(p_CommandsJson)
	Editor:OnSendCommandsToServer(p_CommandsJson)
end

function MapEditorClient:OnReceiveCommands(p_CommandsJson)
	local s_Commands = DecodeParams(json.decode(p_CommandsJson))

	Editor:OnReceiveCommands(s_Commands, nil)
end

function MapEditorClient:OnReceiveMessage(p_Message)
	Editor:OnReceiveMessage(p_Message)
end

function MapEditorClient:OnReceiveUpdate(p_UpdatedGameObjectTransferDatas)
	Editor:OnReceiveUpdate(p_UpdatedGameObjectTransferDatas)
end

----------- WebUI functions----------------

function MapEditorClient:OnRequestSave()
	Editor:OnRequestSave()
end

function MapEditorClient:OnEnableFreecamMovement()
	UIManager:OnEnableFreecamMovement()
	Freecam:OnEnableFreecamMovement()
end

function MapEditorClient:OnDisableFreecam()
	UIManager:OnDisableFreecam()
end

function MapEditorClient:OnCameraControlStart()
	Freecam:OnControlStart()
end
function MapEditorClient:OnCameraControlEnd()
	Freecam:OnControlEnd()
end
function MapEditorClient:OnCameraControlUpdate(p_TransformJson)
	local s_Transform = DecodeParams(json.decode(p_TransformJson))
	Freecam:OnControlUpdate(s_Transform.transform)
end
return MapEditorClient()