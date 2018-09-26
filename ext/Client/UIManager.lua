class 'UIManager'

local m_Freecam = require "Freecam"

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
		print("F1")
		if m_Freecam:GetCameraMode() == CameraMode.FreeCam then
			--WebUI:BringToFront()
			-- WebUI:Hide()
			WebUI:DisableMouse()

			m_Freecam:Disable()

			NetEvents:SendLocal('DisableInputRestriction')
		else
			WebUI:BringToFront()
			WebUI:EnableMouse()
			WebUI:Show()

			m_Freecam:Enable()
			NetEvents:SendLocal('EnableInputRestriction')
		end
	end

end

return UIManager()

