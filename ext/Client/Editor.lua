class 'Editor'

local m_ClientEntityManager = require "ClientEntityManager"
local m_InstanceParser = require "InstanceParser"


local MAX_CAST_DISTANCE = 1000
local FALLBACK_DISTANCE = 1000

function Editor:__init()
	print("Initializing Editor")
	self:RegisterVars()
	self:RegisterEvents()
end

function Editor:RegisterVars()
	self.m_PendingRaycast = false

    self.m_Commands = {
        SpawnBlueprintCommand = self.SpawnBlueprint,
        DestroyBlueprintCommand = self.DestroyBlueprint,
        SetTransformCommand = self.SetTransform,
        SelectEntityCommand = self.SelectEntity
    }
    self.m_Messages = {
        MoveObjectMessage = self.MoveObject
    }
end

function Editor:RegisterEvents()

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

		WebUI:ExecuteJS(string.format("editor.setPlayerName('%s')", s_LocalPlayer.name))
	end
end




function Editor:OnLevelDestroy()
    m_ClientEntityManager:Clear()
    m_InstanceParser:Clear()

end



function Editor:OnUpdate(p_Delta, p_SimulationDelta)
	self:UpdateCameraTransform()

	self:Raycast()
end

function Editor:OnReceiveCommand(p_Command)
    local s_Command = self:DecodeParams(json.decode(p_Command))
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

    Commands

--]]
function Editor:SpawnBlueprint(p_Command)
    local s_Params = p_Command.parameters
    local s_SpawnResult = m_ClientEntityManager:SpawnBlueprint(s_Params.guid, s_Params.reference.partitionGuid, s_Params.reference.instanceGuid, s_Params.transform, s_Params.variation)

    if(s_SpawnResult == false) then
        -- Send error to webui
        print("Failed to spawn blueprint. ")
        print(s_Command)
        return false
    end

    local s_LocalPlayer = PlayerManager:GetLocalPlayer()

    local s_Children = {}
    for k,l_Entity in ipairs(s_SpawnResult) do
        local s_Data = l_Entity.data
        local s_Entity = SpatialEntity(l_Entity)

        s_Children[#s_Children + 1 ] = {
            guid = s_Entity.uniqueID,
            type = l_Entity.typeInfo.name,
            aabb = {
                min = tostring(s_Entity.aabb.min),
                max = tostring(s_Entity.aabb.max),
                trans = tostring(ToLocal(s_Entity.aabbTransform, s_Params.transform))
            },
            reference = {

                instanceGuid = tostring(s_Data.instanceGuid),
                --partitionGuid = tostring(s_Data.instanceGuid),
                type = s_Data.typeInfo.name
                -- transform?
            }
        }
    end

    local s_Response = {
        guid = s_Params.guid,
        sender = s_LocalPlayer.name,
        name = s_Params.name,
        ['type'] = 'SpawnedBlueprint',
        parameters = s_Params,
        children = s_Children
    }

    return s_Response
end

function Editor:DestroyBlueprint(p_Command)
    local s_Entities = m_ClientEntityManager:GetEntityByGuid(p_Command.guid)
    if(#s_Entities == 0 or s_Entities == false) then
        print("Failed to get entities")
        return false
    end
    for i, entity in pairs(s_Entities) do
        if entity ~= nil then
            print(entity.typeInfo.name)
            print("destroying")
            entity:Destroy()
            print("destroyed")
        end
    end

    local s_Response = {
        type = "DestroyedBlueprint",
        guid =  s_Command.guid
    }

    return s_Response
end


function Editor:SelectEntity(p_Command)

    if ( m_ClientEntityManager:GetEntityByGuid(p_Command.guid) == nil) then
        return false
    end
    local s_Response = {
        guid = p_Command.guid,
        ['type'] = 'SelectedEntity'
    }
   return s_Response
end

function Editor:SetTransform(p_Command)
    local s_Result = m_ClientEntityManager:SetTransform(p_Command.guid, p_Command.parameters.transform)

    if(s_Result == false) then
        -- Notify WebUI of failed
        print("failed")
        return false
    end

    local s_Response = {
        type = "SetTransform",
        guid = p_Command.guid,
        transform = p_Command.parameters.transform
    }
    return s_Response
end



--[[

    Messages

--]]

function Editor:MoveObject(p_Message)
    local s_Result = m_ClientEntityManager:SetTransform(p_Message.guid, p_Message.transform)

    if(s_Result == false) then
        -- Notify WebUI of failed
        print("failed")
        return false
    end
end

--[[

    Shit

--]]

function Editor:Error(p_Message, p_Command)
    local s_Response = {
        type = "Error",
        message = p_Message,
        command = p_Command
    }
    return s_Response
end

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

	WebUI:ExecuteJS(string.format('editor.webGL.UpdateCameraTransform(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);', 
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