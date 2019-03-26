class 'MapEditorClient'

local m_Freecam = require "Freecam"
local m_Editor = require "Editor"
local m_UIManager = require "UIManager"

ObjectManager = ObjectManager(Realm.Realm_Client)
Backend = Backend(Realm.Realm_Client)


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
	NetEvents:Subscribe('MapEditor:ReceiveCommand', self, self.OnReceiveCommand)
	NetEvents:Subscribe('MapEditorClient:ReceiveUpdate', self, self.OnReceiveUpdate)

	-- WebUI events
	Events:Subscribe('MapEditor:SendToServer', self, self.OnSendToServer)
	Events:Subscribe('MapEditor:ReceiveCommand', self, self.OnReceiveCommand)
	Events:Subscribe('MapEditor:ReceiveMessage', self, self.OnReceiveMessage)

	Events:Subscribe('MapEditor:EnableFreecamMovement', self, self.OnEnableFreecamMovement)
	Events:Subscribe('MapEditor:DisableFreecam', self, self.OnDisableFreecam)

    Hooks:Install('Input:PreUpdate', 200, self, self.OnUpdateInputHook)
    Hooks:Install('UI:PushScreen', 999, self, self.OnPushScreen)
    Hooks:Install('ClientEntityFactory:Create',999, self, self.OnEntityCreate)

    Hooks:Install('ClientEntityFactory:CreateFromBlueprint', 999, self, self.OnEntityCreateFromBlueprint)


end

----------- Game functions----------------

function MapEditorClient:OnUpdate(p_Delta, p_SimulationDelta)
	m_Editor:OnUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorClient:OnLevelLoaded(p_MapName, p_GameModeName)
	m_Editor:OnLevelLoaded(p_MapName, p_GameModeName)
end

function MapEditorClient:OnLoaded()
	WebUI:Init()
	WebUI:Show()
end
function MapEditorClient:OnPartitionLoaded(p_Partition)
	m_Editor:OnPartitionLoaded(p_Partition)
end

function MapEditorClient:OnEngineMessage(p_Message) 
	m_Editor:OnEngineMessage(p_Message) 
end
function MapEditorClient:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	m_UIManager:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
end
function MapEditorClient:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
	m_Freecam:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
end

function MapEditorClient:OnUpdateInput(p_Delta)
	m_Freecam:OnUpdateInput(p_Delta)
	m_UIManager:OnUpdateInput(p_Delta)
end
function MapEditorClient:OnUpdatePass(p_Delta, p_Pass)
	m_Editor:OnUpdatePass(p_Delta, p_Pass)
end
function MapEditorClient:OnLevelDestroy()
	print("Destroy!")
	Backend:OnLevelDestroy()
end

function MapEditorClient:OnEntityCreate(p_Hook, p_Data, p_Transform)
    m_Editor:OnEntityCreate(p_Hook, p_Data, p_Transform)
end
function MapEditorClient:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
    m_Editor:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
end

----------- Editor functions----------------
function MapEditorClient:OnSendToServer(p_Command)
	m_Editor:OnSendToServer(p_Command)
end
function MapEditorClient:OnReceiveCommand(p_Command)
	m_Editor:OnReceiveCommand(p_Command)
end
function MapEditorClient:OnReceiveMessage(p_Message)
	m_Editor:OnReceiveMessage(p_Message)
end

function MapEditorClient:OnReceiveUpdate(p_Update)
	m_Editor:OnReceiveUpdate(p_Update)
end

----------- WebUI functions----------------


function MapEditorClient:OnEnableFreecamMovement()
	m_UIManager:OnEnableFreecamMovement()
end

function MapEditorClient:OnDisableFreecam()
	m_UIManager:OnDisableFreecam()
end

return MapEditorClient()