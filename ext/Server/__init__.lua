class 'MapEditorServer'

require "__shared/Util"
require "__shared/ObjectManager"
require "__shared/Backend"
local m_InstanceParser = require "InstanceParser"

ObjectManager = ObjectManager(Realm.Realm_ClientAndServer)
Backend = Backend(Realm.Realm_ClientAndServer)
local m_EditorServer = require "EditorServer"

function MapEditorServer:__init()
	print("Initializing MapEditorServer")
	self:RegisterEvents()
end

function MapEditorServer:RegisterEvents()
	NetEvents:Subscribe('EnableInputRestriction', self, self.OnEnableInputRestriction)
	NetEvents:Subscribe('DisableInputRestriction', self, self.OnDisableInputRestriction)

	NetEvents:Subscribe('MapEditorServer:ReceiveCommand', self, self.OnReceiveCommand)

	NetEvents:Subscribe('MapEditorServer:RequestUpdate', self, self.OnRequestUpdate)

	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
    Events:Subscribe('Server:LevelLoaded', self, self.onLevelLoaded)
    Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)

    Hooks:Install('ServerEntityFactory:CreateFromBlueprint', 999, self, self.OnEntityCreateFromBlueprint)


end

function MapEditorServer:OnUpdatePass(p_Delta, p_Pass)
	m_EditorServer:OnUpdatePass(p_Delta, p_Pass)
end

function MapEditorServer:OnReceiveCommand(p_Player, p_Command)
	m_EditorServer:OnReceiveCommand(p_Player, p_Command)
end

function MapEditorServer:OnRequestUpdate(p_Player, p_TransactionId)
	m_EditorServer:OnRequestUpdate(p_Player, p_TransactionId)
end

function MapEditorServer:OnLevelDestroy()
	print("Destroy!")
	Backend:OnLevelDestroy()
end

function MapEditorServer:onLevelLoaded(p_Message)
    m_EditorServer:OnLevelLoaded(p_Message)
end

function MapEditorServer:OnEnableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, false)
end

function MapEditorServer:OnDisableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, true)
end

function MapEditorServer:SetInputRestriction(p_Player, p_Enabled)
	for i=0, 125 do
		p_Player:EnableInput(i, p_Enabled)
	end
end

function MapEditorServer:OnPartitionLoaded(p_Partition)
    m_InstanceParser:OnPartitionLoaded(p_Partition)
end

function MapEditorServer:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
    --m_EditorServer:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
end


return MapEditorServer()