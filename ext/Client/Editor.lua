class 'Editor'


local m_InstanceParser = require "InstanceParser"


local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10000

function Editor:__init()
	print("Initializing Editor")
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

    for k,v in pairs(p_Update) do
        if(self.m_GameObjects[k] == nil) then
            local s_Command = {
                type = "SpawnBlueprintCommand",
                guid = k,
                userData = p_Update[k]
            }
            self:OnReceiveCommand(json.encode(s_Command))
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
end

function Editor:OnUpdate(p_Delta, p_SimulationDelta)
	self:UpdateCameraTransform()
    -- Raycast has to be done in update
	self:Raycast()
end


function Editor:OnSendToServer(p_Command)
    NetEvents:SendLocal('MapEditorServer:ReceiveCommand', p_Command)
end

function Editor:OnUpdatePass(p_Delta, p_Pass)
    if(p_Pass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0) then
        return
    end

    for k,l_Command in ipairs(self.m_Queue) do
        l_Command.queued = true
        print("Executing command delayed: " .. l_Command.type)
        self:OnReceiveCommand(json.encode(self:EncodeParams(l_Command)))
    end
    if(#self.m_Queue > 0) then
        self.m_Queue = {}
    end
end


function Editor:OnReceiveCommand(p_Command, raw)
    local s_Command = p_Command

    if(raw == nil) then
        s_Command = self:DecodeParams(json.decode(p_Command))
    end

	local s_Function = self.m_Commands[s_Command.type]
	if(s_Function == nil) then
		print("Attempted to call a nil function: " .. s_Command.type)
		return false
	end
	local s_Response = s_Function(self, s_Command)
	if(s_Response == false) then
		-- TODO: Handle errors
		print("error")
		return
	end
	if(s_Response == "queue") then
		print("Queued command")
        table.insert(self.m_Queue, s_Command)
        return
	end

    if(s_Response.userData == nil) then
        print("MISSING USERDATA!")
    end
    self.m_GameObjects[s_Command.guid] = MergeUserdata(self.m_GameObjects[s_Command.guid], s_Response.userData)

	WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(self:EncodeParams(s_Response))))
end

function Editor:OnReceiveMessage(p_Message)
	local s_Message = self:DecodeParams(json.decode(p_Message))

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

function ToLocal(a,b)
	local LT = LinearTransform()
	LT.left = a.left
	LT.up = a.up
	LT.forward = a.forward
	LT.trans.x = a.trans.x - b.trans.x -- attempt to index a nil value (field 'trans')
	LT.trans.y = a.trans.y - b.trans.y
	LT.trans.z = a.trans.z - b.trans.z
	return LT
end

function MergeUserdata(p_Old, p_New)
    if(p_Old == nil) then
        return p_New
    end
    for k,v in pairs(p_New) do
        p_Old[k] = v
    end
    return p_Old
end

function GetChanges(p_Old, p_New)
    local s_Changes = {}
    for k,v in pairs(p_New) do
        if(tostring(p_Old[k]) ~= tostring(p_New[k])) then
            if type(p_Old[k]) == "table" then
                for k1,v1 in pairs(p_Old[k]) do
                    if(p_Old[k][k1] ~= p_New[k][k1]) then
                        table.insert(s_Changes, k)
                    end
                end
            else
                table.insert(s_Changes, k)
            end
        end
    end
    return s_Changes
end

function Editor:DecodeParams(p_Table)
	for s_Key, s_Value in pairs(p_Table) do
		if s_Key == 'transform' then
			local s_LinearTransform = LinearTransform(
				Vec3(s_Value.left.x, s_Value.left.y, s_Value.left.z),
				Vec3(s_Value.up.x, s_Value.up.y, s_Value.up.z),
				Vec3(s_Value.forward.x, s_Value.forward.y, s_Value.forward.z),
				Vec3(s_Value.trans.x, s_Value.trans.y, s_Value.trans.z))

			p_Table[s_Key] = s_LinearTransform

		elseif type(s_Value) == "table" then
			self:DecodeParams(s_Value)
		end

	end

	return p_Table
end

function Editor:EncodeParams(p_Table)
	if(p_Table == nil) then
		error("Passed a nil table?!")
	end
	for s_Key, s_Value in pairs(p_Table) do
		if s_Key == 'transform' then
			p_Table[s_Key] = tostring(s_Value)

		elseif type(s_Value) == "table" then
			self:EncodeParams(s_Value)
		end

	end

	return p_Table
end
return Editor()