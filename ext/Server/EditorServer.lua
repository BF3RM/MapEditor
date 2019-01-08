class 'EditorServer'

function EditorServer:__init()
	print("Initializing EditorServer")
	self:RegisterVars()
end

function EditorServer:RegisterVars()
	self.m_PendingRaycast = false

	self.m_Commands = {
		SpawnBlueprintCommand = Backend.SpawnBlueprint,
		DestroyBlueprintCommand = Backend.DestroyBlueprint,
		SetTransformCommand = Backend.SetTransform,
		SelectGameObjectCommand = Backend.SelectGameObject,
		CreateGroupCommand = Backend.CreateGroup
	}

	self.m_Queue = {};

	self.m_Transactions = {}
	self.m_GameObjects = {}
end

function EditorServer:OnRequestUpdate(p_Player, p_TransactionId)

	local s_TransactionId = p_TransactionId
	local s_UpdatedGameObjects = {}
	while(s_TransactionId <= #self.m_Transactions) do
		local s_Guid = self.m_Transactions[s_TransactionId]
		if(s_Guid ~= nil) then
			s_UpdatedGameObjects[s_Guid] = self.m_GameObjects[s_Guid]
			s_TransactionId = s_TransactionId + 1
		else
			print("shit's nil")
		end
	end
	NetEvents:SendToLocal("MapEditorClient:ReceiveUpdate", p_Player, s_UpdatedGameObjects)
end


function EditorServer:OnReceiveCommand(p_Player, p_Command, p_Raw)
	local s_Command = p_Command

	if not raw then
		s_Command = DecodeParams(json.decode(p_Command))
	end

	local s_Responses = {}
	for k, l_Command in ipairs(s_Command) do
		local s_Function = self.m_Commands[l_Command.type]
		if(s_Function == nil) then
			print("Attempted to call a nil function: " .. l_Command.type)
			return false
		end
		local s_Response = s_Function(self, l_Command)
		if(s_Response == false) then
			-- TODO: Handle errors
			print("error")
		elseif(s_Response == "queue") then
			print("Queued command")
			table.insert(self.m_Queue, l_Command)
		elseif(s_Response.userData == nil) then
			print("MISSING USERDATA!")
		else
			self.m_GameObjects[l_Command.guid] = MergeUserdata(self.m_GameObjects[l_Command.guid], s_Response.userData)
			table.insert(self.m_Transactions, tostring(l_Command.guid)) -- Store that this transaction has happened.
			table.insert(s_Responses, s_Response)
		end
	end
	if(#s_Responses > 0) then
		NetEvents:BroadcastLocal("MapEditor:ReceiveCommand", p_Command)
	end
end

function EditorServer:OnUpdatePass(p_Delta, p_Pass)
	if(p_Pass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0) then
		return
	end
	local s_Responses = {}
	for k,l_Command in ipairs(self.m_Queue) do
		l_Command.queued = true
		print("Executing command delayed: " .. l_Command.type)
		table.insert(s_Responses, l_Command)
	end
	self:OnReceiveCommand(nil, s_Responses, true)

	if(#self.m_Queue > 0) then
		self.m_Queue = {}
	end
end



return EditorServer()