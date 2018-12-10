class 'MapEditorClient'

require "__shared/ObjectManager"
require "__shared/Backend"

local m_Freecam = require "Freecam"
local m_Editor = require "Editor"
local m_UIManager = require "UIManager"
local m_InstanceParser = require "InstanceParser"

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
	Events:Subscribe('ExtensionLoaded', self, self.OnLoaded)
	Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
	Events:Subscribe('Engine:Update', self, self.OnUpdate)
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)

	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)

	Hooks:Install('Input:PreUpdate', 200, self, self.OnUpdateInputHook)

	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)


	-- WebUI events
    Events:Subscribe('MapEditor:SendToServer', self, self.OnSendToServer)
    NetEvents:Subscribe('MapEditor:ReceiveCommand', self, self.OnReceiveCommand)
	Events:Subscribe('MapEditor:ReceiveCommand', self, self.OnReceiveCommand)
	Events:Subscribe('MapEditor:ReceiveMessage', self, self.OnReceiveMessage)

	Events:Subscribe('MapEditor:EnableFreecamMovement', self, self.OnEnableFreecamMovement)
	Events:Subscribe('MapEditor:DisableFreecam', self, self.OnDisableFreecam)


end

----------- Game functions----------------

function MapEditorClient:OnUpdate(p_Delta, p_SimulationDelta)
	m_Editor:OnUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorClient:OnLoaded()
	WebUI:Init()
	WebUI:Show()
end
function MapEditorClient:OnPartitionLoaded(p_Partition)
	m_InstanceParser:OnPartitionLoaded(p_Partition)
end

function MapEditorClient:OnEngineMessage(p_Message) 
	m_Editor:OnEngineMessage(p_Message) 
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
----------- WebUI functions----------------


function MapEditorClient:OnEnableFreecamMovement()
	m_UIManager:OnEnableFreecamMovement()
end

function MapEditorClient:OnDisableFreecam()
	m_UIManager:OnDisableFreecam()
end

return MapEditorClient()