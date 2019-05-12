class 'Editor'

local m_Logger = Logger("Editor", true)

local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10

function Editor:__init()
	m_Logger:Write("Initializing EditorClient")
	self:RegisterVars()

end

function Editor:RegisterVars()
	self.m_PendingRaycast = false
    self.m_FreecamMoving = false

	self.m_Changes = {
		reference = "SpawnBlueprintCommand",
		destroyed = "DestroyBlueprintCommand",
		transform = "SetTransformCommand",
	}

	self.m_Messages = {
		MoveObjectMessage = self.MoveObject,
		SetViewModeMessage = self.SetViewMode,
		SetScreenToWorldPositionMessage = self.SetScreenToWorldPosition,
		PreviewSpawnMessage = self.PreviewSpawn,
		PreviewDestroyMessage = self.PreviewDestroy,
		PreviewMoveMessage = self.PreviewMove
	}

	self.m_Queue = {
        commands = {},
        messages = {}
    };

	self.m_TransactionId = 0
	self.m_GameObjects = {}

	self.m_CameraTransform = nil

end

function Editor:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		InstanceParser:FillVariations()
		local s_LevelDatas = InstanceParser:GetLevelDatas()

		for _,v in pairs(s_LevelDatas) do
			WebUI:ExecuteJS(string.format("editor.gameContext.LoadLevel('%s')", json.encode(v)))
		end

		WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(InstanceParser.m_Blueprints)))
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(VanillaBlueprintsParser.m_VanillaObjects)))
		WebUI:ExecuteJS(string.format("console.log('%s')", json.encode(VanillaBlueprintsParser.m_VanillaUnresolved)))

    end
	if p_Message.type == MessageType.ClientCharacterLocalPlayerSetMessage then
		local s_LocalPlayer = PlayerManager:GetLocalPlayer()

		if s_LocalPlayer == nil then
			m_Logger:Error("Local player is nil")
			return
		end
		m_Logger:Write("Requesting update")
		NetEvents:SendLocal("MapEditorServer:RequestUpdate", 1)
		WebUI:ExecuteJS(string.format("editor.setPlayerName('%s')", s_LocalPlayer.name))
	end
end

function Editor:OnReceiveUpdate(p_Update)
	local s_Responses = {}

	for s_Guid, s_GameObject in pairs(p_Update) do
		if(self.m_GameObjects[s_Guid] == nil) then
			local s_StringGuid = tostring(s_Guid)

			--If it's a vanilla object we move it or we delete it. If not we spawn a new object.
			if IsVanilla(s_StringGuid)then
				local s_Command

                if s_GameObject.isDeleted then
					s_Command = {
						type = "DestroyBlueprintCommand",
						guid = s_Guid,

					}
				else
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
			local s_Changes = GetChanges(self.m_GameObjects[s_Guid], s_GameObject)
			-- Hopefully this will never happen. It's hard to test these changes since they require a desync.
			if(#s_Changes > 0) then
				m_Logger:Write("--------------------------------------------------------------------")
				m_Logger:Write("If you ever see this, please report it on the repo.")
				m_Logger:Write(s_Changes)
				m_Logger:Write("--------------------------------------------------------------------")
			end
		end

	end

	self:OnReceiveCommands(s_Responses, nil)
end

function Editor:OnUpdate(p_Delta, p_SimulationDelta)
	-- Raycast has to be done in update
	if(self:CameraHasMoved() == true) then
		self:UpdateCameraTransform()
	end
	self:Raycast()
end

function Editor:OnRequestSave()
	WebUI:ExecuteJS("editor.ui.SetSave('"..json.encode(self.m_GameObjects).."')")
end

function Editor:OnSendCommandsToServer(p_Command)
	NetEvents:SendLocal('MapEditorServer:ReceiveCommand', p_Command)
end

function Editor:OnReceiveCommands(p_Commands, p_UpdatePass)
	local s_CommandActionResults = {}
	for _, l_Command in ipairs(p_Commands) do
		local s_CommandAction = CommandActions[l_Command.type]
		if(s_CommandAction == nil) then
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

			self.m_GameObjects[l_Command.guid] = MergeUserdata(self.m_GameObjects[l_Command.guid], s_UserData)

			table.insert(s_CommandActionResults, s_CommandActionResult)
		elseif (s_CommandActionResultType == CommandActionResultType.Queue) then
			m_Logger:Write("Queued command: " .. l_Command.type)
			table.insert(self.m_Queue.commands, l_Command)
		elseif (s_CommandActionResultType == CommandActionResultType.Failure) then
			-- TODO: Handle errors
			m_Logger:Warning("Failed to execute command: " .. l_Command.type)
		else
			m_Logger:Error("Unknown CommandActionResultType for command: " .. l_Command.type)
		end
	end

	-- m_Logger:Write(json.encode(self.m_GameObjects))
	if(#s_CommandActionResults > 0) then
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(s_CommandActionResults)))
	end
end

function Editor:OnReceiveMessage(p_Messages, p_Raw, p_UpdatePass)
    local s_Messages = p_Messages
    if p_Raw == nil then
        s_Messages = DecodeParams(json.decode(p_Messages))
    end
    for _, l_Message in ipairs(s_Messages) do


        local s_Function = self.m_Messages[l_Message.type]
        if(s_Function == nil) then
            m_Logger:Error("Attempted to call a nil function: " .. l_Message.type)
            return false
        end

        local s_Response = s_Function(self, l_Message, p_UpdatePass)

        if(s_Response == false) then
            -- TODO: Handle errors
            m_Logger:Error("error")
        elseif(s_Response == "queue") then
            m_Logger:Write("Queued message")
            table.insert(self.m_Queue.messages, l_Message)
        elseif(s_Response == true) then
            --TODO: Success message?
        end
    end

	-- Messages don't respond
