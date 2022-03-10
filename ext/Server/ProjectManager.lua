---@class ProjectManager
ProjectManager = class 'ProjectManager'

local m_Logger = Logger("ProjectManager", false)
local m_IsLevelLoaded = false
local m_LoadDelay = 0
local m_SuperBundles = {
	["levels/coop_002/coop_002"] = true,
	["levels/coop_003/coop_003"] = true,
	["levels/coop_006/coop_006"] = true,
	["levels/coop_007/coop_007"] = true,
	["levels/coop_009/coop_009 "] = true,
	["levels/coop_010/coop_010"] = true,
	["levels/mp_001/mp_001"] = true,
	["levels/mp_003/mp_003"] = true,
	["levels/mp_007/mp_007"] = true,
	["levels/mp_011/mp_011"] = true,
	["levels/mp_012/mp_012"] = true,
	["levels/mp_013/mp_013"] = true,
	["levels/mp_017/mp_017"] = true,
	["levels/mp_018/mp_018"] = true,
	["levels/mp_subway/mp_subway"] = true,
	["levels/sp_bank/sp_bank"] = true,
	["levels/sp_earthquake/sp_earthquake"] = true,
	["levels/sp_earthquake2/sp_earthquake2"] = true,
	["levels/sp_finale/sp_finale"] = true,
	["levels/sp_jet/sp_jet"] = true,
	["levels/sp_new_york/sp_new_york"] = true,
	["levels/sp_paris/sp_paris"] = true,
	["levels/sp_sniper/sp_sniper"] = true,
	["levels/sp_tank/sp_tank"] = true,
	["levels/sp_tank_b/sp_tank_b"] = true,
	["levels/sp_valley/sp_valley"] = true,
	["levels/sp_villa/sp_villa"] = true,
	["levels/xp1_001/xp1_001"] = true,
	["levels/xp1_002/xp1_002"] = true,
	["levels/xp1_003/xp1_003"] = true,
	["levels/xp1_004/xp1_004"] = true,
	["levels/xp2_factory/xp2_factory"] = true,
	["levels/xp2_office/xp2_office"] = true,
	["levels/xp2_palace/xp2_palace"] = true,
	["levels/xp2_skybar/xp2_skybar"] = true,
	["levels/xp3_alborz/xp3_alborz"] = true,
	["levels/xp3_desert/xp3_desert"] = true,
	["levels/xp3_shield/xp3_shield"] = true,
	["levels/xp3_valley/xp3_valley"] = true,
	["levels/xp4_fd/xp4_fd"] = true,
	["levels/xp4_parl/xp4_parl"] = true,
	["levels/xp4_quake/xp4_quake"] = true,
	["levels/xp4_rubble/xp4_rubble"] = true,
	["levels/xp5_001/xp5_001"] = true,
	["levels/xp5_002/xp5_002"] = true,
	["levels/xp5_003/xp5_003"] = true,
	["levels/xp5_004/xp5_004"] = true
}


function ProjectManager:__init()
	m_Logger:Write("Initializing ProjectManager")

	self.m_CurrentProjectHeader = nil -- dont reset this, is required info for map restart
	self:RegisterVars()
	self:RegisterEvents()
end

function ProjectManager:RegisterVars()
	self.m_MapName = nil
	self.m_GameMode = nil
	self.m_LoadedBundles = {}
	self.m_LoadedSuperBundles = {}
end

function ProjectManager:RegisterEvents()
	NetEvents:Subscribe('ProjectManager:RequestProjectHeaders', self, self.OnRequestProjectHeaders)
	NetEvents:Subscribe('ProjectManager:RequestProjectHeaderUpdate', self, self.UpdateClientProjectHeader)
	NetEvents:Subscribe('ProjectManager:RequestProjectData', self, self.OnRequestProjectData)
	NetEvents:Subscribe('ProjectManager:RequestProjectSave', self, self.OnRequestProjectSave)
	NetEvents:Subscribe('ProjectManager:RequestProjectLoad', self, self.OnRequestProjectLoad)
	NetEvents:Subscribe('ProjectManager:RequestProjectDelete', self, self.OnRequestProjectDelete)
	NetEvents:Subscribe('ProjectManager:RequestProjectImport', self, self.OnRequestProjectImport)
end

