class 'UIManager'

local m_Freecam = require "Freecam"
local m_Editor = require "Editor"

function UIManager:__init()
	print("Initializing UIManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function UIManager:RegisterVars()
	
end

function UIManager:RegisterEvents()

end

----------- Game functions----------------

function UIManager:OnUpdateInput(p_Delta)
	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F1) then
		
		if m_Freecam:GetCameraMode() == CameraMode.FreeCam then
			self:DisableFreecam()
		else
			self:EnableFreecam()
		end
	end

		-- We let go of right mouse button. Activate the UI again.
	if InputManager:WentMouseButtonUp(InputDeviceMouseButtons.IDB_Button_1) then
		self:DisableFreecamMovement()
		m_Editor:SetPendingRaycast()
	end

end

function UIManager:OnEnableFreecamMovement()
	self:EnableFreecamMovement()
end

function UIManager:EnableFreecamMovement()
	WebUI:DisableKeyboard()
	WebUI:DisableMouse()
end

function UIManager:DisableFreecamMovement()
	if m_Freecam:GetCameraMode() == CameraMode.FreeCam then
		WebUI:EnableMouse()
		WebUI:EnableKeyboard()
	end
end


function UIManager:OnDisableFreecam()
	self:DisableFreecam()
end

function UIManager:EnableFreecam()
	NetEvents:SendLocal('EnableInputRestriction')

	m_Freecam:Enable()

	WebUI:BringToFront()
	WebUI:EnableMouse()
	WebUI:Show()

	self:DisableFreecamMovement()
end

function UIManager:DisableFreecam()
	NetEvents:SendLocal('DisableInputRestriction')
	m_Freecam:Disable()
	--WebUI:BringToFront()
	-- WebUI:Hide()
	WebUI:DisableMouse()

	self:EnableFreecamMovement()

end


return UIManager()

