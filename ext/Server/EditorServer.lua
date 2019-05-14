class 'EditorServer'

local m_Logger = Logger("EditorServer", true)

local m_SaveFile = require 'SaveFile'
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
			m_Logger:Write("shit's nil")
		end
	end
	NetEvents:SendToLocal("MapEditorClient:ReceiveUpdate", p_Player, s_UpdatedGameObjectTransferDatas)
end


function EditorServer:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
    --Avoid nested blueprints for now...
	local s_Response = VanillaBlueprintsParser:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
end

function EditorServer:OnReceiveCommands(p_Player, p_Commands, p_UpdatePass)
	local s_CommandActionResults = {}
	for _, l_Command in ipairs(p_Commands) do

		local s_CommandAction = CommandActions[l_Command.type]

		if (s_CommandAction == nil) then
			m_Logger:Error("Attempted to call a nil command action: " .. l_Command.type)
			return false
		end

		local s_CommandActionResult, s_CommandActionResultType = s_CommandAction(self, l_Command, p_UpdatePass)

		if (s_CommandActionResultType == CommandActionResultType.Success) then
			local s_UserData
			if s_CommandActionResult.userData ~= nil then
				s_UserData = MergeUserdata(s_CommandActionResult.userData, {isDeleted = s_CommandActionResult.isDeleted or false})
			else
				s_UserData = {isDeleted = s_CommandActionResult.isDeleted or false, transform = LinearTransform()}
			end

			self.m_GameObjectTransferDatas[l_Command.guid] = MergeUserdata(self.m_GameObjectTransferDatas[l_Command.guid], s_UserData)

			table.insert(self.m_Transactions, tostring(l_Command.guid)) -- Store that this transaction has happened.
			table.insert(s_CommandActionResults, s_CommandActionResult)

		elseif (s_CommandActionResultType == CommandActionResultType.Queue) then
			m_Logger:Write("Queued command: " .. l_Command.type)
			table.insert(self.m_Queue, l_Command)

		elseif (s_CommandActionResultType == CommandActionResultType.Failure) then
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

function EditorServer:OnUpdatePass(p_Delta, p_Pass)
	if m_IsLevelLoaded then
		m_LoadDelay = m_LoadDelay + p_Delta

		if m_LoadDelay > 10 then
			m_IsLevelLoaded = false
			m_LoadDelay = 0
			self:LoadSave()

		end
	end

	if(p_Pass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0) then
		return
	end
	local s_Responses = {}
	for _,l_Command in ipairs(self.m_Queue) do
		m_Logger:Write("Executing command delayed: " .. l_Command.type)
		table.insert(s_Responses, l_Command)
	end
	self:OnReceiveCommands(nil, s_Responses, true, p_Pass)

	if(#self.m_Queue > 0) then
		self.m_Queue = {}
	end
end

function EditorServer:OnLevelLoaded(p_Map, p_GameMode, p_Round)
	m_IsLevelLoaded = true
end

function EditorServer:LoadSave()
    m_Logger:Write("Loading savefile")
    local s_SaveFile = DecodeParams(json.decode(m_SaveFile))

    if(not s_SaveFile) then
        m_Logger:Write("Failed to get savefile")
        return
    end

    self:UpdateLevel(s_SaveFile)
end

function EditorServer:UpdateLevel(p_Update)
	local s_Responses = {}

	for s_Guid, s_GameObject in pairs(p_Update) do
		if(self.m_GameObjectTransferDatas[s_Guid] == nil) then
			local s_StringGuid = tostring(s_Guid)

			--If it's a vanilla object we move it or we delete it. If not we spawn a new object.
			if IsVanilla(s_StringGuid) then
				m_Logger:Write("vanilla")
				local s_Command

                if s_GameObject.isDeleted then
					m_Logger:Write("deleting")
					s_Command = {
						type = "DestroyBlueprintCommand",
						guid = s_Guid,

					}
				else
					m_Logger:Write("moving")
					s_Command = {
						type = "SetTransformCommand",
						guid = s_Guid,
						userData = s_GameObject
					}
				end
				table.insert(s_Responses, s_Command)
			else
				local s_Command = {
					type = "SpawnBlueprintCommand",
					guid = s_Guid,
					userData = s_GameObject
				}
				table.insert(s_Responses, s_Command)
			end
		else
			local s_Changes = GetChanges(self.m_GameObjectTransferDatas[s_Guid], s_GameObject)
			-- Hopefully this will never happen. It's hard to test these changes since they require a desync.
			if(#s_Changes > 0) then
				m_Logger:Write("--------------------------------------------------------------------")
				m_Logger:Write("If you ever see this, please report it on the repo.")
				m_Logger:Write(s_Changes)
				m_Logger:Write("--------------------------------------------------------------------")
			end
		end

	end
	self:OnReceiveCommands(nil, s_Responses, true)
end



return EditorServer()