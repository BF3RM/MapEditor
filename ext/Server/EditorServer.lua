class 'EditorServer'

local m_Logger = Logger("EditorServer", true)

local m_IsLevelLoaded = false
local m_LoadDelay = 0

function EditorServer:__init()
	m_Logger:Write("Initializing EditorServer")
	self:RegisterVars()
end

function EditorServer:RegisterVars()
	self.m_PendingRaycast = false
	self.m_Queue = {};

	self.m_Transactions = {}
	self.m_GameObjectTransferDatas = {}
	self.m_CurrentProjectHeader = nil -- dont reset this, is required info for map restart
	self.m_MapName = nil
end

function EditorServer:OnRequestUpdate(p_Player, p_TransactionId)

	local s_TransactionId = p_TransactionId
	local s_UpdatedGameObjectTransferDatas = {}

	while (s_TransactionId <= #self.m_Transactions) do
		local s_Guid = self.m_Transactions[s_TransactionId]
		if(s_Guid ~= nil) then
			s_UpdatedGameObjectTransferDatas[s_Guid] = self.m_GameObjectTransferDatas[s_Guid]
			s_TransactionId = s_TransactionId + 1
		else
			m_Logger:Write("Shit's nil")
		end
	end

	NetEvents:SendToLocal("MapEditorClient:ReceiveUpdate", p_Player, s_UpdatedGameObjectTransferDatas)
end

function EditorServer:OnRequestProjectHeaderUpdate(p_Player)
	self:UpdateClientProjectHeader(p_Player)
end

function EditorServer:UpdateClientProjectHeader(p_Player)
	if self.m_CurrentProjectHeader ~= nil then
		if p_Player == nil then -- update all players
			NetEvents:SendLocal("MapEditorClient:ReceiveCurrentProjectHeader", self.m_CurrentProjectHeader)
		else
			NetEvents:SendToLocal("MapEditorClient:ReceiveCurrentProjectHeader", p_Player, self.m_CurrentProjectHeader)
		end
	end
end

function EditorServer:OnRequestProjectData(p_Player, p_ProjectName)
	m_Logger:Write("Data requested: " .. p_ProjectName)

	local s_ProjectDataJson = DataBaseManager:GetProjectDataByProjectName(p_ProjectName)

	NetEvents:SendToLocal("MapEditorClient:ReceiveProjectData", p_Player, s_ProjectDataJson)
end

function EditorServer:OnRequestProjectLoad(p_Player, p_ProjectName)
	m_Logger:Write("Load requested: " .. p_ProjectName)
	-- TODO: check player's permission once that is implemented

	self.m_CurrentProjectHeader = DataBaseManager:GetProjectHeader(p_ProjectName)
	self:UpdateClientProjectHeader()

	-- TODO: Check if we need to delay the restart to ensure all clients have properly updated headers. Would be nice to show a 'Loading Project' screen too (?)
	-- Invoke Restart

	RCON:SendCommand('mapList.clear')
	RCON:SendCommand('mapList.add ' .. self.m_CurrentProjectHeader.mapName .. ' ' .. self.m_CurrentProjectHeader.gameModeName .. ' 1') -- TODO: add proper map / gameplay support
	RCON:SendCommand('mapList.runNextRound')
end

function EditorServer:OnRequestProjectSave(p_Player, p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundles)
	m_Logger:Write("Save requested: " .. p_ProjectName)

	-- TODO: check player's permission once that is implemented

	local s_GameObjectSaveDatas = {}

	-- TODO: get the GameObjectSaveDatas not from the transferdatas array, but from the GO array of the GOManager. (remove the GOTD array)
	for l_Guid, l_GameObjectTransferData in pairs(self.m_GameObjectTransferDatas) do
		s_GameObjectSaveDatas[l_Guid] = GameObjectSaveData(l_GameObjectTransferData):GetAsTable()
	end

	DataBaseManager:SaveProject(p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundles, s_GameObjectSaveDatas)
end

function EditorServer:OnRequestProjectDelete(p_ProjectName)
	m_Logger:Write("Delete requested: " .. p_ProjectName)

	DataBaseManager:DeleteProject(p_ProjectName)
end

--function EditorServer:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
--    --Avoid nested blueprints for now...
--	VanillaBlueprintsParser:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
--end

function EditorServer:OnReceiveCommands(p_Player, p_Commands, p_UpdatePass)
	local s_CommandActionResults = {}
	for _, l_Command in ipairs(p_Commands) do

		local s_CommandAction = CommandActions[l_Command.type]

		if (s_CommandAction == nil) then
			m_Logger:Error("Attempted to call a nil command action: " .. l_Command.type)
			return false
		end

		local s_CommandActionResult, s_ActionResultType = s_CommandAction(self, l_Command, p_UpdatePass)

		if (s_ActionResultType == ActionResultType.Success) then
			if (s_CommandActionResult.gameObjectTransferData == nil) then
				m_Logger:Error("There must be a gameObjectTransferData defined for sending back the CommandActionResult.")
			end

			local s_GameObjectTransferData = s_CommandActionResult.gameObjectTransferData
			table.insert(s_CommandActionResults, s_CommandActionResult)

			local s_Guid = s_GameObjectTransferData.guid
			self.m_GameObjectTransferDatas[s_Guid] = MergeGameObjectTransferData(self.m_GameObjectTransferDatas[s_Guid], s_GameObjectTransferData) -- overwrite our table with gameObjectTransferDatas so we have the current most version

			table.insert(self.m_Transactions, s_Guid) -- Store that this transaction has happened.

		elseif (s_ActionResultType == ActionResultType.Queue) then
			m_Logger:Write("Queued command: " .. l_Command.type)
			table.insert(self.m_Queue, l_Command)

		elseif (s_ActionResultType == ActionResultType.Failure) then
			-- TODO: Handle errors
			m_Logger:Warning("Failed to execute command: " .. l_Command.type)
		else
			m_Logger:Error("Unknown CommandActionResultType for command: " .. l_Command.type)
		end
	end
    -- m_Logger:Write(json.encode(self.m_GameObjects))
	if (#s_CommandActionResults > 0) then
		NetEvents:BroadcastLocal('MapEditor:ReceiveCommand', json.encode(p_Commands))
	end
end

function EditorServer:OnGameObjectReady(p_GameObject)
	m_Logger:Write("Editor:OnGameObjectReady(p_GameObject)")
	local s_GameObjectTransferData = p_GameObject:GetGameObjectTransferData()
	local s_Guid = s_GameObjectTransferData.guid
	self.m_GameObjectTransferDatas[s_Guid] = MergeGameObjectTransferData(self.m_GameObjectTransferDatas[s_Guid], s_GameObjectTransferData)
	-- TODO: xD
end

function EditorServer:OnUpdatePass(p_Delta, p_Pass)
	-- TODO: ugly, find a better entry point to invoke project data loading
	if m_IsLevelLoaded == true and self.m_CurrentProjectHeader ~= nil then
		m_LoadDelay = m_LoadDelay + p_Delta

		if m_LoadDelay > 10 and
			self.m_CurrentProjectHeader.projectName ~= nil then

			m_IsLevelLoaded = false
			m_LoadDelay = 0
			
			if self.m_MapName ~= self.m_CurrentProjectHeader.mapName then
				m_Logger:Error("Cant load project that is not built for the same map as current one.")
			end

			-- Load User Data from Database
			local s_ProjectData = DataBaseManager:GetProjectDataByProjectName(self.m_CurrentProjectHeader.projectName)
			--self:UpdateLevelFromOldSaveFile(s_SaveFile)
			self:UpdateLevelFromSaveFile(s_ProjectData)
		end
	end

	if(p_Pass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0) then
		return
	end

	local s_QueuedCommands = {}

	for _,l_Command in ipairs(self.m_Queue) do
		m_Logger:Write("Executing command delayed: " .. l_Command.type)
		table.insert(s_QueuedCommands, l_Command)
	end

	self:OnReceiveCommands(nil, s_QueuedCommands, p_Pass)

	if(#self.m_Queue > 0) then
		self.m_Queue = {}
	end
end

function EditorServer:OnLevelLoaded(p_Map, p_GameMode, p_Round)
	m_IsLevelLoaded = true

	self.m_MapName = p_Map
end

function EditorServer:UpdateLevelFromSaveFile(p_SaveData)
	local s_SaveFileCommands = {}

	for l_Guid, l_GameObjectSaveData in pairs(p_SaveData) do
		if (self.m_GameObjectTransferDatas[l_Guid] == nil) then
			local s_Command

			--If it's a vanilla object we move it or we delete it. If not we spawn a new object.
			if IsVanilla(l_Guid) then
                if l_GameObjectSaveData.isDeleted then
					s_Command = {
						sender = "LoadingSaveFile",
						type = "DestroyBlueprintCommand",
						gameObjectTransferData = {
							guid = l_Guid
						}
					}
				else
					s_Command = {
						sender = "LoadingSaveFile",
						type = "SetTransformCommand",
						gameObjectTransferData = {
							guid = l_Guid,
							transform = l_GameObjectSaveData.transform
						}
					}
				end

				table.insert(s_SaveFileCommands, s_Command)
			else
				s_Command = {
					guid = l_Guid,
					sender = "LoadingSaveFile",
					type = "SpawnBlueprintCommand",
					gameObjectTransferData = {
						guid = l_Guid,
						name = l_GameObjectSaveData.name,
						typeName = l_GameObjectSaveData.typeName,
						blueprintCtrRef = l_GameObjectSaveData.blueprintCtrRef,
						parentData = l_GameObjectSaveData.parentData,
						transform = l_GameObjectSaveData.transform,
						variation = l_GameObjectSaveData.variation,
						gameEntities = {},
						isEnabled = l_GameObjectSaveData.isEnabled or true,
						isDeleted = l_GameObjectSaveData.isDeleted or false
					}
				}

				table.insert(s_SaveFileCommands, s_Command)
			end
		else
			local s_Changes = GetChanges(GameObjectSaveData(self.m_GameObjectTransferDatas[l_Guid]), l_GameObjectSaveData)
			-- Hopefully this will never happen. It's hard to test these changes since they require a desync.
			if(#s_Changes > 0) then
				m_Logger:Write("--------------------------------------------------------------------")
				m_Logger:Write("If you ever see this, please report it on the repo.")
				print(s_Changes) -- logger wont print the table, we have to use print
				m_Logger:Write("--------------------------------------------------------------------")
			end
		end
	end

	self:OnReceiveCommands(nil, s_SaveFileCommands, true)
end

function EditorServer:UpdateLevelFromOldSaveFile(p_SaveFile)
	local s_SaveFileCommands = {}

	for l_Guid, l_GameObjectSaveData in pairs(p_SaveFile) do
		if (self.m_GameObjectTransferDatas[l_Guid] == nil) then
			local s_Command

			--If it's a vanilla object we move it or we delete it. If not we spawn a new object.
			if IsVanilla(l_Guid) then
				if l_GameObjectSaveData.isDeleted then
					s_Command = {
						sender = "LoadingSaveFile",
						type = "DestroyBlueprintCommand",
						gameObjectTransferData = {
							guid = l_Guid
						}
					}
				else
					s_Command = {
						sender = "LoadingSaveFile",
						type = "SetTransformCommand",
						gameObjectTransferData = {
							guid = l_Guid,
							transform = l_GameObjectSaveData.transform
						}
					}
				end

				table.insert(s_SaveFileCommands, s_Command)
			else
				s_Command = {
					guid = l_Guid,
					sender = "LoadingSaveFile",
					type = "SpawnBlueprintCommand",
					gameObjectTransferData = {
						guid = l_Guid,
						name = l_GameObjectSaveData.name,
						typeName = l_GameObjectSaveData.reference.typeName,
						blueprintCtrRef = CtrRef {
							typeName = l_GameObjectSaveData.reference.typeName,
							name = l_GameObjectSaveData.reference.name,
							partitionGuid = l_GameObjectSaveData.reference.partitionGuid,
							instanceGuid = l_GameObjectSaveData.reference.instanceGuid
						},
						parentData = GameObjectParentData{guid = "root"},
						transform = l_GameObjectSaveData.transform,
						variation = l_GameObjectSaveData.variation,
						gameEntities = l_GameObjectSaveData.gameEntities or {},
						isEnabled = l_GameObjectSaveData.isEnabled or true,
						isDeleted = l_GameObjectSaveData.isDeleted or false
					}
				}

				table.insert(s_SaveFileCommands, s_Command)
			end
		else
			local s_Changes = GetChanges(GameObjectSaveData(self.m_GameObjectTransferDatas[l_Guid]), l_GameObjectSaveData)
			-- Hopefully this will never happen. It's hard to test these changes since they require a desync.
			if(#s_Changes > 0) then
				m_Logger:Write("--------------------------------------------------------------------")
				m_Logger:Write("If you ever see this, please report it on the repo.")
				m_Logger:Write(s_Changes)
				m_Logger:Write("--------------------------------------------------------------------")
			end
		end
	end

	self:OnReceiveCommands(nil, s_SaveFileCommands, true)
end

return EditorServer()