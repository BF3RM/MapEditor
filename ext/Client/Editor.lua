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
end

function Editor:RegisterEvents()

end

function Editor:OnEngineMessage(p_Message) 
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		print("MessageType.ClientLevelFinalizedMessage")
		m_InstanceParser:FillVariations()

		WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(m_InstanceParser.m_Blueprints)))
		local s_LocalPlayer = PlayerManager:GetLocalPlayer()

		if s_LocalPlayer == nil then
			error("Local player is nil")
			return
		end

		WebUI:ExecuteJS(string.format("editor.setPlayerName('%s')", s_LocalPlayer.name))
	end
end


function Editor:OnUpdate(p_Delta, p_SimulationDelta)
	self:UpdateCameraTransform()

	self:Raycast()
end

function Editor:OnSelectEntity(p_JSONparams)
    print(p_JSONparams)
    local s_Params = self:DecodeParams(json.decode(p_JSONparams))
    if ( m_ClientEntityManager:GetEntityByGuid(s_Params.guid) ~= nil) then
        local s_Response = {
            guid = s_Params.guid,
            ['type'] = 'SelectedEntity'
        }
        WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(s_Response)))
    end
end

function Editor:OnSpawnBlueprint(p_JSONparams)
	local s_Command = self:DecodeParams(json.decode(p_JSONparams))
    local s_Params = s_Command.parameters
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
        print("initial: " .. tostring(s_Params.transform))
        print("aabb   : " .. tostring(s_Entity.aabbTransform))
        print("min: " .. tostring(s_Entity.aabb.min))
        print("aabb   : " .. tostring(s_Entity.aabb.max))
        s_Children[#s_Children + 1 ] = {
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
        print("Thats all folks")
    end
    local s_Response = {
        guid = s_Params.guid,
        sender = s_LocalPlayer.name,
        name = s_Params.name,
        ['type'] = 'SpawnedBlueprint',
        parameters = self:EncodeParams(s_Params),
        children = s_Children
    }

    print(s_Response)
    print(json.encode(s_Response))
    WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(s_Response)))

end

function Editor:OnSetTransform(p_JSONparams)
    local s_Command = self:DecodeParams(json.decode(p_JSONparams))
    print(s_Command)
    local s_Result = m_ClientEntityManager:SetTransform(s_Command.guid, s_Command.parameters.transform)

    if(s_Result == false) then
        -- Notify WebUI of failed
        print("failed")
        return false
    end

    local s_Response = {
        type = "SetTransform",
        guid = s_Command.guid,
        transform = s_Command.parameters.transform
    }
    print(s_Response)
    WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(self:EncodeParams(s_Response))))
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
    print(a.trans.x)
    print(b.trans.x)
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
				
            print("converted lineartransform")
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