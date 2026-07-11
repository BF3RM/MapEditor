---@class ServerTransactionManager
---@overload fun():ServerTransactionManager
ServerTransactionManager = class 'ServerTransactionManager'

local m_Logger = Logger("ServerTransactionManager", false)

function ServerTransactionManager:__init()
	m_Logger:Write("Initializing ServerTransactionManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function ServerTransactionManager:RegisterEvents()
	NetEvents:Subscribe('ClientTransactionManager:InvokeCommands', self, self.OnInvokeCommands)
	NetEvents:Subscribe('ClientTransactionManager:ClientReady', self, self.OnClientReady)
	NetEvents:Subscribe('ClientTransactionManager:RequestSync', self, self.OnRequestSync)
	NetEvents:Subscribe('ClientTransactionManager:BatchDone', self, self.OnBatchDone)
	Events:Subscribe('ServerGameObjectManager:RealmsSynced', self, self.OnRealmsSynced)
end

function ServerTransactionManager:RegisterVars()
	self.m_QueueDelay = 0
	self.m_Queue = {}
	self.m_Transactions = {}
	self.m_PlayersReady = {}
	self.m_LoadingProjectLastTransactionId = nil
	self.m_ReadyToProcess = false -- Server is ready to process when the first client has loaded and it has synced client/server only objects with the server

	-- Completion-gated bulk loading: send a batch of LOAD_BATCH_SIZE, then WAIT for the client to
	-- report it finished (OnBatchDone) before sending the next, so batches never overlap/pile up.
	self.m_LoadingInProgress = false
	self.m_WaitingForBatchAck = false
	self.m_BatchAckSafety = 0
end

--- Client finished spawning the previous batch -> release the next one.
function ServerTransactionManager:OnBatchDone(p_Player)
	self.m_WaitingForBatchAck = false
end

function ServerTransactionManager:OnLevelDestroy()
	self:RegisterVars()
end

function ServerTransactionManager:OnLoadResources()
	self:RegisterVars()
	NetEvents:BroadcastLocal('ServerTransactionManager:ResetVars')
end

function ServerTransactionManager:OnRealmsSynced()
	self.m_ReadyToProcess = true
end

---@param p_Player Player
function ServerTransactionManager:IsPlayerReady(p_Player)
	return self.m_PlayersReady[p_Player.name]
end

---@param p_Player Player
---@param p_IsReady boolean
function ServerTransactionManager:SetPlayerReady(p_Player, p_IsReady)
	self.m_PlayersReady[p_Player.name] = p_IsReady
end

---@param p_Player Player
function ServerTransactionManager:OnPlayerLeft(p_Player)
	self:SetPlayerReady(p_Player, false)
end

---@param p_Player Player
function ServerTransactionManager:OnClientReady(p_Player)
	if p_Player == nil then
		return
	end

	self:SetPlayerReady(p_Player, true)

	-- TODO: maybe do #self.m_PlayersReady to know if it's the first player that is ready
	ServerGameObjectManager:ClientReady(p_Player)
	self:SyncClient(p_Player, 0)
end

---@param p_Player Player
---@param p_TransactionId number
function ServerTransactionManager:OnRequestSync(p_Player, p_TransactionId)
	self:SyncClient(p_Player, p_TransactionId)
end

---@param p_Player Player
---@param p_TransactionId number
function ServerTransactionManager:SyncClient(p_Player, p_TransactionId)
	--- Client up to date
	if p_TransactionId == #self.m_Transactions then
		-- m_Logger:Write("Client up to date")
		-- Empty response, so the player know it has finished syncing.
		NetEvents:SendToLocal("ServerTransactionManager:SyncClientContext", p_Player, nil, nil, self.m_LoadingProjectLastTransactionId)
		return
	--- Desync should only happen when a player first loads in (transactionId is 0), otherwise we fucked up.
	elseif p_TransactionId ~= 0 then
		m_Logger:Warning(p_Player.name .. "'s client is desynced, syncing it. This should rarely happen, did the client hung up? network problem? Please report it on the repo.")
	end

	if p_TransactionId > #self.m_Transactions then
		m_Logger:Error("Client's transaction id is greater than the server's. This should never happen.")
		return
	end

	local s_UpdatedGameObjectTransferDatas = {}

	local s_LastTransaction = #self.m_Transactions

	for l_TransactionId = p_TransactionId + 1, s_LastTransaction do
		local s_Guid = self.m_Transactions[l_TransactionId]

		if s_Guid ~= nil then
			local s_GameObject = GameObjectManager:GetGameObject(s_Guid)

			if s_GameObject == nil then
				s_UpdatedGameObjectTransferDatas[s_Guid] = nil
			else
				s_UpdatedGameObjectTransferDatas[s_Guid] = s_GameObject:GetGameObjectTransferData()
			end
		else
			m_Logger:Write("Transaction not found " .. tostring(l_TransactionId))
		end
	end

	NetEvents:SendToLocal(
		"ServerTransactionManager:SyncClientContext",
		p_Player,
		s_UpdatedGameObjectTransferDatas,
		s_LastTransaction,
		self.m_LoadingProjectLastTransactionId
	)
end

---@param p_Id number
function ServerTransactionManager:SetLoadingProjectLastTransactionId(p_Id)
	self.m_LoadingProjectLastTransactionId = p_Id

	-- A project is loading in bulk -> use completion-gated batches (see OnUpdatePass).
	self.m_LoadingInProgress = (p_Id ~= nil and p_Id > 0)
	self.m_WaitingForBatchAck = false

	-- Notify ready players that there is a project loading. Probably not needed, the server loads before clients so at this point there shouldn't be ready players
	-- But just to be safe.
	for l_PlayerName, l_IsReady in pairs(self.m_PlayersReady) do
		local l_Player = PlayerManager:GetPlayerByName(l_PlayerName)

		if l_IsReady and l_Player then
			NetEvents:SendToLocal(
				"ServerTransactionManager:SyncClientContext",
				l_Player,
				nil,
				nil,
				self.m_LoadingProjectLastTransactionId
			)
		end
	end
end

---@param p_Player Player
---@param p_CommandsJson string
function ServerTransactionManager:OnInvokeCommands(p_Player, p_CommandsJson)
	if not self:IsPlayerReady(p_Player) then
		m_Logger:Warning('Player invoked command before being ready, should not happen.')
		return
	end

	local s_Commands = DecodeParams(json.decode(p_CommandsJson))

	if s_Commands then
		self:QueueCommands(s_Commands)
	end
end

---@param p_DeltaTime number
---@param p_UpdatePass UpdatePass
function ServerTransactionManager:OnUpdatePass(p_DeltaTime, p_UpdatePass)
	if p_UpdatePass ~= UpdatePass.UpdatePass_PreSim then
		return
	end

	if #self.m_Queue == 0 then
		-- Bulk load drained; clear the loading flag once the last batch was ACKed.
		if self.m_LoadingInProgress and not self.m_WaitingForBatchAck then
			self.m_LoadingInProgress = false
		end
		return
	end

	-- Wait until client/server only objects are synced to prevent errors
	if not self.m_ReadyToProcess then
		return
	end

	local s_BatchSize

	if self.m_LoadingInProgress then
		-- COMPLETION-GATED: don't send the next batch until the client reports it finished the
		-- previous one (OnBatchDone), so batches never overlap/pile up. A safety timer keeps it
		-- from deadlocking if an ACK is ever lost.
		if self.m_WaitingForBatchAck then
			self.m_BatchAckSafety = self.m_BatchAckSafety - p_DeltaTime
			if self.m_BatchAckSafety > 0 then
				return
			end
			m_Logger:Warning('Batch ACK timed out, proceeding anyway')
		end
		s_BatchSize = ME_CONFIG.LOAD_BATCH_SIZE
	else
		-- Normal (user-edit) commands: original time-paced path.
		if self.m_QueueDelay > 0 then
			self.m_QueueDelay = self.m_QueueDelay - p_DeltaTime
			return
		end
		s_BatchSize = ME_CONFIG.QUEUE_MAX_COMMANDS
	end

	local s_CommandsToExecute = {}
	local s_NewQueue = {}

	local s_nProcessedCommands = 0

	for i, l_Command in pairs(self.m_Queue) do
		if i > s_BatchSize then
			-- Limit reached, shift remaining commands in the queue to the beginning of the array
			table.insert(s_NewQueue, l_Command)
		else
			table.insert(s_CommandsToExecute, l_Command)
			s_nProcessedCommands = i
		end
	end

	self.m_Queue = s_NewQueue
	m_Logger:Write('Executing ' .. s_nProcessedCommands .. ' queued commands, ' .. #self.m_Queue .. ' left in queue')

	if self.m_LoadingInProgress then
		self.m_WaitingForBatchAck = true
		self.m_BatchAckSafety = 20
	else
		self.m_QueueDelay = ME_CONFIG.QUEUE_DELAY_PER_COMMAND * s_nProcessedCommands
	end

	self:_executeCommands(s_CommandsToExecute, p_UpdatePass)
end

---@param p_Commands table
function ServerTransactionManager:QueueCommands(p_Commands)
	for _, l_Command in pairs(p_Commands) do
		table.insert(self.m_Queue, l_Command)
	end
end

---@param p_Commands table
---@param p_UpdatePass UpdatePass
---@return boolean
function ServerTransactionManager:_executeCommands(p_Commands, p_UpdatePass)
	local s_ExecutedCommands = {}

	for _, l_Command in pairs(p_Commands) do
		local s_CommandAction = CommandActions[l_Command.type]

		if s_CommandAction == nil then
			m_Logger:Error("Attempted to call a nil command action: " .. l_Command.type)
			return false
		end

		local s_CommandActionResult, s_CARResponseType = s_CommandAction(self, l_Command, p_UpdatePass)

		if s_CARResponseType == CARResponseType.Success then
			if s_CommandActionResult.gameObjectTransferData == nil then
				m_Logger:Error("There must be a gameObjectTransferData defined for sending back the CommandActionResult.")
			end

			local s_GameObjectTransferData = s_CommandActionResult.gameObjectTransferData
			table.insert(s_ExecutedCommands, l_Command)
			table.insert(self.m_Transactions, s_GameObjectTransferData.guid) -- Store that this transaction has happened.
		elseif s_CARResponseType == CARResponseType.Queue then
			m_Logger:Write("Queued command: " .. l_Command.type)
			table.insert(self.m_Queue, l_Command)
		elseif s_CARResponseType == CARResponseType.Failure then
			-- TODO: Handle errors
			m_Logger:Warning("Failed to execute command: " .. l_Command.type)
		else
			m_Logger:Error("Unknown CommandCARResponseType for command: " .. l_Command.type)
		end
	end

	-- m_Logger:Write(json.encode(self.m_GameObjects))

	if #s_ExecutedCommands > 0 then
		NetEvents:BroadcastLocal('ServerTransactionManager:CommandsInvoked', json.encode(s_ExecutedCommands), #self.m_Transactions)
	end

	return true
end

ServerTransactionManager = ServerTransactionManager()

return ServerTransactionManager
