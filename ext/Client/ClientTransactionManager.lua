---@class ClientTransactionManager
ClientTransactionManager = class 'ClientTransactionManager'

local m_Logger = Logger("ClientTransactionManager", false)

function ClientTransactionManager:__init()
	m_Logger:Write("Initializing ClientTransactionManager")

	self:RegisterVars()
	self:RegisterEvents()
end

function ClientTransactionManager:RegisterVars()
	self:ResetVars()
end

function ClientTransactionManager:ResetVars()
	self.m_Queue = {
		commands = {},
		messages = {}
	}

	self.m_IsPlayerReady = false
	self.m_TransactionId = 0
	self.m_CommandActionResults = {}
	self.m_ExecutedCommandActions = {}
end

function ClientTransactionManager:OnLevelDestroy()
	self:ResetVars()
end

function ClientTransactionManager:OnLoadResources()
	self:ResetVars()
end

function ClientTransactionManager:RegisterEvents()
	Events:Subscribe('GameObjectManager:GameObjectReady', self, self.OnGameObjectReady)
	Events:Subscribe('ClientGameObjectManager:UpdateGameObjectRealm', self, self.OnUpdateGameObjectRealm)

	NetEvents:Subscribe('ServerTransactionManager:CommandsInvoked', self, self.OnServerCommandsInvoked)
	NetEvents:Subscribe('ServerTransactionManager:SyncClientContext', self, self.OnSyncClientContext)
	NetEvents:Subscribe('ServerTransactionManager:ResetVars', self, self.ResetVars())
end

function ClientTransactionManager:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.CoreEnteredIngameMessage then
		self:ClientReady()
	end
end

function ClientTransactionManager:ClientReady()
	--- Client requests all updates that the server has.
	m_Logger:Write("Client READY")
	self.m_IsPlayerReady = true

	-- Debug
	if self.m_TransactionId ~= 0 then
		m_Logger:Warning('Some commands were executed before player was ready, should never happen')
	end

	NetEvents:SendLocal("ClientTransactionManager:ClientReady")
end

function ClientTransactionManager:OnLevelDestroy()
	self.m_TransactionId = 0
end

function ClientTransactionManager:OnSyncClientContext(p_TransferDatas, p_LastTransactionId)
	m_Logger:Write('Syncing client context')

	if p_LastTransactionId ~= nil and p_TransferDatas ~= nil then
		Events:DispatchLocal('UIManager:SyncingStart')
		self:UpdateTransactionId(p_LastTransactionId, true)
		self:SyncClientTransferDatas(p_TransferDatas)
	end

	Events:DispatchLocal('UIManager:LoadingComplete')
end

--- We're recreating commands that lead to the current state of the server, so the client's GameObjects and UI gets updated properly
--- Not a pretty solution, but the only way to avoid having a complicated command storing and updating logic on the server (which would probably still be better)
function ClientTransactionManager:SyncClientTransferDatas(p_UpdatedGameObjectTransferDatas)
	local s_Commands = {}

	for l_Guid, l_GameObjectTransferData in pairs(p_UpdatedGameObjectTransferDatas) do
		local s_Command
		local s_GameObject = GameObjectManager.m_GameObjects[l_Guid]

		if s_GameObject == nil then
			if l_GameObjectTransferData ~= nil and l_GameObjectTransferData.isDeleted == false then
				s_Command = {
					type = CommandActionType.SpawnGameObjectCommand,
					gameObjectTransferData = l_GameObjectTransferData
				}

				table.insert(s_Commands, s_Command)
			else
				m_Logger:Error("Object desynced: " .. tostring(l_Guid))
			end
		else
			if l_GameObjectTransferData == nil or l_GameObjectTransferData.isDeleted == true then
				s_Command = {
					type = CommandActionType.DeleteGameObjectCommand,
					gameObjectTransferData = {
						guid = l_Guid
					}
				}

				table.insert(s_Commands, s_Command)
			elseif s_GameObject.isDeleted == true and l_GameObjectTransferData.isDeleted == false then
				s_Command = {
					type = CommandActionType.UndeleteGameObjectCommand,
					gameObjectTransferData = l_GameObjectTransferData
				}

				table.insert(s_Commands, s_Command)
			else
				local s_ComparisonGameObjectTransferData = s_GameObject:GetGameObjectTransferData()
				local s_Changes = GetChanges(s_ComparisonGameObjectTransferData, l_GameObjectTransferData)

				for _, l_Change in pairs(s_Changes) do
					if l_Change == "transform" then
						s_Command = {
							type = CommandActionType.SetTransformCommand,
							gameObjectTransferData = l_GameObjectTransferData
						}
					elseif l_Change == "isEnabled" then
						if l_GameObjectTransferData.isEnabled then
							s_Command = {
								type = CommandActionType.EnableGameObjectCommand,
								gameObjectTransferData = {
									guid = l_Guid
								}
							}
						else
							s_Command = {
								type = CommandActionType.DisableGameObjectCommand,
								gameObjectTransferData = {
									guid = l_Guid
								}
							}
						end
					elseif l_Change == "variation" then
						s_Command = {
							type = CommandActionType.SetVariationCommand,
							gameObjectTransferData = {
								guid = l_Guid,
								variation = l_GameObjectTransferData.variation
							}
						}
					elseif l_Change == "name" then
						s_Command = {
							type = CommandActionType.SetObjectNameCommand,
							gameObjectTransferData = {
								guid = l_Guid,
								name = l_GameObjectTransferData.name
							}
						}
					-- elseif l_Change == "gameEntities" then
					-- 	m_Logger:Write("Before: ")
					-- 	m_Logger:WriteTable(s_ComparisonGameObjectTransferData.gameEntities)
					-- 	m_Logger:Write("--------------")

					-- 	m_Logger:Write("Updated Game Entities: ")
					-- 	m_Logger:WriteTable(l_GameObjectTransferData.gameEntities)
					-- 	m_Logger:Write("--------------")

					elseif l_Change == "parentData" then
						-- TODO: add this when changing parent data is implemented
					elseif l_Change == "name" then
						-- TODO: add this when changing name is implemented on lua
					else
						m_Logger:Error("Found an unhandled change: "..l_Change)
					end

					table.insert(s_Commands, s_Command)
				end
			end
		end
	end

	self:QueueCommands(s_Commands)
