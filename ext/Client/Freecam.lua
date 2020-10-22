class 'FreeCam'

local m_Logger = Logger("FreeCam", true)
local m_RotationHelper = require "__shared/Util/RotationHelper"

function FreeCam:__init()
	m_Logger:Write("Initializing FreeCam module")
	self:RegisterVars()
end

function FreeCam:RegisterVars()
	self.m_Mode = CameraMode.FirstPerson
	self.m_Camera = nil
	self.m_CameraData = CameraEntityData()
	self.m_LastTransform = nil

	self.m_CameraYaw = 0.0
	self.m_CameraPitch = 0.0

	self.m_MoveX = 0.0
	self.m_MoveY = 0.0
	self.m_MoveZ = 0.0
	self.m_SpeedMultiplier = 1.917
	self.m_RotationSpeedMultiplier = 200
	self.m_Sprint = false

	self.m_LastSpectatedPlayer = 0
end
function FreeCam:OnLevelDestroy()
	self:RegisterVars()
end

function FreeCam:Create()
    print("function Freecam:Create()")
    local s_Entity = EntityManager:CreateEntity(self.cameraData, LinearTransform())
    if s_Entity == nil then
        print("Could not spawn camera")
        return
    end
    self.cameraData.transform = ClientUtils:GetCameraTransform()
    self.cameraData.fov = 90
    self.camera = s_Entity
end

function FreeCam:SetCameraMode(p_Mode)
    if self.m_Mode == CameraMode.Editor then
        self:UpdateFreeCamVars()
    end
	--m_Logger:Write("Setting FreeCam mode to "..p_Mode)
    self.m_Mode = p_Mode
end

function FreeCam:SetCameraFOV(p_FOV)
	if p_FOV < 30 then
		p_FOV = 30
	elseif p_FOV > 120 then
		p_FOV = 120
	end

	self.m_CameraData.fov = p_FOV
end

function FreeCam:GetCameraFOV()
	if self.m_CameraData then
		return self.m_CameraData.fov
	end
end

function FreeCam:GetCameraMode()
    return self.m_Mode
end

function FreeCam:OnControlStart()
    self:SetCameraMode(CameraMode.Editor)
end

function FreeCam:OnControlEnd()
    self:SetCameraMode(CameraMode.FreeCam)
end

function FreeCam:OnControlUpdate(p_Transform)
	self:UpdateEditor(p_Transform)
end

function FreeCam:OnEnableFreeCamMovement()
    self:SetCameraMode(CameraMode.FreeCam)
end

function FreeCam:UpdateFreeCamVars()

    local s_Yaw, s_Pitch, s_Roll = m_RotationHelper:GetYPRfromLUF(
			self.m_CameraData.transform.left,
			self.m_CameraData.transform.up,
			self.m_CameraData.transform.forward)

	self.m_CameraYaw = s_Yaw
	self.m_CameraPitch = s_Pitch

    self.m_LastTransform = self.m_CameraData.transform.trans
end

function FreeCam:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)

	if self.m_Camera ~= nil and self.m_Mode == CameraMode.FreeCam then

		local s_NewYaw   = self.m_CameraYaw   - p_Cache:GetLevel(InputConceptIdentifiers.ConceptYaw) * (p_DeltaTime * self.m_RotationSpeedMultiplier)
		local s_NewPitch = self.m_CameraPitch - p_Cache:GetLevel(InputConceptIdentifiers.ConceptPitch) * (p_DeltaTime * self.m_RotationSpeedMultiplier)

		self.m_CameraYaw = s_NewYaw

		if (math.abs(s_NewPitch)* 2 < math.pi) then
			self.m_CameraPitch = s_NewPitch
		end
	end
end

function FreeCam:Create()
	local s_Entity = EntityManager:CreateEntity(self.m_CameraData, LinearTransform())
	if s_Entity == nil then
		m_Logger:Error("Could not spawn camera")
		return
	end
	s_Entity:Init(Realm.Realm_Client, true);

	-- local s_Spatial = SpatialEntity(s_Entity)
	self.m_CameraData.transform = ClientUtils:GetCameraTransform()
	self.m_CameraData.fov = 90
	self.m_Camera = s_Entity
end

function FreeCam:TakeControl()
	if(self.m_Camera ~= nil) then
		self.m_Camera:FireEvent("TakeControl")
	end
end

function FreeCam:ReleaseControl()
	if(self.m_Camera ~= nil) then
		self.m_Camera:FireEvent("ReleaseControl")
	end
end

function FreeCam:Enable()
	if(self.m_Camera == nil) then
		self:Create()
	end

	if(self.m_lastTransform ~= nil) then
		self.m_CameraData.transform = self.m_LastTransform
	end

    self:SetCameraMode(CameraMode.FreeCam)
	self:TakeControl()
