class 'UIManager'

local m_Logger = Logger("UIManager", true)

function UIManager:__init()
	m_Logger:Write("Initializing UIManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function UIManager:RegisterVars()
	self.m_ActiveMode = EditorMode.Loading
end

function UIManager:RegisterEvents()
	Events:Subscribe('UIManager:LoadingComplete', self, self.OnLoadingComplete)
end

function UIManager:OnLoadingComplete()
	self:SetEditorMode(EditorMode.Playing)
end

function UIManager:OnLevelDestroy()
	self.m_ActiveMode = EditorMode.Loading
end

function UIManager:SetEditorMode(p_Mode)
	m_Logger:Write('Setting editor mode to '.. p_Mode)
	self.m_ActiveMode = p_Mode
	WebUpdater:AddUpdate('EditorModeChanged', p_Mode)
end

function UIManager:OnLevelDestroy()
	WebUI:ExecuteJS("window.location = window.location")
end
----------- Game functions----------------
function UIManager:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	-- self:RemoveUINodes(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
end

function UIManager:RemoveUINodes(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	-- local s_Screen = UIGraphAsset(p_Screen)

	-- if s_Screen.name == 'UI/Flow/Screen/PreRoundWaitingScreen' or
	-- 	s_Screen.name == 'UI/Flow/Screen/HudMatchPreroundScreen' or
	-- 	s_Screen.name == 'UI/Flow/Screen/HudMatchPreroundScreen' or
	-- 	s_Screen.name == 'UI/Flow/Screen/CommRoseScreen' then

	-- 	p_Hook:Return(nil)
	-- end
end

function UIManager:OnUpdateInput(p_Delta)
	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F1) then
		if self.m_ActiveMode == EditorMode.Editor then
			self:DisableFreeCam()
		elseif self.m_ActiveMode == EditorMode.Playing then
			self:EnableFreeCam()
		end
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F2) then
		if self.m_ActiveMode == EditorMode.Editor then
			local s_NewSoldierTransform = ClientUtils:GetCameraTransform()
			s_NewSoldierTransform.trans.y = s_NewSoldierTransform.trans.y - 1.8
			s_NewSoldierTransform.forward = Vec3(s_NewSoldierTransform.forward.x * -1, s_NewSoldierTransform.forward.y * -1, s_NewSoldierTransform.forward.z * -1)

			NetEvents:SendLocal("TeleportSoldierToPosition", s_NewSoldierTransform)
			self:DisableFreeCam()
		end
	end

	-- We let go of right mouse button. Activate the UI again.
	if InputManager:WentMouseButtonUp(InputDeviceMouseButtons.IDB_Button_1) then
		self:DisableFreeCamMovement()
		Editor:SetPendingRaycast(RaycastType.Camera)
	end
end

function UIManager:OnEnableFreeCamMovement()
	self:EnableFreeCamMovement()
end

function UIManager:EnableFreeCamMovement()
	WebUI:DisableKeyboard()
	WebUI:DisableMouse()
end

function UIManager:DisableFreeCamMovement()
	if FreeCam:GetCameraMode() == CameraMode.FreeCam then
		WebUI:EnableMouse()
		WebUI:EnableKeyboard()
		WebUpdater:AddUpdate('MouseEnabled')
		WebUI:BringToFront()
	end
end

function UIManager:OnDisableEditorMode()
	self:DisableFreeCam()
end

function UIManager:EnableFreeCam()
	if self.m_ActiveMode ~= EditorMode.Playing then
		return
	end

	local s_LocalPlayer = PlayerManager:GetLocalPlayer()
	-- Don't change to freecam if the player isnt alive, maybe add message saying so?
	if s_LocalPlayer == nil or s_LocalPlayer.soldier == nil then
		return
	end

	NetEvents:SendLocal('EnableInputRestriction')

	FreeCam:Enable()

	WebUI:BringToFront()
	WebUI:EnableMouse()
	self:SetEditorMode(EditorMode.Editor)

	self:DisableFreeCamMovement()
end

function UIManager:DisableFreeCam()
	if self.m_ActiveMode ~= EditorMode.Editor then
		return
	end
	NetEvents:SendLocal('DisableInputRestriction')
	FreeCam:Disable()
	self:SetEditorMode(EditorMode.Playing)
	WebUI:DisableMouse()

	self:EnableFreeCamMovement()
end

function UIManager:OnUIReloaded()
	self:SetEditorMode(self.m_ActiveMode)
end

return UIManager()
