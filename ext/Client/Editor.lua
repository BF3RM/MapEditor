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
		MoveObjectMessage = self.MoveObject
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
    print(p_Command)
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
		print("failed")
		return false
	end
end

--[[

	Shit

--]]


function Editor:Raycast()
	if not self.m_PendingRaycast then
		return
	end

	local s_Transform = ClientUtils:GetCameraTransform()

	if s_Transform.trans == Vec3(0,0,0) then -- Camera is below the ground. Creating an entity here would be useless.

		return
	end

	-- The freecam transform is inverted. Invert it back

	local s_CameraForward = Vec3(s_Transform.forward.x * -1, s_Transform.forward.y * -1, s_Transform.forward.z * -1)

	local s_CastPosition = Vec3(s_Transform.trans.x + (s_CameraForward.x * MAX_CAST_DISTANCE),
								s_Transform.trans.y + (s_CameraForward.y * MAX_CAST_DISTANCE),
								s_Transform.trans.z + (s_CameraForward.z * MAX_CAST_DISTANCE))

	local s_Raycast = RaycastManager:Raycast(s_Transform.trans, s_CastPosition, 2)

	-- local s_Transform = LinearTransform(
	-- 	Vec3(1,0,0),
	-- 	Vec3(0,1,0),
	-- 	Vec3(0,0,1),
	-- 	s_Transform.trans
	-- )


	if s_Raycast ~= nil then
		s_Transform.trans = s_Raycast.position
	else

		-- Raycast didn't hit anything. Spawn it in front of the player instead.
		s_Transform.trans = Vec3(s_Transform.trans.x + (s_CameraForward.x * FALLBACK_DISTANCE),
							s_Transform.trans.y + (s_CameraForward.y * FALLBACK_DISTANCE),
							s_Transform.trans.z + (s_CameraForward.z * FALLBACK_DISTANCE))
	end

	WebUI:ExecuteJS(string.format('editor.UpdateRaycastPosition(%s, %s, %s)',
		s_Transform.trans.x, s_Transform.trans.y, s_Transform.trans.z))

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

function Editor:SetPendingRaycast()
	self.m_PendingRaycast = true
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