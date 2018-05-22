class 'Freecam'

function Freecam:__init()
	self.m_RotateX = 0.0
	self.m_RotateY = 0.0
	self.m_MoveX = 0.0
	self.m_MoveY = 0.0
	self.m_MoveZ = 0.0
	self.m_SimTickCount = 0
	self.m_InverseTick = 0.0
	self.m_SpeedMultiplier = 1.0
	self.m_Sprint = false

	self.m_CameraDistance = 1.0
	self.m_ThirdPersonRotX = 0.0
	self.m_ThirdPersonRotY = 0.0

	self.m_LastSpectatedPlayer = 0

	self.m_ClientUpdateInputEvent = Events:Subscribe('Client:UpdateInput', self, self.OnUpdateInput)
end

function Freecam:RotateX(p_Transform, p_Vector)
	return Vec3(
		p_Transform.left.x * p_Vector.x,
		p_Transform.left.y * p_Vector.x,
		p_Transform.left.z * p_Vector.x
	) + Vec3(
		p_Transform.up.x * p_Vector.y,
		p_Transform.up.y * p_Vector.y,
		p_Transform.up.z * p_Vector.y
	) + Vec3(
		p_Transform.forward.x * p_Vector.z,
		p_Transform.forward.y * p_Vector.z,
		p_Transform.forward.z * p_Vector.z
	)
end

function Freecam:Update(p_Delta, p_SimDelta)
	self.m_SimTickCount = self.m_SimTickCount + 1
	self.m_InverseTick = 1.0 / self.m_SimTickCount
end

function Freecam:OnUpdateInput(p_Delta)
	if SpectatorManager:GetCameraMode() == SpectatorCameraMode.Disabled then
		return
	end

	-- Update the controls.
	self:UpdateCameraControls(p_Delta)

	-- Update FreeCam (or ThirdPerson.)
	if SpectatorManager:GetCameraMode() == SpectatorCameraMode.FreeCamera then 
		self:UpdateFreeCamera(p_Delta)
	elseif SpectatorManager:GetCameraMode() == SpectatorCameraMode.ThirdPerson then
		self:UpdateThirdPerson(p_Delta)
	end

	-- Reset movement.
	self.m_RotateX = 0.0
	self.m_RotateY = 0.0
	self.m_MoveX = 0.0
	self.m_MoveY = 0.0
	self.m_MoveZ = 0.0
	self.m_SimTickCount = 0
	self.m_InverseTick = 0.0
end

function Freecam:UpdateCameraControls(p_Delta)
	if SpectatorManager:GetCameraMode() == SpectatorCameraMode.FirstPerson then 
		return
	end

	-- Camera movement controls.
	local s_RotateX = -InputManager:GetLevel(InputConceptIdentifiers.ConceptFreeCameraRotateX)
	local s_RotateY = InputManager:GetLevel(InputConceptIdentifiers.ConceptFreeCameraRotateY)

	local s_MoveX = InputManager:GetLevel(InputConceptIdentifiers.ConceptMoveLR)
	local s_MoveY = 0.0
	local s_MoveZ = -InputManager:GetLevel(InputConceptIdentifiers.ConceptMoveFB)

	if InputManager:IsKeyDown(InputDeviceKeys.IDK_E) then
		s_MoveY = 1.0
	elseif InputManager:IsKeyDown(InputDeviceKeys.IDK_Q) then
		s_MoveY = -1.0
	end

	self.m_RotateX = self.m_RotateX + s_RotateX
	self.m_RotateY = self.m_RotateY + s_RotateY

	self.m_MoveX = self.m_MoveX + s_MoveX
	self.m_MoveY = self.m_MoveY + s_MoveY
	self.m_MoveZ = self.m_MoveZ + s_MoveZ

	-- Camera speed and distance controls.
	self.m_Sprint = InputManager:IsKeyDown(InputDeviceKeys.IDK_LeftShift)

	local s_MouseWheel = InputManager:GetLevel(InputConceptIdentifiers.ConceptFreeCameraSwitchSpeed)

	if SpectatorManager:GetCameraMode() == SpectatorCameraMode.FreeCamera then 
		self.m_SpeedMultiplier = self.m_SpeedMultiplier + (s_MouseWheel * 0.2)

		if self.m_SpeedMultiplier < 0.05 then
			self.m_SpeedMultiplier = 0.05
		end
	else
		self.m_CameraDistance = self.m_CameraDistance + (s_MouseWheel * 0.2)

		if self.m_CameraDistance < 1.0 then
			self.m_CameraDistance = 1.0
		end
	end
end


