class 'Editor'


local m_InstanceParser = require "InstanceParser"


local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10

function Editor:__init()
	print("Initializing EditorClient")
	self:RegisterVars()

end

function Editor:RegisterVars()
	self.m_PendingRaycast = false
    self.m_FreecamMoving = false

	self.m_Commands = {
		SpawnBlueprintCommand = Backend.SpawnBlueprint,
		DestroyBlueprintCommand = Backend.DestroyBlueprint,
		SetTransformCommand = Backend.SetTransform,
		SelectGameObjectCommand = Backend.SelectGameObject,
		CreateGroupCommand = Backend.CreateGroup,
	}

	self.m_Changes = {
		reference = "SpawnBlueprintCommand",
		destroyed = "DestroyBlueprintCommand",
		transform = "SetTransformCommand",
	}

	self.m_Messages = {
		MoveObjectMessage = self.MoveObject,
		SetViewModeMessage = self.SetViewMode,
		SetScreenToWorldPositionMessage = self.SetScreenToWorldPosition,
		SelectObject3DMessage = self.SelectObject3D,
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
    self.m_VanillaObjects = {}
end

function Editor:OnPartitionLoaded(p_Partition)
    m_InstanceParser:OnPartitionLoaded(p_Partition)
end

function Editor:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		m_InstanceParser:FillVariations()

		WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(m_InstanceParser.m_Blueprints)))
        WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(self.m_VanillaObjects)))

    end
	if p_Message.type == MessageType.ClientCharacterLocalPlayerSetMessage then
		local s_LocalPlayer = PlayerManager:GetLocalPlayer()

		if s_LocalPlayer == nil then
			error("Local player is nil")
			return
		end
		print("Requesting update")
		NetEvents:SendLocal("MapEditorServer:RequestUpdate", 1)
		WebUI:ExecuteJS(string.format("editor.setPlayerName('%s')", s_LocalPlayer.name))
	end
end

function Editor:OnReceiveUpdate(p_Update)
	local s_Responses = {}
	for k,v in pairs(p_Update) do
		if(self.m_GameObjects[k] == nil) then
			local s_Command = {
				type = "SpawnBlueprintCommand",
				guid = k,
				userData = p_Update[k]
			}
			table.insert(s_Responses, s_Command)
		else
			local s_Changes = GetChanges(self.m_GameObjects[k], p_Update[k])
			-- Hopefully this will never happen. It's hard to test these changes since they require a desync.
			if(#s_Changes > 0) then
				print("--------------------------------------------------------------------")
				print("If you ever see this, please report it on the repo.")
				print(s_Changes)
				print("--------------------------------------------------------------------")
			end
		end

	end
	self:OnReceiveCommand(s_Responses, true)
end

function Editor:OnUpdate(p_Delta, p_SimulationDelta)
    if(self.m_FreecamMoving) then
        self:UpdateCameraTransform()
    end
	-- Raycast has to be done in update
	self:Raycast()
end


function Editor:OnSendToServer(p_Command)
	NetEvents:SendLocal('MapEditorServer:ReceiveCommand', p_Command)
end

function Editor:OnReceiveCommand(p_Command, p_Raw, p_UpdatePass)
	local s_Command = p_Command
	if p_Raw == nil then
		s_Command = DecodeParams(json.decode(p_Command))
	end

	local s_Responses = {}
	for k, l_Command in ipairs(s_Command) do
		local s_Function = self.m_Commands[l_Command.type]
		if(s_Function == nil) then
			print("Attempted to call a nil function: " .. l_Command.type)
			return false
		end
		local s_Response = s_Function(self, l_Command, p_UpdatePass)
		if(s_Response == false) then
			-- TODO: Handle errors
			print("error")
		elseif(s_Response == "queue") then
			print("Queued command")
			table.insert(self.m_Queue.commands, l_Command)
		else
			self.m_GameObjects[l_Command.guid] = MergeUserdata(self.m_GameObjects[l_Command.guid], s_Response.userData)
			table.insert(s_Responses, s_Response)
		end
	end
	if(#s_Responses > 0) then
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(s_Responses)))
	end
end

function Editor:OnReceiveMessage(p_Messages, p_Raw, p_UpdatePass)
    local s_Messages = p_Messages
    if p_Raw == nil then
        s_Messages = DecodeParams(json.decode(p_Messages))
    end
    for k, l_Message in ipairs(s_Messages) do


        local s_Function = self.m_Messages[l_Message.type]
        if(s_Function == nil) then
            print("Attempted to call a nil function: " .. l_Message.type)
            return false
        end

        local s_Response = s_Function(self, l_Message, p_UpdatePass)

        if(s_Response == false) then
            -- TODO: Handle errors
            print("error")
        elseif(s_Response == "queue") then
            print("Queued message")
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
    for k,l_Command in ipairs(self.m_Queue.commands) do
        print("Executing command in the correct UpdatePass: " .. l_Command.type)
        table.insert(s_Commands, l_Command)
    end

    self:OnReceiveCommand(s_Commands, true, p_Pass)

    local s_Messages = {}
    for k,l_Message in ipairs(self.m_Queue.messages) do
        print("Executing message in the correct UpdatePass: " .. l_Message.type)
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
		print("Failed to get WorldRenderSettings")
		return false;
		-- Notify WebUI
	end
