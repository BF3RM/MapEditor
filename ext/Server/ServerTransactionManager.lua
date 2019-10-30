class 'ServerTransactionManager'

local m_Logger = Logger("ServerTransactionManager", true)

function ServerTransactionManager:__init()
	m_Logger:Write("Initializing ServerTransactionManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function ServerTransactionManager:RegisterEvents()
	NetEvents:Subscribe('ServerTransactionManager:ReceiveCommands', self, self.OnReceiveCommands)
	NetEvents:Subscribe('ServerTransactionManager:RequestUpdate', self, self.OnRequestUpdate)
end

function ServerTransactionManager:RegisterVars()
	self.m_Queue = {};
	self.m_Transactions = {}
end

function ServerTransactionManager:OnRequestUpdate(p_Player, p_TransactionId)
    if p_Player == nil then
        return
    end

    --- Client up to date
    if p_TransactionId == #self.m_Transactions then
        m_Logger:Write("Client up to date")

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

    for l_TransactionId = p_TransactionId + 1, #self.m_Transactions do
        local s_Guid = self.m_Transactions[l_TransactionId]
        if s_Guid ~= nil then
            s_UpdatedGameObjectTransferDatas[s_Guid] = GameObjectManager.m_GameObjects[s_Guid]:GetGameObjectTransferData()
        else
            m_Logger:Write("Transaction not found " .. tostring(l_TransactionId))
        end
    end

    -- TODO: These should be on the same netevent, merge them when this vext issue is fixed: https://github.com/EmulatorNexus/VeniceUnleashed/issues/451
    NetEvents:SendToLocal("MapEditorClient:ReceiveUpdate", p_Player, s_UpdatedGameObjectTransferDatas)
    NetEvents:SendToLocal("MapEditorClient:UpdateTransactionId", p_Player, #self.m_Transactions)
end

function ServerTransactionManager:OnReceiveCommands(p_Player, p_CommandsJson, p_UpdatePass)
	local s_Commands = DecodeParams(json.decode(p_CommandsJson))

	self:ExecuteCommands(s_Commands, p_UpdatePass)
end

function ServerTransactionManager:OnUpdatePass(p_Delta, p_Pass)
	if(p_Pass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0) then
		return
	end

	local s_QueuedCommands = {}

	for _,l_Command in ipairs(self.m_Queue) do
		m_Logger:Write("Executing command delayed: " .. l_Command.type)
		table.insert(s_QueuedCommands, l_Command)
	end

	self:ExecuteCommands(s_QueuedCommands, p_Pass)

	if(#self.m_Queue > 0) then
		self.m_Queue = {}
	end
end

function ServerTransactionManager:ExecuteCommands(p_Commands, p_UpdatePass)
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

			--local s_Guid = s_GameObjectTransferData.guid
			--self.m_GameObjectTransferDatas[s_Guid] = MergeGameObjectTransferData(self.m_GameObjectTransferDatas[s_Guid], s_GameObjectTransferData) -- overwrite our table with gameObjectTransferDatas so we have the current most version

			table.insert(self.m_Transactions, s_GameObjectTransferData.guid) -- Store that this transaction has happened.

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

return ServerTransactionManager()