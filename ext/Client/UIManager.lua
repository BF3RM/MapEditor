class 'UIManager'

local m_Logger = Logger("InstanceParser", true)

function UIManager:__init()
	m_Logger:Write("Initializing UIManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function UIManager:RegisterVars()
	
end

function UIManager:RegisterEvents()

end

----------- Game functions----------------
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
		
		if Freecam:GetCameraMode() == CameraMode.FreeCam then
			self:DisableFreecam()
		else
			self:EnableFreecam()
		end
	end

		-- We let go of right mouse button. Activate the UI again.
	if InputManager:WentMouseButtonUp(InputDeviceMouseButtons.IDB_Button_1) then
		self:DisableFreecamMovement()
		Editor:SetPendingRaycast(RaycastType.Camera)
		Freecam.isMoving = false
	end

end

function UIManager:OnEnableFreecamMovement()
	self:EnableFreecamMovement()
end

function UIManager:EnableFreecamMovement()
	WebUI:DisableKeyboard()
	WebUI:DisableMouse()
	Freecam.isMoving = true
end

function UIManager:DisableFreecamMovement()
	if Freecam:GetCameraMode() == CameraMode.FreeCam then
		WebUI:EnableMouse()
		WebUI:EnableKeyboard()
		Freecam.isMoving = false
	end
end


function UIManager:OnDisableFreecam()
	self:DisableFreecam()
end

function UIManager:EnableFreecam()
	NetEvents:SendLocal('EnableInputRestriction')

	Freecam:Enable()

	WebUI:BringToFront()
	WebUI:EnableMouse()
	WebUI:Show()

	self:DisableFreecamMovement()
end

function UIManager:DisableFreecam()
	NetEvents:SendLocal('DisableInputRestriction')
	Freecam:Disable()
	--WebUI:BringToFront()
	-- WebUI:Hide()
	WebUI:DisableMouse()

	self:EnableFreecamMovement()
end


return UIManager()