function ProjectManager:OnLoadBundles(p_Bundles, p_Compartment)
	if not self:IsLevelBundle(p_Bundles) then
		return
	end

	for _, l_Bundle in pairs(p_Bundles) do
		if l_Bundle ~= SharedUtils:GetLevelName() then
			if l_Bundle:match("xp1_") then
				self.m_LoadedSuperBundles["xp1chunks"] = true
			elseif l_Bundle:match("xp2_") then
				self.m_LoadedSuperBundles["xp2chunks"] = true
			elseif l_Bundle:match("xp3_") then
				self.m_LoadedSuperBundles["xp3chunks"] = true
			elseif l_Bundle:match("xp4_") then
				self.m_LoadedSuperBundles["xp4chunks"] = true
			elseif l_Bundle:match("xp5_") then
				self.m_LoadedSuperBundles["xp5chunks"] = true
			elseif l_Bundle:match("coop_") or l_Bundle:match("sp_") then
				self.m_LoadedSuperBundles["spchunks"] = true
			end

			if m_SuperBundles[l_Bundle] ~= nil then
				self.m_LoadedSuperBundles[l_Bundle] = true
			end

			self.m_LoadedBundles[l_Bundle] = true
		end
	end

	local s_Bundle = SharedUtils:GetLevelName()

	if s_Bundle:match("xp1_") then
		self.m_LoadedSuperBundles["xp1chunks"] = nil
	elseif s_Bundle:match("xp2_") then
		self.m_LoadedSuperBundles["xp2chunks"] = nil
	elseif s_Bundle:match("xp3_") then
		self.m_LoadedSuperBundles["xp3chunks"] = nil
	elseif s_Bundle:match("xp4_") then
		self.m_LoadedSuperBundles["xp4chunks"] = nil
	elseif s_Bundle:match("xp5_") then
		self.m_LoadedSuperBundles["xp5chunks"] = nil
	elseif s_Bundle:match("coop_") or s_Bundle:match("sp_") then
		self.m_LoadedSuperBundles["spchunks"] = nil
		self.m_LoadedSuperBundles["mpchunks"] = true
	end
end


function ProjectManager:IsLevelBundle(p_Bundles)
	for _, l_Bundle in pairs(p_Bundles) do
		if l_Bundle == SharedUtils:GetLevelName() then
			return true
		end
	end

	return false
end

function ProjectManager:OnRequestProjectHeaders(p_Player)
	if p_Player == nil then -- update all players
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
		self:UpdateClientProjectHeader(nil)
	else
		NetEvents:SendToLocal("MapEditorClient:ReceiveProjectHeaders", p_Player, DataBaseManager:GetProjectHeaders())
		self:UpdateClientProjectHeader(p_Player)
	end
end

function ProjectManager:OnLevelDestroy()
	m_IsLevelLoaded = false
end

function ProjectManager:UpdateClientProjectHeader(p_Player)
	if self.m_CurrentProjectHeader == nil then
		self.m_CurrentProjectHeader = {
			projectName = 'Untitled Project',
			mapName = self.m_MapName,
			gameModeName = self.m_GameMode,
			requiredBundles = self.m_LoadedBundles
		}
	end

	if p_Player == nil then -- update all players
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveCurrentProjectHeader", self.m_CurrentProjectHeader)
	else
		NetEvents:SendToLocal("MapEditorClient:ReceiveCurrentProjectHeader", p_Player, self.m_CurrentProjectHeader)
	end
end

function ProjectManager:OnRequestProjectData(p_Player, p_ProjectId)
	m_Logger:Write("Data requested: " .. p_ProjectId)

	local s_ProjectData = DataBaseManager:GetProjectByProjectId(p_ProjectId)

	NetEvents:SendToLocal("MapEditorClient:ReceiveProjectData", p_Player, s_ProjectData)
end

function ProjectManager:OnRequestProjectDelete(p_Player, p_ProjectId)
	m_Logger:Write("Delete requested: " .. p_ProjectId)

	--TODO: if the project that gets deleted is the currently loaded project, we need to clear all data and reload an empty map.
	local s_Success = DataBaseManager:DeleteProject(p_ProjectId)

	if s_Success then
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
	end
end

