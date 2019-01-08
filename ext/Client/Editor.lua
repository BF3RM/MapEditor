class 'Editor'


local m_InstanceParser = require "InstanceParser"


local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10000

function Editor:__init()
	print("Initializing EditorClient")
	self:RegisterVars()
end

function Editor:RegisterVars()
	self.m_PendingRaycast = false

	self.m_Commands = {
		SpawnBlueprintCommand = Backend.SpawnBlueprint,
		DestroyBlueprintCommand = Backend.DestroyBlueprint,
		SetTransformCommand = Backend.SetTransform,
		SelectGameObjectCommand = Backend.SelectGameObject,
		CreateGroupCommand = Backend.CreateGroup
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
		SelectObject3DMessage = self.SelectObject3D
	}

	self.m_Queue = {};

	self.m_TransactionId = 0
	self.m_GameObjects = {}
end


function Editor:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		m_InstanceParser:FillVariations()

		WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(m_InstanceParser.m_Blueprints)))
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
	self:UpdateCameraTransform()
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
			table.insert(self.m_Queue, l_Command)
		elseif(s_Response.userData == nil) then
			print("MISSING USERDATA!")
		else
			self.m_GameObjects[l_Command.guid] = MergeUserdata(self.m_GameObjects[l_Command.guid], s_Response.userData)
			table.insert(s_Responses, s_Response)
		end
	end
	if(#s_Responses > 0) then
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(EncodeParams(s_Responses))))
	end
end

function Editor:OnReceiveMessage(p_Message)
	local s_Message = DecodeParams(json.decode(p_Message))

	local s_Function = self.m_Messages[s_Message.type]
	if(s_Function == nil) then
		print("Attempted to call a nil function: " .. s_Message.type)
		return false
	end

	local s_Response = s_Function(self, s_Message)
	if(s_Response == false) then
		-- TODO: Handle errors
		print("error")
		return
	end
	-- Messages don't respond
end

function Editor:OnUpdatePass(p_Delta, p_Pass)
    if(p_Pass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0) then
        return
    end
    local s_Responses = {}
    for k,l_Command in ipairs(self.m_Queue) do
        print("Executing command in the correct UpdatePass: " .. l_Command.type)
        table.insert(s_Responses, l_Command)
    end
    self:OnReceiveCommand(s_Responses, true, p_Pass)

    if(#self.m_Queue > 0) then
        self.m_Queue = {}
    end
end

--[[

	Messages

--]]

function Editor:MoveObject(p_Message)
	local s_Result = ObjectManager:SetTransform(p_Message.guid, p_Message.transform, false)

	if(s_Result == false) then
		-- Notify WebUI of failed
		print("Failed to move object")
		return false
	end
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
--[[

	Shit

--]]


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