end

function Editor:OnUpdatePass(p_Delta, p_Pass)
    if(p_Pass ~= UpdatePass.UpdatePass_PreSim or (#self.m_Queue.commands == 0 and #self.m_Queue.messages == 0)) then
        return
    end
    local s_Commands = {}
    for _,l_Command in ipairs(self.m_Queue.commands) do
        m_Logger:Write("Executing command in the correct UpdatePass: " .. l_Command.type)
        table.insert(s_Commands, l_Command)
    end

    self:OnReceiveCommands(s_Commands, p_Pass)

    local s_Messages = {}
    for _,l_Message in ipairs(self.m_Queue.messages) do
        m_Logger:Write("Executing message in the correct UpdatePass: " .. l_Message.type)
        table.insert(s_Messages, l_Message)
    end

    self:OnReceiveMessage(s_Messages, true, p_Pass)

    if(#self.m_Queue.commands > 0) then
        self.m_Queue.commands = {}
    end
    if(#self.m_Queue.messages > 0) then
        self.m_Queue.messages = {}
    end
end

--[[

	Messages

--]]

function Editor:MoveObject(p_Message)
	return ObjectManager:SetTransform(p_Message.guid, p_Message.transform, false)
end

function Editor:SetViewMode(p_Message)
	local p_WorldRenderSettings = ResourceManager:GetSettings("WorldRenderSettings")
	if p_WorldRenderSettings ~= nil then
		local s_WorldRenderSettings = WorldRenderSettings(p_WorldRenderSettings)
		s_WorldRenderSettings.viewMode = p_Message.viewMode
	else
		m_Logger:Error("Failed to get WorldRenderSettings")
		return false;
		-- Notify WebUI
	end
end

function Editor:SetScreenToWorldPosition(p_Message)
	self:SetPendingRaycast(RaycastType.Mouse, p_Message.direction)
end

function Editor:PreviewSpawn(p_Message, p_Arguments)
    local s_UserData = p_Message.userData
    return ObjectManager:SpawnBlueprint(p_Message.guid, s_UserData.reference.partitionGuid, s_UserData.reference.instanceGuid, s_UserData.transform, s_UserData.variation)
end
function Editor:PreviewDestroy(p_Message, p_UpdatePass)
    if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return "queue"
    end

    return ObjectManager:DestroyEntity(p_Message.guid)
end
function Editor:PreviewMove(p_Message, p_Arguments)
    return ObjectManager:SetTransform(p_Message.guid, p_Message.transform, false)
end
--[[

	Shit

--]]

function Editor:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
	local s_Response = VanillaBlueprintsParser:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
end

function Editor:Raycast()
	if not self.m_PendingRaycast then
		return
	end

	local s_Transform = ClientUtils:GetCameraTransform()
	local s_Direction = self.m_PendingRaycast.direction

	if(self.m_PendingRaycast.type == RaycastType.Camera) then
		s_Direction = Vec3(s_Transform.forward.x * -1, s_Transform.forward.y * -1, s_Transform.forward.z * -1)
	end


	if s_Transform.trans == Vec3(0,0,0) then -- Camera is below the ground. Creating an entity here would be useless.
		return
	end

	-- The freecam transform is inverted. Invert it back
	local s_CastPosition = Vec3(s_Transform.trans.x + (s_Direction.x * MAX_CAST_DISTANCE),
								s_Transform.trans.y + (s_Direction.y * MAX_CAST_DISTANCE),
								s_Transform.trans.z + (s_Direction.z * MAX_CAST_DISTANCE))

	local s_Raycast = RaycastManager:Raycast(s_Transform.trans, s_CastPosition, 2)

	if s_Raycast ~= nil then
		s_Transform.trans = s_Raycast.position
	else

		-- Raycast didn't hit anything. Spawn it in front of the player instead.
		s_Transform.trans = Vec3(s_Transform.trans.x + (s_Direction.x * FALLBACK_DISTANCE),
							s_Transform.trans.y + (s_Direction.y * FALLBACK_DISTANCE),
							s_Transform.trans.z + (s_Direction.z * FALLBACK_DISTANCE))
	end
	if(self.m_PendingRaycast.type == RaycastType.Camera) then
		WebUI:ExecuteJS(string.format('editor.SetRaycastPosition(%s, %s, %s)',
				s_Transform.trans.x, s_Transform.trans.y, s_Transform.trans.z))
	end
	if(self.m_PendingRaycast.type == RaycastType.Mouse) then
		WebUI:ExecuteJS(string.format('editor.SetScreenToWorldPosition(%s, %s, %s)',
				s_Transform.trans.x, s_Transform.trans.y, s_Transform.trans.z))
	end
			
	self.m_PendingRaycast = false

end
function Editor:CameraHasMoved()
	return self.m_CameraTransform ~= ClientUtils:GetCameraTransform()
end

function Editor:UpdateCameraTransform()
	local s_Transform = ClientUtils:GetCameraTransform()
	local pos = s_Transform.trans

	local left = s_Transform.left
	local up = s_Transform.up
	local forward = s_Transform.forward

	WebUI:ExecuteJS(string.format('editor.threeManager.UpdateCameraTransform(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);',
		left.x, left.y, left.z, up.x, up.y, up.z, forward.x, forward.y, forward.z, pos.x, pos.y, pos.z))
	self.m_CameraTransform = s_Transform
end

function Editor:SetPendingRaycast(p_Type, p_Direction)
	self.m_PendingRaycast = {
		type = p_Type,
		direction = p_Direction
	}
end

function Editor:OnPartitionLoaded(p_Partition)
	InstanceParser:OnPartitionLoaded(p_Partition)
end


return Editor()