end

function ClientTransactionManager:OnUpdatePass(p_DeltaTime, p_UpdatePass)
	if p_UpdatePass ~= UpdatePass.UpdatePass_PreSim or (#self.m_Queue.commands == 0 and #self.m_Queue.messages == 0) then
		return
	end

	local s_Commands = {}

	for _, l_Command in pairs(self.m_Queue.commands) do
		m_Logger:Write("Executing command in the correct UpdatePass: " .. l_Command.type)
		table.insert(s_Commands, l_Command)
	end

	self:_executeCommands(s_Commands, p_UpdatePass)

	local s_Messages = {}

	for _, l_Message in pairs(self.m_Queue.messages) do
		m_Logger:Write("Executing message in the correct UpdatePass: " .. l_Message.type)
		table.insert(s_Messages, l_Message)
	end

	self:ExecuteMessages(s_Messages, true, p_UpdatePass)

	if #self.m_Queue.commands > 0 then
		self.m_Queue.commands = {}
	end

	if #self.m_Queue.messages > 0 then
		self.m_Queue.messages = {}
	end
end

function ClientTransactionManager:OnServerCommandsInvoked(p_CommandsJson, p_TransactionId)
	m_Logger:Write('OnServerCommandsInvoked')

	-- Check if player is ready, otherwise ignore as it will be sent when the player tells the server that it's ready
	if not self.m_IsPlayerReady then
		m_Logger:Write('--- Received commands before client is ready, ignoring.')
		return
	end

	local s_Commands = DecodeParams(json.decode(p_CommandsJson))

	if self.m_TransactionId + #s_Commands ~= p_TransactionId then
		m_Logger:Warning('--- The shit is not synced, gotta request sync')
		NetEvents:SendLocal('ClientTransactionManager:RequestSync', self.m_TransactionId)

		return
	end
	self:UpdateTransactionId(p_TransactionId, false)

	-- Queue commands, in case there are commands pending that are first in order
	self:QueueCommands(s_Commands)
end

function ClientTransactionManager:QueueCommands(p_Commands)
	for _, l_Command in pairs(p_Commands) do
		table.insert(self.m_Queue.commands, l_Command)
	end
end

function ClientTransactionManager:_executeCommands(p_Commands, p_UpdatePass)
	local s_CommandActionResults = {}

	for _, l_Command in pairs(p_Commands) do
		local s_CommandAction = CommandActions[l_Command.type]

		if s_CommandAction == nil then
			m_Logger:Error("Attempted to call a nil command action: " .. l_Command.type)
			return false
		end

		m_Logger:Write('Executing command ' .. l_Command.type)
		local s_CommandActionResult, s_CARResponseType = s_CommandAction(self, l_Command, p_UpdatePass)

		if s_CARResponseType == CARResponseType.Success then
			if s_CommandActionResult.gameObjectTransferData == nil then
				m_Logger:Error("There must be a gameObjectTransferData defined for sending back the CommandActionResult.")
			end

			if s_CommandActionResult.type == CARType.UndeletedGameObject then
				-- Vanilla undeleted objects are already spawned and in lua, we set the parent ready so it's sent alongside
				-- its children plus all their entities to WebUI
				local s_GameObject = GameObjectManager.m_GameObjects[s_CommandActionResult.gameObjectTransferData.guid]
				self:OnGameObjectReady(s_GameObject)
			elseif s_CommandActionResult.type ~= CARType.SpawnedGameObject then
				-- Spawned objects are sent when they are ready on OnGameObjectReady
				table.insert(s_CommandActionResults, s_CommandActionResult)
			end
		elseif s_CARResponseType == CARResponseType.Queue then
			m_Logger:Write("Queued command: " .. l_Command.type)
			table.insert(self.m_Queue.commands, l_Command)
		elseif s_CARResponseType == CARResponseType.Failure then
			-- TODO: Handle errors
			m_Logger:Warning("Failed to execute command: " .. l_Command.type)
		else
			m_Logger:Error("Unknown CARResponseType for command: " .. l_Command.type)
		end
	end

	if #s_CommandActionResults > 0 then
		WebUpdater:AddUpdate('HandleResponse', s_CommandActionResults)
		table.insert(self.m_ExecutedCommandActions, json.encode(s_CommandActionResults))
	end
end

function ClientTransactionManager:GetExecutedCommandActions()
	return self.m_ExecutedCommandActions
end

function ClientTransactionManager:OnReceiveMessages(p_Messages)
	self:ExecuteMessages(p_Messages, nil, nil)
end

function ClientTransactionManager:ExecuteMessages(p_Messages, p_Raw, p_UpdatePass)
	local s_Messages = p_Messages

	if p_Raw == nil then
		s_Messages = DecodeParams(json.decode(p_Messages))
	end

	for _, l_Message in pairs(s_Messages) do
		local s_MessageAction = MessageActions[l_Message.type]

		if s_MessageAction == nil then
			m_Logger:Error("Attempted to call a nil function: " .. l_Message.type)
			return false
		end

		m_Logger:Write('Executing message ' .. l_Message.type)
		local s_CARResponseType = s_MessageAction(self, l_Message, p_UpdatePass)

		if s_CARResponseType == CARResponseType.Success then
			return
		elseif s_CARResponseType == CARResponseType.Queue then
			table.insert(self.m_Queue.messages, l_Message)
		elseif s_CARResponseType == CARResponseType.Failure then
			m_Logger:Error("Failed to get a valid return for executing message: " .. tostring(l_Message.type))
		else
			m_Logger:Error("Unknown CARResponseType for message: " .. l_Message.type)
		end
	end
end

function ClientTransactionManager:UpdateTransactionId(p_TransactionId, p_IsFirstUpdate)
	if p_TransactionId < self.m_TransactionId then
		m_Logger:Error("Client's transaction id is greater than the server's. This should never happen.")
		return
	end

	--- Desync should only happen when a player first loads in (transactionId is 0), otherwise we fucked up.
	if p_IsFirstUpdate and p_TransactionId ~= self.m_TransactionId and self.m_TransactionId ~= 0 then
		m_Logger:Warning("Client is desynced, syncing it. This should rarely happen, did the client hung up? network problem? Please report it on the repo.")
	end

	self.m_TransactionId = p_TransactionId
end

function ClientTransactionManager:CreateCommandActionResultsRecursively(p_GameObject)
	local s_GameObjectTransferData = p_GameObject:GetGameObjectTransferData()

	local s_CommandActionResult = {
		sender = p_GameObject.creatorName,
		type = CARType.SpawnedGameObject,
		gameObjectTransferData = s_GameObjectTransferData,
	}

	if p_GameObject.children then
		for _, s_ChildGameObject in pairs(p_GameObject.children) do
			self:CreateCommandActionResultsRecursively(s_ChildGameObject)
		end
	end

	table.insert(self.m_CommandActionResults, s_CommandActionResult)
end

function ClientTransactionManager:OnGameObjectReady(p_GameObject)
	--m_Logger:Write("ClientTransactionManager:OnGameObjectReady(p_GameObject)")
	self:CreateCommandActionResultsRecursively(p_GameObject)

	if #self.m_CommandActionResults > 0 then
		--m_Logger:Write("Sending stuff to JS")
		WebUpdater:AddUpdate('HandleResponse', self.m_CommandActionResults)
		table.insert(self.m_ExecutedCommandActions, json.encode(self.m_CommandActionResults))
	else
		m_Logger:Error("OnGameObjectReady: No results were yielded for some reason")
	end

	self.m_CommandActionResults = { }
end

function ClientTransactionManager:OnUpdateGameObjectRealm(s_GameObject)
	if s_GameObject == nil then
		m_Logger:Error("OnUpdateGameObjectRealm: GameObject is nil")
	end

	WebUpdater:AddUpdate('HandleRealmUpdate', {
		guid = tostring(s_GameObject.guid),
		realm = s_GameObject.realm
	})
end

function ClientTransactionManager:OnSendCommandsToServer(p_Commands)
	NetEvents:SendLocal('ClientTransactionManager:InvokeCommands', p_Commands)
end

ClientTransactionManager = ClientTransactionManager()

return ClientTransactionManager
