class 'MapEditorClient'

local m_Freecam = require "Freecam"
local m_Editor = require "Editor"
local m_UIManager = require "UIManager"
local m_InstanceParser = require "__shared/InstanceParser"

function MapEditorClient:__init()
	print("Initializing MapEditorClient")
	self:RegisterVars()
	self:RegisterEvents()
end

function MapEditorClient:RegisterVars()

end

function MapEditorClient:RegisterEvents()
	--Game events
	self.m_OnUpdateInputEvent = Events:Subscribe('Client:UpdateInput', self, self.OnUpdateInput)
	self.m_ExtensionLoadedEvent = Events:Subscribe('ExtensionLoaded', self, self.OnLoaded)
	self.m_EngineMessageEvent = Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
	self.m_EngineUpdateEvent = Events:Subscribe('Engine:Update', self, self.OnUpdate)
	self.m_InputPreUpdateHook = Hooks:Install('Input:PreUpdate', 200, self, self.OnUpdateInputHook)

	-- WebUI events
	Events:Subscribe('Editor:SpawnBlueprint', self, self.OnSpawnBlueprint)
end

----------- Game functions----------------

function MapEditorClient:OnUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorClient:OnLoaded()
	WebUI:Init()
	WebUI:Show()
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

----------- WebUI functions----------------

function MapEditorClient:OnSpawnBlueprint(p_JSONparams)
	m_Editor:OnSpawnBlueprint(p_JSONparams)
end

return MapEditorClient()