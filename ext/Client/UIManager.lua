---@class UIManager
---@overload fun():MessageActions
UIManager = class 'UIManager'

local m_Logger = Logger("UIManager", false)
local m_HudToggle = require "HudToggle"
local m_NativeViewport = require "NativeViewport"

function UIManager:__init()
	m_Logger:Write("Initializing UIManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function UIManager:RegisterVars()
	self.m_ActiveMode = EditorMode.Loading
	-- Gameface port: WebUI:EnableMouse() on the FIRST F1 activation doesn't reliably
	-- grab the cursor (timing/focus): clicks are dead until a console-toggle + F1 cycle
	-- forces it. Re-assert EnableMouse/BringToFront for a few frames after entering the
	-- editor so the WebUI reliably captures the mouse.
	self.m_ForceMouseFrames = 0
	-- True while the right mouse is held to fly the freecam (WebUI mouse intentionally
	-- disabled); used to not fight that with the force-enable above.
	self.m_MovementActive = false
end

function UIManager:RegisterEvents()
	Events:Subscribe('UIManager:LoadingComplete', self, self.OnLoadingComplete)
	Events:Subscribe('UIManager:SyncingProgress', self, self.OnSyncingProgress)
end

function UIManager:OnSyncingProgress(p_LoadedObjects, p_TotalObjects)
	if self.m_ActiveMode ~= EditorMode.Loading then
		self:SetEditorMode(EditorMode.Loading)
	end

	self:SetLoadingInfo(string.format('Syncing project state (%i/%i)', p_LoadedObjects, p_TotalObjects))
end

function UIManager:SetLoadingInfo(p_Info)
	WebUpdater:AddUpdate('SetLoadingInfo', p_Info)
end

function UIManager:OnLoadingComplete()
	self:SetEditorMode(EditorMode.Playing)
end

function UIManager:OnLevelDestroy()
	WebUI:ExecuteJS("window.location = window.location")
	self:SetEditorMode(EditorMode.Loading)
end

function UIManager:SetEditorMode(p_Mode)
	m_Logger:Write('Setting editor mode to ' .. p_Mode)
	self.m_ActiveMode = p_Mode
	WebUpdater:AddUpdate('EditorModeChanged', p_Mode)
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
	-- Re-assert the WebUI mouse for a few frames after entering the editor (the first
	-- EnableMouse doesn't reliably grab the cursor in Gameface). Skip while flying the
	-- freecam with right-mouse (mouse is intentionally handed to the game then).
	if self.m_ActiveMode == EditorMode.Editor and self.m_ForceMouseFrames > 0 and not self.m_MovementActive then
		self.m_ForceMouseFrames = self.m_ForceMouseFrames - 1
		WebUI:EnableMouse()
		WebUI:EnableKeyboard()
		WebUI:BringToFront()
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F1) then
		print('[MapEditor] F1 pressed, m_ActiveMode=' .. tostring(self.m_ActiveMode))
		if self.m_ActiveMode == EditorMode.Editor then
			self:DisableFreeCam()
		elseif self.m_ActiveMode == EditorMode.Playing then
			self:EnableFreeCam()
		else
			-- Gameface port fallback: if we never reached Playing (sync), still allow
			-- F1 to enter the editor so the UI/freecam are usable.
			print('[MapEditor] F1 in non-Playing mode -> forcing Playing then EnableFreeCam')
			self.m_ActiveMode = EditorMode.Playing
			self:EnableFreeCam()
		end
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F2) then
		if self.m_ActiveMode == EditorMode.Editor then
			local s_NewSoldierTransform = ClientUtils:GetCameraTransform()

			if s_NewSoldierTransform == nil then
				return
			end

			s_NewSoldierTransform.trans.y = s_NewSoldierTransform.trans.y - 1.8
			s_NewSoldierTransform.forward = Vec3(s_NewSoldierTransform.forward.x * -1, s_NewSoldierTransform.forward.y * -1, s_NewSoldierTransform.forward.z * -1)

			NetEvents:SendLocal("TeleportSoldierToPosition", s_NewSoldierTransform)
			self:DisableFreeCam()
		end
	end

	-- (Right-mouse DOWN is detected in the WebUI/JS since it owns the mouse in editor
	-- mode; it dispatches 'MapEditor:EnableFreeCamMovement'. We only handle the UP
	-- here, because by then the game owns the mouse again.)

	-- We let go of right mouse button. Activate the UI again.
	if InputManager:WentMouseButtonUp(InputDeviceMouseButtons.IDB_Button_1) then
		self:DisableFreeCamMovement()
	end