function Freecam:UpdateFreeCamera(p_Delta)
	local s_RotateX = -(10.0 * self.m_RotateX * self.m_SimTickCount)
	local s_RotateY = -(10.0 * self.m_RotateY * self.m_SimTickCount)

	local s_Transform = SpectatorManager:GetFreecameraTransform()

	s_RotateX = s_RotateX * p_Delta
	s_RotateY = s_RotateY * p_Delta

	-- Calculate Y-axis rotation.
	local cy = math.cos(s_RotateY)
	local sy = math.sin(s_RotateY)

	s_Transform.left = Vec3(
		cy * s_Transform.left.x + sy * s_Transform.left.z,
		s_Transform.left.y,
		cy * s_Transform.left.z - sy * s_Transform.left.x
	)

	s_Transform.up = Vec3(
		cy * s_Transform.up.x + sy * s_Transform.up.z,
		s_Transform.up.y,
		cy * s_Transform.up.z - sy * s_Transform.up.x
	)

	s_Transform.forward = Vec3(
		cy * s_Transform.forward.x + sy * s_Transform.forward.z,
		s_Transform.forward.y,
		cy * s_Transform.forward.z - sy * s_Transform.forward.x
	)

	-- Calculate X-axis rotation.
	local cx = math.cos(s_RotateX)
	local sx = math.sin(s_RotateX)

	s_Transform.left = self:RotateX(s_Transform, Vec3(1.0, 0.0, 0.0))
	s_Transform.up = self:RotateX(s_Transform, Vec3(0.0, cx, sx))
	s_Transform.forward = self:RotateX(s_Transform, Vec3(0.0, -sx, cx))

	-- Calculate new transform.
	if self.m_MoveX ~= 0.0 then
		local s_MoveX = 20.0 * self.m_MoveX * p_Delta * self.m_SpeedMultiplier;

		if self.m_Sprint then
			s_MoveX = s_MoveX * 2.0
		end

		local s_MoveVector = Vec3(s_Transform.left.x * s_MoveX, s_Transform.left.y * s_MoveX, s_Transform.left.z * s_MoveX)
		s_Transform.trans = s_Transform.trans + s_MoveVector
	end

	if self.m_MoveY ~= 0.0 then
		local s_MoveY = 20.0 * self.m_MoveY * p_Delta * self.m_SpeedMultiplier;
		
		if self.m_Sprint then
			s_MoveY = s_MoveY * 2.0
		end

		local s_MoveVector = Vec3(s_Transform.up.x * s_MoveY, s_Transform.up.y * s_MoveY, s_Transform.up.z * s_MoveY)
		s_Transform.trans = s_Transform.trans + s_MoveVector
	end

	if self.m_MoveZ ~= 0.0 then
		local s_MoveZ = 20.0 * self.m_MoveZ * p_Delta * self.m_SpeedMultiplier;
		
		if self.m_Sprint then
			s_MoveZ = s_MoveZ * 2.0
		end

		local s_MoveVector = Vec3(s_Transform.forward.x * s_MoveZ, s_Transform.forward.y * s_MoveZ, s_Transform.forward.z * s_MoveZ)
		s_Transform.trans = s_Transform.trans + s_MoveVector
	end

	-- This fixes the tilted spectator camera.
	s_Transform.left = Vec3(s_Transform.left.x, 0.0, s_Transform.left.z)
end

function Freecam:UpdateThirdPerson(p_Delta)
	-- Get the spectated player.
	local s_SpectatedPlayer = SpectatorManager:GetSpectatedPlayer()

	-- Player not found; switch to freecam.
	if s_SpectatedPlayer == nil then
		SpectatorManager:SetCameraMode(SpectatorCameraMode.FreeCamera)
		return
	end

	local s_SpectatedSoldier = s_SpectatedPlayer.soldier

	-- Player has no soldier; switch to freecam.
	if s_SpectatedSoldier == nil then
		SpectatorManager:SetCameraMode(SpectatorCameraMode.FreeCamera)
		return
	end

	local s_Position = s_SpectatedSoldier.transform.trans

	-- Calculate distance from player.
	local s_Distance = self.m_CameraDistance

	if s_SpectatedPlayer.inVehicle then
		s_Distance = s_Distance + 3.0
	end

	if s_Distance > 30.0 then
		s_Distance = 30.0
	end

	-- Calculate rotations.
	local s_RotateX = -(10.0 * self.m_RotateX * self.m_SimTickCount)
	local s_RotateY = -(10.0 * self.m_RotateY * self.m_SimTickCount)

	local s_Transform = SpectatorManager:GetFreecameraTransform()

	s_RotateX = s_RotateX * p_Delta
	s_RotateY = -s_RotateY * p_Delta

	self.m_ThirdPersonRotX = self.m_ThirdPersonRotX + s_RotateY
	self.m_ThirdPersonRotY = self.m_ThirdPersonRotY + s_RotateX

	-- Limit angles so we don't start doing circles around the world.
	if self.m_ThirdPersonRotY > -0.1 then
		self.m_ThirdPersonRotY = -0.1
	end

	if self.m_ThirdPersonRotY < -3 then
		self.m_ThirdPersonRotY = -3
	end

	local cosfi = math.cos(self.m_ThirdPersonRotX)
	local sinfi = math.sin(self.m_ThirdPersonRotX)

	local costheta = math.cos(self.m_ThirdPersonRotY)
	local sintheta = math.sin(self.m_ThirdPersonRotY)

	-- Add some height to the player position so we're not looking at the ground.
	s_Position = Vec3(s_Position.x, s_Position.y + 1.5, s_Position.z)

	-- Calculate where our camera has to be.	
	local cx = s_Position.x + (s_Distance * sintheta * cosfi)
	local cy = s_Position.y + (s_Distance * costheta)
	local cz = s_Position.z + (s_Distance * sintheta * sinfi)

	local s_CameraLocation = Vec3(cx, cy, cz)

	-- Calculate the LookAt transform.
	s_Transform:LookAtTransform(s_CameraLocation, s_Position)

	-- Flip the camera angles so we're looking at the player.
	s_Transform.left = Vec3(-s_Transform.left.x, -s_Transform.left.y, -s_Transform.left.z)
	s_Transform.forward = Vec3(-s_Transform.forward.x, -s_Transform.forward.y, -s_Transform.forward.z)
end

return Freecam