end

function Editor:SetScreenToWorldPosition(p_Message)
	self:SetPendingRaycast(RaycastType.Mouse, p_Message.direction)
end
function Editor:SelectObject3D(p_Message, p_Arguments)
	self:SetPendingRaycast(RaycastType.Select, p_Message.direction)
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
    --Avoid nested blueprints for now...

    if(p_Parent ~= nil) and (m_InstanceParser:GetPartition(tostring(p_Parent.instanceGuid)) ~= nil or
            (p_Blueprint.typeInfo.name == "WorldPartData" or p_Blueprint.typeInfo.name == "SubWorldData" or p_Parent.typeInfo.name == "SubWorldReferenceObjectData")) then

        local x = p_Hook:Call()
        p_Hook:Return(x)
        return
    end
    --print(p_Blueprint.typeInfo.name .. " | " .. tostring(p_Blueprint.instanceGuid) .. tostring(p_Parent.typeInfo.name ) .. " | " .. tostring(p_Parent.instanceGuid))
    local s_Response = Backend:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
    table.insert(self.m_VanillaObjects, s_Response)

end

function Editor:OnEntityCreate(p_Hook, p_Data, p_Transform)
    if p_Data == nil then
        print("Didnt get no data")
    else
        local s_Entity = p_Hook:Call(p_Data, p_Transform)
        local s_PartitionGuid = m_InstanceParser:GetPartition(p_Data.instanceGuid)
        if(s_PartitionGuid == nil) then
            return
        end
        local s_Partition = ResourceManager:FindDatabasePartition(Guid(s_PartitionGuid))
        if(s_Partition == nil) then
            return
        end
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

	-- Type is select, we hit a rigidBody and it's a SpatialEntity
	if(self.m_PendingRaycast.type == RaycastType.Select and s_Raycast ~= nil and s_Raycast.rigidBody ~= nil and s_Raycast.rigidBody:Is("SpatialEntity")) then

		-- Catch all entities in view. SpatialRaycast is really wide :shrug:
		local s_Entities = RaycastManager:SpatialRaycast(s_Transform.trans, s_CastPosition, SpatialQueryFlags.AllGrids)
		-- Store the transform of the collider we hit
		local s_RigidBodyHitTransform = SpatialEntity(s_Raycast.rigidBody).transform

		if(s_Entities ~= nil and #s_Entities > 0) then
			for k, l_Entity in pairs(s_Entities) do
				-- Filter the entities to not include physics entities
				if(l_Entity:Is("SpatialEntity") and
						not l_Entity:Is("StaticPhysicsEntity") and
						not l_Entity:Is("GroupPhysicsEntity") and
						not l_Entity:Is("ClientWaterEntity") and
						not l_Entity:Is("WaterPhysicsEntity") and
						not l_Entity:Is("ClientSoldierEntity") and
						not l_Entity:Is("DebrisClusterContainerEntity") and
						not l_Entity:Is("CharacterPhysicsEntity")
				) then
					local s_Entity = SpatialEntity(l_Entity)
					-- Compare the collider's transform to the actual entity's transform
					if(s_RigidBodyHitTransform.trans == s_Entity.transform.trans ) then
						-- Check if we have that entity's instanceId stored
						local s_Guid = ObjectManager:GetGuidFromInstanceID(s_Entity.instanceID)
						if(s_Guid ~= nil) then
							-- Select it
							WebUI:ExecuteJS(string.format('editor.Select("%s")', s_Guid))
						end
					end
				end
			end
		end
	end

	self.m_PendingRaycast = false

end

function Editor:UpdateCameraTransform()
	local s_Transform = ClientUtils:GetCameraTransform()
	local pos = s_Transform.trans

	local left = s_Transform.left
	local up = s_Transform.up
	local forward = s_Transform.forward

	WebUI:ExecuteJS(string.format('editor.threeManager.UpdateCameraTransform(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);',
		left.x, left.y, left.z, up.x, up.y, up.z, forward.x, forward.y, forward.z, pos.x, pos.y, pos.z))

end

function Editor:SetPendingRaycast(p_Type, p_Direction)
	self.m_PendingRaycast = {
		type = p_Type,
		direction = p_Direction
	}
end


return Editor()