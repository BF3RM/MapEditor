class 'Editor'

local m_Logger = Logger("Editor", true)

local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10

local m_CurrentProjectHeader

function Editor:__init()
	m_Logger:Write("Initializing EditorClient")
	self:RegisterVars()
end

function Editor:RegisterVars()
	self.m_PendingRaycast = false

	self.m_Queue = {
        commands = {},
        messages = {}
    };

	self.m_TransactionId = 0
	self.m_GameObjectTransferDatas = {}
	self.m_CommandActionResults = { }

	self.m_CameraTransform = nil

	self.m_LevelLoaded = false
end

function Editor:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		InstanceParser:FillVariations()
		local s_LevelDatas = InstanceParser:GetLevelDatas()

		for _, v in pairs(s_LevelDatas) do
			WebUI:ExecuteJS(string.format("editor.gameContext.LoadLevel('%s')", json.encode(v)))
		end

		WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(InstanceParser.m_Blueprints)))
		self.m_LevelLoaded = true
    end

	if p_Message.type == MessageType.ClientCharacterLocalPlayerSetMessage then
		local s_LocalPlayer = PlayerManager:GetLocalPlayer()

		if s_LocalPlayer == nil then
			m_Logger:Error("Local player is nil")
			return
		end

		NetEvents:SendLocal("MapEditorServer:RequestUpdate", 1)
		NetEvents:SendLocal("MapEditorServer:RequestProjectHeaderUpdate")
		WebUI:ExecuteJS(string.format("editor.setPlayerName('%s')", s_LocalPlayer.name))
	end
end

function Editor:OnReceiveUpdate(p_UpdatedGameObjectTransferDatas)
	local s_Responses = {}

	for s_Guid, s_GameObjectTransferData in pairs(p_UpdatedGameObjectTransferDatas) do
		if(self.m_GameObjectTransferDatas[s_Guid] == nil) then
			local s_StringGuid = tostring(s_Guid)

			--If it's a vanilla object we move it or we delete it. If not we spawn a new object.
			if IsVanilla(s_StringGuid)then
				local s_Command

                if s_GameObject.isDeleted then
					s_Command = {
						type = "DestroyBlueprintCommand",
						gameObjectTransferData = s_GameObjectTransferData
					}
				else
					s_Command = {

						type = "SetTransformCommand",
						gameObjectTransferData = s_GameObjectTransferData
					}
				end

				table.insert(s_Responses, s_Command)
			else
				local s_Command = {
					type = "SpawnBlueprintCommand",
					gameObjectTransferData = s_GameObjectTransferData
				}

				table.insert(s_Responses, s_Command)
			end
		else
			local s_Changes = GetChanges(self.m_GameObjectTransferDatas[s_Guid], s_GameObjectTransferData)
			-- Hopefully this will never happen. It's hard to test these changes since they require a desync.
			if(#s_Changes > 0) then
				m_Logger:Write("--------------------------------------------------------------------")
				m_Logger:Write("If you ever see this, please report it on the repo.")
				print(s_Changes) -- logger wont print the table, we have to use print
				m_Logger:Write("--------------------------------------------------------------------")
			end
		end

	end

	self:OnReceiveCommands(s_Responses, nil)
end

-- function Editor:OnReceiveSave(p_SaveFile)
-- 	m_Logger:Write("Save received")
-- 	p_SaveFile = p_SaveFile or "Error"
-- 	WebUI:ExecuteJS("editor.projectManager.SetSave('"..p_SaveFile.."')")
-- end

function Editor:OnReceiveProjectData(p_ProjectData)
	-- TODO: Handle properly in the project admin view
-- 	WebUI:ExecuteJS("editor.projectManager.SetSave('"..p_SaveFile.."')")
end

function Editor:OnUpdate(p_Delta, p_SimulationDelta)
	-- Raycast has to be done in update
	if(self.m_LevelLoaded and FreeCam:GetCameraMode() == CameraMode.FreeCam and self:CameraHasMoved() == true) then
		self:UpdateCameraTransform()
	end

	self:Raycast()
end

function Editor:OnRequestProjectSave(p_ProjectName, p_MapName, p_RequiredBundles)
	m_Logger:Write("Save requested")
	NetEvents:SendLocal("MapEditorServer:RequestProjectSave", p_ProjectName, p_MapName, p_RequiredBundles)
end

function Editor:OnRequestProjectLoad(p_ProjectName)
	m_Logger:Write("Load requested")
	NetEvents:SendLocal("MapEditorServer:RequestProjectLoad", p_ProjectName)
end

function Editor:OnRequestProjectData(p_ProjectName)
	m_Logger:Write("Project Data requested")
	NetEvents:SendLocal("MapEditorServer:RequestProjectData", p_ProjectName)
end

function Editor:OnReceiveCurrentProjectHeader(p_ProjectHeader)
	m_CurrentProjectHeader = p_ProjectHeader
end

function Editor:OnSendCommandsToServer(p_Command)
	NetEvents:SendLocal('MapEditorServer:ReceiveCommand', p_Command)
end

--function Editor:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
--	VanillaBlueprintsParser:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
--end

function Editor:OnReceiveCommands(p_Commands, p_UpdatePass)
	local s_CommandActionResults = {}
	for _, l_Command in ipairs(p_Commands) do
		local s_CommandAction = CommandActions[l_Command.type]
		if(s_CommandAction == nil) then
			m_Logger:Error("Attempted to call a nil command action: " .. l_Command.type)
			return false
		end

		local s_CommandActionResult, s_ActionResultType = s_CommandAction(self, l_Command, p_UpdatePass)

		if (s_ActionResultType == ActionResultType.Success) then
			if (s_CommandActionResult.gameObjectTransferData == nil) then
				m_Logger:Error("There must be a gameObjectTransferData defined for sending back the CommandActionResult.")
			end

			local s_GameObjectTransferData = s_CommandActionResult.gameObjectTransferData

			-- Spawned objects are sent when they are ready on OnGameObjectReady
			if l_Command.type ~= "SpawnBlueprintCommand" then
				table.insert(s_CommandActionResults, s_CommandActionResult)
			end

			local s_Guid = s_GameObjectTransferData.guid
			-- TODO: Dont store all gameobjecttransferdatas, we have the gameobjectmanager.gameobjects for that.
			self.m_GameObjectTransferDatas[s_Guid] = MergeGameObjectTransferData(self.m_GameObjectTransferDatas[s_Guid], s_GameObjectTransferData) -- overwrite our table with gameObjectTransferDatas so we have the current most version

		elseif (s_ActionResultType == ActionResultType.Queue) then
			m_Logger:Write("Queued command: " .. l_Command.type)
			table.insert(self.m_Queue.commands, l_Command)
		elseif (s_ActionResultType == ActionResultType.Failure) then
			-- TODO: Handle errors
			m_Logger:Warning("Failed to execute command: " .. l_Command.type)
		else
			m_Logger:Error("Unknown ActionResultType for command: " .. l_Command.type)
		end
	end

	if(#s_CommandActionResults > 0) then
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(s_CommandActionResults)))
	end
