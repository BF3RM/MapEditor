---@class ServerTransactionManager
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
end

function ServerTransactionManager:RegisterVars()
	self.m_QueueDelay = 0
	self.m_Queue = {}
	self.m_Transactions = {}
	self.m_PlayersReady = {}
	self.m_LoadingProjectTransactionId = nil
end

function ServerTransactionManager:OnLevelDestroy()
	self:RegisterVars()
end

function ServerTransactionManager:OnLoadResources()
	self:RegisterVars()
	NetEvents:BroadcastLocal('ServerTransactionManager:ResetVars')
end

function ServerTransactionManager:IsPlayerReady(p_Player)
	return self.m_PlayersReady[p_Player.name]
end

function ServerTransactionManager:SetPlayerReady(p_Player, p_IsReady)
	self.m_PlayersReady[p_Player.name] = p_IsReady
end

function ServerTransactionManager:OnPlayerLeft(p_Player)
	self:SetPlayerReady(p_Player, nil)
end

function ServerTransactionManager:OnClientReady(p_Player)
	if p_Player == nil then
		return
	end

	self:SetPlayerReady(p_Player, true)

	-- TODO: maybe do #self.m_PlayersReady to know if it's the first player that is ready
	ServerGameObjectManager:ClientReady(p_Player)
	self:SyncClient(p_Player, 0)
end

function ServerTransactionManager:OnRequestSync(p_Player, p_TransactionId)
	self:SyncClient(p_Player, p_TransactionId)
end

function ServerTransactionManager:SyncClient(p_Player, p_TransactionId)
	local s_TargetTransactionId = #self.m_Transactions
	
	if self.m_LoadingProjectTransactionId ~= nil then
		-- There is a project in loading, target is the last transaction id of the project
		s_TargetTransactionId = self.m_LoadingProjectTransactionId
	end

	--- Client up to date
	if p_TransactionId == s_TargetTransactionId then
		--m_Logger:Write("Client up to date")
		-- Response, so the player know it has finished syncing.
		NetEvents:SendToLocal("ServerTransactionManager:SyncClientContext", p_Player)
		return
	--- Desync should only happen when a player first loads in (transactionId is 0), otherwise we fucked up.
	elseif p_TransactionId ~= 0 then
		m_Logger:Warning(p_Player.name.."'s client is desynced, syncing it. This should rarely happen, did the client hung up? network problem? Please report it on the repo.")
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
			local s_GameObject = GameObjectManager.m_GameObjects[s_Guid]

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
		s_TargetTransactionId
	)
end

function ServerTransactionManager:SetLoadingProjectTransactionId(p_TransactionId)
	self.m_LoadingProjectTransactionId = p_TransactionId
end

function ServerTransactionManager:OnInvokeCommands(p_Player, p_CommandsJson)
	if not self:IsPlayerReady(p_Player) then
		m_Logger:Warning('Player invoked command before being ready, should not happen.')
		return
	end

	local s_Commands = DecodeParams(json.decode(p_CommandsJson))

	self:QueueCommands(s_Commands)
end

function ServerTransactionManager:OnUpdatePass(p_DeltaTime, p_UpdatePass)
	if p_UpdatePass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0 then
		return
	end

	if self.m_QueueDelay > 0 then
		self.m_QueueDelay = self.m_QueueDelay - p_DeltaTime
		return
	end

	local s_CommandsToExecute = {}
	local s_NewQueue = {}

	local s_nProcessedCommands = 0

	for i, l_Command in pairs(self.m_Queue) do
		if i > ME_CONFIG.QUEUE_MAX_COMMANDS then
			if #s_NewQueue == 0 then
				m_Logger:Write('Limit of ' .. ME_CONFIG.QUEUE_MAX_COMMANDS .. ' commands reached, queueing the rest')
			end
			-- Limit reached, shift remaining commands in the queue to the beginning of the array
			table.insert(s_NewQueue, l_Command)
		else
			m_Logger:Write("Executing command delayed: " .. l_Command.type)
			table.insert(s_CommandsToExecute, l_Command)
			s_nProcessedCommands = i
		end
	end

	self.m_Queue = s_NewQueue

	self.m_QueueDelay = ME_CONFIG.QUEUE_DELAY_PER_COMMAND * s_nProcessedCommands
	self:_executeCommands(s_CommandsToExecute, p_UpdatePass)
end

function ServerTransactionManager:QueueCommands(p_Commands)
	for _, l_Command in pairs(p_Commands) do
		table.insert(self.m_Queue, l_Command)
	end
end

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
end

ServerTransactionManager = ServerTransactionManager()

return ServerTransactionManager
