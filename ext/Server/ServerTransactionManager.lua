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
	-- Commands that FAILED server-side during a bulk load (e.g. a save referencing blueprints whose
	-- bundles aren't loaded on this level). They are never broadcast, so the client must be told
	-- about them separately or its sync progress target is unreachable (stuck syncing -> timeout kick).
	self.m_SkippedDuringLoad = 0
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

--- True when at least one player is connected. Several gates below exist to keep the server in
--- step with clients; with nobody connected they can never be satisfied and would stall the queue
--- indefinitely rather than merely delay it.
---@return boolean
function ServerTransactionManager:_HasConnectedPlayers()
	local s_Any = false

	pcall(function()
		local s_Players = PlayerManager:GetPlayers()
		s_Any = s_Players ~= nil and #s_Players > 0
	end)

	return s_Any
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
	-- Effective project target = commands the client can still expect to receive. Commands that
	-- failed server-side (m_SkippedDuringLoad) were never stored/broadcast, so a client syncing
	-- mid/post-load would otherwise wait for them forever.
	local s_ProjectTarget = self.m_LoadingProjectLastTransactionId

	if s_ProjectTarget ~= nil then
		s_ProjectTarget = s_ProjectTarget - self.m_SkippedDuringLoad

		if s_ProjectTarget <= 0 then
			s_ProjectTarget = nil
		end
	end

	--- Client up to date
	if p_TransactionId == #self.m_Transactions then
		-- m_Logger:Write("Client up to date")
		-- Empty response, so the player know it has finished syncing.
		NetEvents:SendToLocal("ServerTransactionManager:SyncClientContext", p_Player, nil, nil, s_ProjectTarget)
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
		s_ProjectTarget
	)
end

---@param p_Id number
function ServerTransactionManager:SetLoadingProjectLastTransactionId(p_Id)
	self.m_LoadingProjectLastTransactionId = p_Id

	-- A project is loading in bulk -> use completion-gated batches (see OnUpdatePass).
	self.m_LoadingInProgress = (p_Id ~= nil and p_Id > 0)
	self.m_WaitingForBatchAck = false
	self.m_SkippedDuringLoad = 0

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

			if self.m_SkippedDuringLoad > 0 then
				m_Logger:Warning('Project load finished with ' .. self.m_SkippedDuringLoad .. ' skipped commands (assets not found on this level, see errors above)')
			end
		end
		return
	end

	-- Wait until client/server only objects are synced to prevent errors.
	--
	-- EXCEPT with nobody connected: m_ReadyToProcess is only set by the client/server realm
	-- handshake, so an empty server can never satisfy it — and loading a project RESTARTS the
	-- level, which drops the client that asked for the load. The queued commands then sat forever
	-- and the project silently applied nothing: it looked like "the load did nothing" rather than
	-- "the load is waiting for a client that is never coming back". Applying server-side with no
	-- players is also just correct on a dedicated server; a client that joins later syncs the
	-- resulting state through the normal SyncClient path.
	if not self.m_ReadyToProcess and self:_HasConnectedPlayers() then
		return
	end

	local s_BatchSize

	if self.m_LoadingInProgress then
		-- COMPLETION-GATED: don't send the next batch until the client reports it finished the
		-- previous one (OnBatchDone), so batches never overlap/pile up. A safety timer keeps it
		-- from deadlocking if an ACK is ever lost.
		-- Completion gating only makes sense while someone is there to ACK. With no players the
		-- wait can never be satisfied, so don't stall the load behind it.
		if self.m_WaitingForBatchAck and self:_HasConnectedPlayers() then
			self.m_BatchAckSafety = self.m_BatchAckSafety - p_DeltaTime
			if self.m_BatchAckSafety > 0 then
				return
			end
			m_Logger:Warning('Batch ACK timed out, proceeding anyway')
		elseif self.m_WaitingForBatchAck then
			self.m_WaitingForBatchAck = false
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

	local s_ExecutedCount = self:_executeCommands(s_CommandsToExecute, p_UpdatePass)

	-- If nothing was actually executed (e.g. the whole batch failed on missing blueprints) nothing
	-- was broadcast, so the client has nothing to spawn and no BatchDone will ever come back ->
	-- don't wait for an ACK, move straight on to the next batch.
	if self.m_LoadingInProgress and (s_ExecutedCount == nil or s_ExecutedCount == 0) then
		self.m_WaitingForBatchAck = false
	end
end

---@param p_Commands table
function ServerTransactionManager:QueueCommands(p_Commands)
	for _, l_Command in pairs(p_Commands) do
		table.insert(self.m_Queue, l_Command)
	end
end

---@param p_Commands table
---@param p_UpdatePass UpdatePass
---@return number|nil executedCount
function ServerTransactionManager:_executeCommands(p_Commands, p_UpdatePass)
	local s_ExecutedCommands = {}
	local s_SkippedCount = 0

	for _, l_Command in pairs(p_Commands) do
		local s_CommandAction = CommandActions[l_Command.type]

		if s_CommandAction == nil then
			m_Logger:Error("Attempted to call a nil command action: " .. l_Command.type)
			return nil
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
			s_SkippedCount = s_SkippedCount + 1
		else
			m_Logger:Error("Unknown CommandCARResponseType for command: " .. l_Command.type)
		end
	end

	-- m_Logger:Write(json.encode(self.m_GameObjects))

	if self.m_LoadingInProgress and s_SkippedCount > 0 then
		self.m_SkippedDuringLoad = self.m_SkippedDuringLoad + s_SkippedCount
		-- Failed commands are never broadcast, so clients must count them into their sync progress
		-- separately or the progress target is unreachable (stuck syncing -> timeout kick).
		NetEvents:BroadcastLocal('ServerTransactionManager:CommandsSkipped', s_SkippedCount)
	end

	if #s_ExecutedCommands > 0 then
		NetEvents:BroadcastLocal('ServerTransactionManager:CommandsInvoked', json.encode(s_ExecutedCommands), #self.m_Transactions)
	end

	return #s_ExecutedCommands
end

ServerTransactionManager = ServerTransactionManager()

return ServerTransactionManager
