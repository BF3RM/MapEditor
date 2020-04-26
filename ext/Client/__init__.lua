class 'MapEditorClient'

local m_Logger = Logger("MapEditorClient", true)
WebUpdater = require "WebUpdater"
FreeCam = require "Freecam"
Editor = require "Editor"
UIManager = require "UIManager"
MessageActions = require "MessageActions"
ClientTransactionManager = require "ClientTransactionManager"
ClientGameObjectManager = require "ClientGameObjectManager"
GameObjectManager = GameObjectManager(Realm.Realm_Client)

EditorCommon = EditorCommon(Realm.Realm_Client)
--VanillaBlueprintsParser = VanillaBlueprintsParser(Realm.Realm_Client)
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
	Events:Subscribe('UI:DrawHud', self, self.OnDrawHud)

	-- Editor Events
	NetEvents:Subscribe('MapEditorClient:ReceiveProjectData', self, self.OnReceiveProjectData)
	NetEvents:Subscribe('MapEditorClient:ReceiveCurrentProjectHeader', self, self.OnReceiveCurrentProjectHeader)

	-- WebUI events
	Events:Subscribe('MapEditor:UIReloaded', self, self.OnUIReloaded)
	Events:Subscribe('MapEditor:SendToServer', self, self.OnSendCommandsToServer)
	Events:Subscribe('MapEditor:ReceiveMessage', self, self.OnReceiveMessages)
	Events:Subscribe('MapEditor:RequestProjectSave', self, self.OnRequestProjectSave)
	Events:Subscribe('MapEditor:RequestProjectLoad', self, self.OnRequestProjectLoad)
	Events:Subscribe('MapEditor:RequestProjectDelete', self, self.OnRequestProjectDelete)
	Events:Subscribe('MapEditor:RequestProjectData', self, self.OnRequestProjectData)

	Events:Subscribe('MapEditor:EnableFreeCamMovement', self, self.OnEnableFreeCamMovement)
	Events:Subscribe('MapEditor:DisableFreeCam', self, self.OnDisableFreeCam)
	Events:Subscribe('MapEditor:controlStart', self, self.OnCameraControlStart)
	Events:Subscribe('MapEditor:controlEnd', self, self.OnCameraControlEnd)
	Events:Subscribe('MapEditor:controlUpdate', self, self.OnCameraControlUpdate)

    Hooks:Install('Input:PreUpdate', 200, self, self.OnUpdateInputHook)
    Hooks:Install('UI:PushScreen', 999, self, self.OnPushScreen)
    Hooks:Install('ClientEntityFactory:Create', 999, self, self.OnEntityCreate)

	Hooks:Install('ResourceManager:LoadBundles', 999, self, self.OnLoadBundles)
    Hooks:Install('ClientEntityFactory:CreateFromBlueprint', 999, self, self.OnEntityCreateFromBlueprint)
end

----------- Game functions----------------

function MapEditorClient:OnUpdate(p_Delta, p_SimulationDelta)
	Editor:OnUpdate(p_Delta, p_SimulationDelta)
	WebUpdater:OnUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorClient:OnLevelLoaded(p_MapName, p_GameModeName)
	InstanceParser:OnLevelLoaded(p_MapName, p_GameModeName)
end

function MapEditorClient:OnLoaded()
	WebUI:Init()
	WebUI:Show()
end

function MapEditorClient:OnExtensionUnloading()
	--Editor:OnExtensionUnloading() -- TODO: this was never implemented?
end

function MapEditorClient:OnPartitionLoaded(p_Partition)
	InstanceParser:OnPartitionLoaded(p_Partition)
	EditorCommon:OnPartitionLoaded(p_Partition)
end

function MapEditorClient:OnEngineMessage(p_Message)
	ClientTransactionManager:OnEngineMessage(p_Message)
	Editor:OnEngineMessage(p_Message)
end

function MapEditorClient:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	UIManager:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
end

function MapEditorClient:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
	FreeCam:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
end

function MapEditorClient:OnUpdateInput(p_Delta)
	FreeCam:OnUpdateInput(p_Delta)
	UIManager:OnUpdateInput(p_Delta)
end

function MapEditorClient:OnUpdatePass(p_Delta, p_Pass)
	ClientTransactionManager:OnUpdatePass(p_Delta, p_Pass)
end

function MapEditorClient:OnDrawHud()
	Editor:OnDrawHud()
end

function MapEditorClient:OnLevelDestroy()
	print("Destroy!")
	GameObjectManager:OnLevelDestroy()
end

function MapEditorClient:OnEntityCreate(p_Hook, p_Data, p_Transform)
	EditorCommon:OnEntityCreate(p_Hook, p_Data, p_Transform)
end

function MapEditorClient:OnLoadBundles(p_Hook, p_Bundles, p_Compartment)
	EditorCommon:OnLoadBundles(p_Hook, p_Bundles, p_Compartment, Editor.m_CurrentProjectHeader)
end

function MapEditorClient:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
	GameObjectManager:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
end

----------- Editor functions----------------

function MapEditorClient:OnSendCommandsToServer(p_CommandsJson)
	ClientTransactionManager:OnSendCommandsToServer(p_CommandsJson)
end

function MapEditorClient:OnReceiveMessages(p_Messages)
	ClientTransactionManager:OnReceiveMessages(p_Messages)
end

function MapEditorClient:OnReceiveProjectData(p_ProjectData)
	-- TODO: Handle properly in the project admin view
end

function MapEditorClient:OnReceiveCurrentProjectHeader(p_ProjectHeader)
	-- TODO: set project header
end

----------- WebUI functions----------------

function MapEditorClient:OnUIReloaded()
	Editor:InitializeUIData(ClientTransactionManager:GetExecutedCommandActions())
end

function MapEditorClient:OnRequestProjectSave(p_ProjectSaveDataJson)
	local s_ProjectSaveData = DecodeParams(json.decode(p_ProjectSaveDataJson))
	NetEvents:SendLocal("ProjectManager:RequestProjectSave", s_ProjectSaveData)
end

function MapEditorClient:OnRequestProjectLoad(p_ProjectName)
	m_Logger:Write("Load requested: " .. p_ProjectName)
	NetEvents:SendLocal("ProjectManager:RequestProjectLoad", p_ProjectName)
end

function MapEditorClient:OnRequestProjectDelete(p_ProjectName)
	m_Logger:Write("Delete requested: " .. p_ProjectName)
	NetEvents:SendLocal("ProjectManager:RequestProjectDelete", p_ProjectName)
end

function MapEditorClient:OnRequestProjectData(p_ProjectName)
	m_Logger:Write("Project Data requested: " .. p_ProjectName)
	NetEvents:SendLocal("ProjectManager:RequestProjectData", p_ProjectName)
end

function MapEditorClient:OnEnableFreeCamMovement()
	UIManager:OnEnableFreeCamMovement()
	FreeCam:OnEnableFreeCamMovement()
end

function MapEditorClient:OnDisableFreeCam()
	UIManager:OnDisableFreeCam()
end

function MapEditorClient:OnCameraControlStart()
	FreeCam:OnControlStart()
end

function MapEditorClient:OnCameraControlEnd()
	FreeCam:OnControlEnd()
end

function MapEditorClient:OnCameraControlUpdate(p_TransformJson)
	local s_Transform = DecodeParams(json.decode(p_TransformJson))
	FreeCam:OnControlUpdate(s_Transform.transform)
end

return MapEditorClient()