function ProjectManager:OnRequestProjectImport(p_Player, p_ProjectDataJSON)
	m_Logger:Write("Import requested")

	local s_Success, s_Msg = DataBaseManager:ImportProject(p_ProjectDataJSON)

	if s_Success then
		m_Logger:Write('Correctly imported save file')
		-- Update clients with new save.
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
	else
		m_Logger:Write('Error importing save file: '..s_Msg)
	end

	s_Msg = s_Msg or 'Successfully imported save file.'

	NetEvents:SendToLocal("MapEditorClient:ProjectImportFinished", p_Player, s_Msg)
end

function ProjectManager:OnLevelLoaded(p_Map, p_GameMode, p_Round)
	m_IsLevelLoaded = true

	self.m_MapName = p_Map
	self.m_GameMode = p_GameMode
end

function ProjectManager:OnUpdatePass(p_Delta, p_Pass)
	-- TODO: ugly, find a better entry point to invoke project data loading
	if m_IsLevelLoaded == true and self.m_CurrentProjectHeader ~= nil and self.m_CurrentProjectHeader.id ~= nil then
		m_LoadDelay = m_LoadDelay + p_Delta

		if m_LoadDelay > ME_CONFIG.SAVE_LOAD_DELAY and self.m_CurrentProjectHeader.projectName ~= nil then
			m_IsLevelLoaded = false
			m_LoadDelay = 0

			if self.m_MapName ~= self.m_CurrentProjectHeader.mapName then
				m_Logger:Error("Cant load project that is not built for the same map as current one.")
				return
			end

			-- Load User Data from Database
			local s_ProjectSaveData = DataBaseManager:GetProjectDataByProjectId(self.m_CurrentProjectHeader.id)
			--self:UpdateLevelFromOldSaveFile(s_SaveFile)
			self:CreateAndExecuteImitationCommands(s_ProjectSaveData)
		end
	end
end

function ProjectManager:OnRequestProjectLoad(p_Player, p_ProjectId)
	m_Logger:Write("Load requested: " .. p_ProjectId)
	-- TODO: check player's permission once that is implemented

	local s_Project = DataBaseManager:GetProjectByProjectId(p_ProjectId)

	if s_Project == nil then
		m_Logger:Error('Failed to get project with id '..tostring(p_ProjectId))
		return
	end

	self.m_CurrentProjectHeader = s_Project.header

	local s_MapName = s_Project.header.mapName
	local s_GameModeName = s_Project.header.gameModeName

	if s_MapName == nil or
			Maps[s_MapName] == nil or
			s_GameModeName == nil or
			GameModes[s_GameModeName] == nil then

		m_Logger:Error("Failed to load project, one or more fields of the project header are not set: " .. s_MapName .. " | " .. s_GameModeName)
		return
	end

	self:UpdateClientProjectHeader(nil)

	-- TODO: Check if we need to delay the restart to ensure all clients have properly updated headers. Would be nice to show a 'Loading Project' screen too (?)
	-- Invoke Restart
	if self.m_MapName == s_MapName then
		--Events:Dispatch('MapLoader:LoadLevel', { header = s_Project.header, data = s_Project.data, vanillaOnly = true })
		RCON:SendCommand('mapList.restartRound')
	else
		local s_Response = RCON:SendCommand('mapList.clear')
		if s_Response[1] ~= 'OK' then
			m_Logger:Error('Couldn\'t clear maplist. ' .. s_Response[1])
			return
		end

		s_Response = RCON:SendCommand('mapList.add', {s_MapName, s_GameModeName, '1'}) -- TODO: add proper map / gameplay support
		if s_Response[1] ~= 'OK' then
			m_Logger:Error('Couldn\'t add map to maplist. ' .. s_Response[1])
		end

		s_Response = RCON:SendCommand('mapList.runNextRound')
		if s_Response[1] ~= 'OK' then
			m_Logger:Error('Couldn\'t run next round. ' .. s_Response[1])
		end
	end
end

function ProjectManager:OnRequestProjectSave(p_Player, p_ProjectSaveData)
	-- TODO: check player's permission once that is implemented
	self:SaveProjectCoroutine(p_ProjectSaveData)
end