end

function UIManager:OnEnableFreeCamMovement()
	self:EnableFreeCamMovement()
end

function UIManager:EnableFreeCamMovement()
	self.m_MovementActive = true
	WebUI:DisableKeyboard()
	WebUI:DisableMouse()
end

function UIManager:DisableFreeCamMovement()
	self.m_MovementActive = false
	-- Gameface port robustness: ALWAYS re-enable the WebUI mouse on right-mouse release.
	-- The old `if GetCameraMode() == FreeCam` guard could skip EnableMouse when a
	-- `controlStart` event had flipped the camera mode to Editor mid-look, leaving the UI
	-- mouse STUCK disabled (clicks dead) until an F1 toggle re-ran EnableMouse. This was
	-- the intermittent "folders stop selecting, F1 fixes it" bug. Re-enabling an
	-- already-enabled mouse is harmless, so drop the guard for the mouse part.
	-- Refresh the camera-forward raycast (the "spawn where you're looking" position) every time
	-- you stop flying — NOT gated on camera mode. The old `if mode == FreeCam` guard sometimes
	-- skipped it (a controlStart can flip the mode to Editor mid-look), leaving the raycast
	-- position stale, so a blueprint spawned from Project Data landed at a random old spot.
	Editor:SetPendingRaycast(RaycastType.Camera)
	WebUI:EnableMouse()
	WebUI:EnableKeyboard()
	WebUpdater:AddUpdate('MouseEnabled')
	WebUI:BringToFront()
end

function UIManager:OnDisableEditorMode()
	self:DisableFreeCam()
end

function UIManager:EnableFreeCam()
	if self.m_ActiveMode ~= EditorMode.Playing then
		print('[MapEditor] EnableFreeCam: not in Playing mode (' .. tostring(self.m_ActiveMode) .. '), abort')
		return
	end

	local s_LocalPlayer = PlayerManager:GetLocalPlayer()

	-- Don't change to freecam if the player isnt alive, maybe add message saying so?
	if s_LocalPlayer == nil or s_LocalPlayer.soldier == nil then
		print('[MapEditor] EnableFreeCam: no local player/soldier (player=' .. tostring(s_LocalPlayer ~= nil) .. ', soldier=' .. tostring(s_LocalPlayer ~= nil and s_LocalPlayer.soldier ~= nil) .. '), abort')
		return
	end

	print('[MapEditor] EnableFreeCam: enabling freecam')
	NetEvents:SendLocal('EnableInputRestriction')

	-- Hide the vanilla BF3 HUD (minimap/tickets/ammo/etc) while in the editor.
	pcall(function() m_HudToggle:Hide() end)
	-- Enable the native DebugRenderer viewport overlay (object boxes).
	pcall(function() m_NativeViewport:SetActive(true) end)

	FreeCam:Enable()

	WebUI:BringToFront()
	WebUI:EnableMouse()
	self:SetEditorMode(EditorMode.Editor)

	self:DisableFreeCamMovement()
	-- Re-assert the WebUI mouse over the next several input frames so it reliably grabs
	-- the cursor on the FIRST activation (see RegisterVars note).
	self.m_ForceMouseFrames = 8
	print('[MapEditor] EnableFreeCam: done, mode now Editor. Move = WASD + hold RIGHT-MOUSE to look.')
end

function UIManager:DisableFreeCam()
	if self.m_ActiveMode ~= EditorMode.Editor then
		return
	end

	NetEvents:SendLocal('DisableInputRestriction')
	FreeCam:Disable()
	self:SetEditorMode(EditorMode.Playing)
	WebUI:DisableMouse()

	-- Restore the vanilla HUD when leaving the editor.
	pcall(function() m_HudToggle:Show() end)
	-- Stop drawing the native viewport overlay.
	pcall(function() m_NativeViewport:SetActive(false) end)

	self:EnableFreeCamMovement()
end

function UIManager:OnUIReloaded()
	self:SetEditorMode(self.m_ActiveMode)
end

UIManager = UIManager()

return UIManager