end

function Editor:OnGameObjectReady(p_GameObject)
	m_Logger:Write("Editor:OnGameObjectReady(p_GameObject)")
	self:CreateCommandActionResultsRecursively(p_GameObject)

	if(#self.m_CommandActionResults > 0) then
		m_Logger:Write("Sending stuff to JS")
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(self.m_CommandActionResults)))
	else
		m_Logger:Error("OnGameObjectReady: No results were yielded for some reason")
	end

	self.m_CommandActionResults = { }
end

function Editor:CreateCommandActionResultsRecursively(p_GameObject)
	local s_GameObjectTransferData = p_GameObject:GetGameObjectTransferData()

	local s_CommandActionResult = {
		sender = p_GameObject.creatorName,
		type = 'SpawnedBlueprint',
		gameObjectTransferData = s_GameObjectTransferData,
	}

	for _, s_ChildGameObject in pairs(p_GameObject.children) do
		self:CreateCommandActionResultsRecursively(s_ChildGameObject)
	end

	table.insert(self.m_CommandActionResults, s_CommandActionResult)
end

function Editor:OnReceiveMessage(p_Messages, p_Raw, p_UpdatePass)
    local s_Messages = p_Messages
    if p_Raw == nil then
        s_Messages = DecodeParams(json.decode(p_Messages))
    end

    for _, l_Message in ipairs(s_Messages) do

        local s_MessageAction = MessageActions[l_Message.type]
        if(s_MessageAction == nil) then
            m_Logger:Error("Attempted to call a nil function: " .. l_Message.type)
            return false
        end

        local s_ActionResultType = s_MessageAction(self, l_Message, p_UpdatePass)

		if (s_ActionResultType == ActionResultType.Success) then
			return

		elseif (s_ActionResultType == ActionResultType.Queue) then
			table.insert(self.m_Queue.messages, l_Message)

		elseif (s_ActionResultType == ActionResultType.Failure) then
			m_Logger:Error("Failed to get a valid return for executing message: " .. tostring(l_Message.type))

		else
			m_Logger:Error("Unknown ActionResultType for message: " .. l_Message.type)
		end
    end
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

	-- The freeCam transform is inverted. Invert it back
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