function ProjectManager:SaveProjectCoroutine(p_ProjectSaveData)
	m_Logger:Write("Save requested: " .. p_ProjectSaveData.projectName)

	local s_GameObjectSaveDatas = {}
	local s_Count = 0

	-- TODO: get the GameObjectSaveDatas not from the transferdatas array, but from the GO array of the GOManager. (remove the GOTD array)
	for _, l_GameObject in pairs(GameObjectManager.m_GameObjects) do
		if l_GameObject:IsUserModified() == true or l_GameObject:HasOverrides() then
			s_Count = s_Count + 1
			table.insert(s_GameObjectSaveDatas, GameObjectSaveData(l_GameObject):GetAsTable())
		end
	end

	-- m_Logger:Write("vvvvvvvvvvvvvvvvv")
	-- m_Logger:Write("GameObjectSaveDatas: " .. count)
	-- for _, gameObjectSaveData in pairs(s_GameObjectSaveDatas) do
	-- 	m_Logger:Write(tostring(gameObjectSaveData.guid) .. " | " .. gameObjectSaveData.name)
	-- end
	-- m_Logger:Write(json.encode(s_GameObjectSaveDatas))
	-- m_Logger:Write("^^^^^^^^^^^^^^^^^")
	self.m_CurrentProjectHeader = {
		projectName = p_ProjectSaveData.projectName,
		mapName = self.m_MapName,
		gameModeName = self.m_GameMode,
		requiredBundles = self.m_LoadedBundles
	}
	local s_Success, s_Msg = DataBaseManager:SaveProject(p_ProjectSaveData.projectName, self.m_CurrentProjectHeader.mapName, self.m_CurrentProjectHeader.gameModeName, self.m_LoadedSuperBundles, self.m_LoadedBundles, self.m_CurrentProjectHeader.mapName, s_GameObjectSaveDatas)

	if s_Success then
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveCurrentProjectHeader", self.m_CurrentProjectHeader)
	else
		m_Logger:Error(s_Msg)
	end
end

-- we're creating commands from the savefile, basically imitating every step that has been undertaken
function ProjectManager:CreateAndExecuteImitationCommands(p_ProjectSaveData)
	local s_SaveFileCommands = {}

	for _, l_GameObjectSaveData in pairs(p_ProjectSaveData) do
		local s_Guid = l_GameObjectSaveData.guid

		--if (GameObjectManager.m_GameObjects[l_Guid] == nil) then
		--	m_Logger:Error("GameObject with Guid " .. tostring(l_Guid) .. " not found in GameObjectManager.")
		--end

		local s_Command

		-- Vanilla objects are handled in maploader
		if l_GameObjectSaveData.origin == GameObjectOriginType.Vanilla or
		l_GameObjectSaveData.isVanilla then -- Supports old savefiles
			if l_GameObjectSaveData.isDeleted then
				s_Command = {
					guid = s_Guid,
					sender = "LoadingSaveFile",
					type = CommandActionType.DeleteGameObjectCommand,
					gameObjectTransferData = {
						guid = s_Guid
					}
				}
			else
				s_Command = {
					guid = s_Guid,
					sender = "LoadingSaveFile",
					type = CommandActionType.SetTransformCommand,
					gameObjectTransferData = {
						guid = s_Guid,
						transform = l_GameObjectSaveData.transform
					}
				}
			end

			table.insert(s_SaveFileCommands, s_Command)
		elseif l_GameObjectSaveData.origin == GameObjectOriginType.CustomChild then
			-- TODO Fool: Handle custom objects' children, they should be handled after the parent is spawned
		else
			s_Command = {
				guid = s_Guid,
				sender = "LoadingSaveFile",
				type = CommandActionType.SpawnGameObjectCommand,
				gameObjectTransferData = { -- We're not using the actual type, i think its because of json serialization fuckups
					guid = s_Guid,
					name = l_GameObjectSaveData.name,
					blueprintCtrRef = l_GameObjectSaveData.blueprintCtrRef,
					parentData = l_GameObjectSaveData.parentData,
					transform = l_GameObjectSaveData.transform,
					variation = l_GameObjectSaveData.variation,
					gameEntities = {},
					isEnabled = l_GameObjectSaveData.isEnabled or true,
					isDeleted = l_GameObjectSaveData.isDeleted or false,
					overrides = l_GameObjectSaveData.overrides or nil
				}
			}

			table.insert(s_SaveFileCommands, s_Command)
		end
	end

	ServerTransactionManager:QueueCommands(s_SaveFileCommands)
end

return ProjectManager()
