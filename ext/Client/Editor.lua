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

	self.m_CameraTransform = nil
	self.m_LevelLoaded = false
end

function Editor:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		InstanceParser:FillVariations()
		self:InitializeUIData()
    end

	if p_Message.type == MessageType.ClientCharacterLocalPlayerSetMessage then
		local s_LocalPlayer = PlayerManager:GetLocalPlayer()

		if s_LocalPlayer == nil then
			m_Logger:Error("Local player is nil")
			return
		end

		--- Client requests all updates that the server has.
		NetEvents:SendLocal("ProjectManager:RequestProjectHeaderUpdate") -- Todo: move this to other class
		WebUI:ExecuteJS(string.format("editor.setPlayerName('%s')", s_LocalPlayer.name))
	end
end

function Editor:OnUpdate(p_Delta, p_SimulationDelta)
	-- Raycast has to be done in update
	if(self.m_LevelLoaded and FreeCam:GetCameraMode() == CameraMode.FreeCam and self:CameraHasMoved() == true) then
		self:UpdateCameraTransform()
	end

	self:Raycast()
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

function Editor:InitializeUIData(p_CommandActionResults)
	if(p_CommandActionResults == nil) then
		print("No CommandActionResult")
		return
	end
	local s_LevelDatas = InstanceParser:GetLevelDatas()

	for _, v in pairs(s_LevelDatas) do
		WebUI:ExecuteJS(string.format("editor.gameContext.LoadLevel('%s')", json.encode(v)))
	end

	WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(InstanceParser.m_Blueprints)))
	for _,v in pairs(p_CommandActionResults) do
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", v))
	end
end

return Editor()
