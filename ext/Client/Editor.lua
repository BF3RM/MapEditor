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
	--self.m_LevelLoaded = false
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
		NetEvents:SendLocal("ProjectManager:RequestProjectHeaders") -- Todo: move this to other class
		NetEvents:SendLocal("ProjectManager:RequestProjectHeaderUpdate") -- Todo: move this to other class
		WebUpdater:AddUpdate('SetPlayerName', s_LocalPlayer.name)
		print("Set player name to: " .. s_LocalPlayer.name)
	end
end

function Editor:OnUpdate(p_Delta, p_SimulationDelta)
	-- Raycast has to be done in update
	self:Raycast()
end

function Editor:OnDrawHud()
	if( FreeCam:GetCameraMode() == CameraMode.FreeCam and self:CameraHasMoved() == true) then
		self:UpdateCameraTransform()
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
		WebUpdater:AddUpdate('SetRaycastPosition', s_Transform.trans)
	end
	if(self.m_PendingRaycast.type == RaycastType.Mouse) then
		WebUpdater:AddUpdate('SetScreenToWorldPosition', {
			type = "SetScreenToWorldPosition",
			position = s_Transform.trans
		})
	end

	self.m_PendingRaycast = false
end

function Editor:CameraHasMoved()
	return self.m_CameraTransform ~= ClientUtils:GetCameraTransform()
end

function Editor:UpdateCameraTransform()
	local s_Transform = ClientUtils:GetCameraTransform()
	--WebUpdater:AddUpdate('UpdateCameraTransform', s_Transform, true)
	--[[
		JSON encoded so it's faster to parse
	--]]
	WebUI:ExecuteJS(string.format('editor.threeManager.updateCameraTransform(JSON.parse(\'%s\'))', json.encode(s_Transform)))
	self.m_CameraTransform = s_Transform
end

function Editor:SetPendingRaycast(p_Type, p_Direction)
	self.m_PendingRaycast = {
		type = p_Type,
		direction = p_Direction
	}
end

function Editor:InitializeUIData(p_CommandActionResults)
	if(p_CommandActionResults == null) then
		p_CommandActionResults = {}
	end
	local s_LevelDatas = InstanceParser:GetLevelDatas()
	local s_LocalPlayer = PlayerManager:GetLocalPlayer()

	if s_LocalPlayer ~= nil then
		m_Logger:Error("Local player is nil")
		WebUpdater:AddUpdate('SetPlayerName', s_LocalPlayer.name)
	end

	for _, l_LevelData in pairs(s_LevelDatas) do
		WebUpdater:AddUpdate('LoadLevel', json.encode(l_LevelData))
	end

	WebUpdater:AddUpdate('RegisterBlueprints', json.encode(InstanceParser.m_Blueprints))
	for _, l_CommandActionResult in pairs(p_CommandActionResults) do
		WebUpdater:AddUpdate('HandleResponse', json.decode(l_CommandActionResult))
	end
	NetEvents:SendLocal("ProjectManager:RequestProjectHeaders") -- Todo: move this to other class
	NetEvents:SendLocal("ProjectManager:RequestProjectHeaderUpdate") -- Todo: move this to other class
	self:UpdateCameraTransform()
end

return Editor()
