class 'MapEditorServer'

local m_Logger = Logger("MapEditorServer", true)

EditorServer = require "EditorServer"
DataBaseManager = require "DataBaseManager"

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

	NetEvents:Subscribe('MapEditorServer:RequestProjectSave', self, self.OnRequestProjectSave)
	NetEvents:Subscribe('MapEditorServer:RequestProjectLoad', self, self.OnRequestProjectLoad)
	NetEvents:Subscribe('MapEditorServer:RequestProjectDelete', self, self.OnRequestProjectDelete)
	NetEvents:Subscribe('MapEditorServer:RequestProjectData', self, self.OnRequestProjectData)

	NetEvents:Subscribe('MapEditorServer:RequestUpdate', self, self.OnRequestUpdate)
	NetEvents:Subscribe('MapEditorServer:RequestProjectHeaderUpdate', self, self.OnRequestProjectHeaderUpdate)

	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
    Events:Subscribe('Server:LevelLoaded', self, self.OnLevelLoaded)
    Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
	Events:Subscribe('Player:Chat', self, self.OnChat)

	Events:Subscribe('GameObjectManager:GameObjectReady', self, self.OnGameObjectReady)

	Hooks:Install('ResourceManager:LoadBundles', 999, self, self.OnLoadBundles) 
    Hooks:Install('ServerEntityFactory:CreateFromBlueprint', 999, self, self.OnEntityCreateFromBlueprint)
end

----------- Debug ----------------

function string:split(sep)
	local sep, fields = sep or ":", {}
	local pattern = string.format("([^%s]+)", sep)
	self:gsub(pattern, function(c) fields[#fields+1] = c end)
	return fields
 end

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
		EditorServer:OnRequestProjectSave(p_Player, "DebugProject", "XP3_Shield", "ConquestLarge0", { "levels/mp_001/mp_001", "levels/mp_001/conquest" })
	end
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

function MapEditorServer:OnLoadBundles(p_Hook, p_Bundles, p_Compartment)
	EditorCommon:OnLoadBundles(p_Hook, p_Bundles, p_Compartment, EditorServer.m_CurrentProjectHeader)
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

function MapEditorServer:OnRequestProjectHeaderUpdate(p_Player)
	EditorServer:OnRequestProjectHeaderUpdate(p_Player)
end

function MapEditorServer:OnRequestProjectSave(p_Player, p_ProjectSaveData)
	EditorServer:OnRequestProjectSave(p_Player, p_ProjectSaveData)
end

function MapEditorServer:OnRequestProjectLoad(p_Player, p_ProjectName)
	EditorServer:OnRequestProjectLoad(p_Player, p_ProjectName)
end

function MapEditorServer:OnRequestProjectData(p_Player, p_ProjectName)
	EditorServer:OnRequestProjectData(p_Player, p_ProjectName)
end

function MapEditorServer:OnRequestProjectDelete(p_ProjectName)
	EditorServer:OnRequestProjectDelete(p_ProjectName)
end

function MapEditorServer:OnEnableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, false)
end

function MapEditorServer:OnDisableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, true)
end

return MapEditorServer()