class 'UIManager'

local m_Logger = Logger("InstanceParser", true)

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
	self:SetEditorMode(EditorMode.Loading)
end

function UIManager:SetEditorMode(p_Mode)
	m_Logger:Write('Setting editor mode to '.. p_Mode)
	self.m_ActiveMode = p_Mode
	WebUpdater:AddUpdate('EditorModeChanged', p_Mode)
end

function UIManager:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	self:RemoveUINodes(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
end

function UIManager:RemoveUINodes(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	local s_Screen = UIGraphAsset(p_Screen)

	if s_Screen.name == 'UI/Flow/Screen/PreRoundWaitingScreen' or
		s_Screen.name == 'UI/Flow/Screen/HudMatchPreroundScreen' or
		s_Screen.name == 'UI/Flow/Screen/HudMatchPreroundScreen' or
		s_Screen.name == 'UI/Flow/Screen/CommRoseScreen' then

		p_Hook:Return(nil)
	end
end

function UIManager:OnUpdateInput(p_Delta)
	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F1) then

		if FreeCam:GetCameraMode() ~= CameraMode.FirstPerson then
			self:DisableFreeCam()
		else
			self:EnableFreeCam()
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

function UIManager:OnDisableFreeCam()
	self:DisableFreeCam()
end

function UIManager:EnableFreeCam()
	NetEvents:SendLocal('EnableInputRestriction')

	FreeCam:Enable()

	WebUI:BringToFront()
	WebUI:EnableMouse()
	self:SetEditorMode(EditorMode.Editor)

	self:DisableFreeCamMovement()
end

function UIManager:DisableFreeCam()
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