end

function FreeCam:Disable()
	self.m_LastTransform = self.m_CameraData.transform
    self:SetCameraMode(CameraMode.FirstPerson)
	self:ReleaseControl()
end

function FreeCam:RotateX(p_Transform, p_Vector)
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

function FreeCam:OnUpdateInput(p_Delta)
	if self.m_Mode == CameraMode.FirstPerson or self.m_Mode == CameraMode.Editor then
		return
	end

	-- Update the controls.
	self:UpdateCameraControls(p_Delta)

	-- Update FreeCam
	if self.m_Mode == CameraMode.FreeCam then
		self:UpdateFreeCamera(p_Delta)
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F3) then
		--m_Logger:Write("Reseting camera")
		self.m_CameraData.transform.left = Vec3(1,0,0)
		self.m_CameraData.transform.up = Vec3(0,1,0)
		self.m_CameraData.transform.forward = Vec3(0,0,1)
		self.m_CameraData.fov = 90
		self.m_CameraYaw = 0.0
		self.m_CameraPitch = 0.0
		self.m_CameraDistance = 1.0
		self.m_ThirdPersonRotX = 0.0
		self.m_ThirdPersonRotY = 0.0

	end
	-- Reset movement.
	self.m_RotateX = 0.0
	self.m_RotateY = 0.0
	self.m_MoveX = 0.0
	self.m_MoveY = 0.0
	self.m_MoveZ = 0.0
end

function FreeCam:UpdateCameraControls(p_Delta)
	if self.m_Mode == CameraMode.FirstPerson then
		return
	end

	local s_MoveX = InputManager:GetLevel(InputConceptIdentifiers.ConceptMoveLR)
	local s_MoveY = 0.0
	local s_MoveZ = -InputManager:GetLevel(InputConceptIdentifiers.ConceptMoveFB)

	if InputManager:IsKeyDown(InputDeviceKeys.IDK_E) then
		s_MoveY = 1.0
	elseif InputManager:IsKeyDown(InputDeviceKeys.IDK_Q) then
		s_MoveY = -1.0
	end

	--- When moving diagonally lower axis direction speeds.
	if s_MoveX ~= 0.0 and s_MoveZ ~= 0.0  then
		s_MoveX = s_MoveX * 0.7071 -- cos(45º)
		s_MoveZ = s_MoveZ * 0.7071 -- cos(45º)
	end


	if InputManager:WentKeyDown(InputDeviceKeys.IDK_PageDown) then
		self.m_RotationSpeedMultiplier = self.m_RotationSpeedMultiplier + 1
	elseif InputManager:WentKeyDown(InputDeviceKeys.IDK_PageUp ) then
		if self.m_RotationSpeedMultiplier > 1 then
			self.m_RotationSpeedMultiplier = self.m_RotationSpeedMultiplier - 1
		end
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_ArrowUp) then
		self:SetCameraFOV(self:GetCameraFOV() + 5)
	elseif InputManager:WentKeyDown(InputDeviceKeys.IDK_ArrowDown) then
		self:SetCameraFOV(self:GetCameraFOV() - 5)
	end

	self.m_MoveX = self.m_MoveX + s_MoveX
	self.m_MoveY = self.m_MoveY + s_MoveY
	self.m_MoveZ = self.m_MoveZ + s_MoveZ

	-- Camera speed and distance controls.
	self.m_Sprint = InputManager:IsKeyDown(InputDeviceKeys.IDK_LeftShift)

	local s_MouseWheel = InputManager:GetLevel(InputConceptIdentifiers.ConceptFreeCameraSwitchSpeed)

	if self.m_Mode == CameraMode.FreeCam then
		self.m_SpeedMultiplier = self.m_SpeedMultiplier + (s_MouseWheel * 0.1)

		if self.m_SpeedMultiplier < 0.0001 then
			self.m_SpeedMultiplier = 0.0001
		end
	else
		self.m_CameraDistance = self.m_CameraDistance + (s_MouseWheel * 0.2)

		if self.m_CameraDistance < 1.0 then
			self.m_CameraDistance = 1.0
		end
	end
end
function FreeCam:UpdateEditor(p_Transform)
	if self.m_Mode == CameraMode.Editor then
		self.m_CameraData.transform = p_Transform
	end
end

function FreeCam:UpdateFreeCamera(p_Delta)

	local s_Transform = self.m_CameraData.transform

	local left, up, forward = m_RotationHelper:GetLUFfromYPR(self.m_CameraYaw, self.m_CameraPitch, 0)

	self.m_CameraData.transform.left = left
	self.m_CameraData.transform.up = up
	self.m_CameraData.transform.forward = forward

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
	--s_Transform.left = Vec3(s_Transform.left.x, 0.0, s_Transform.left.z)
end

return FreeCam()
