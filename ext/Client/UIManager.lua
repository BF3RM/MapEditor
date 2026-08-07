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
	-- Whether the Gameface WebUI has been booted (WebUI:Init). With ME_CONFIG.LAZY_WEBUI the
	-- boot is deferred to the first F1 so its ~400-500MB don't stack on top of the level-load
	-- memory peak (32-bit process). WebUpdater drops UI updates while this is false.
	self.m_WebUIBooted = false
	-- Lazy boot handshake: F1 (input context) only REQUESTS the boot; PumpPendingBoot does it
	-- from Engine:Update (clean context); OnUIReady requests the enter; the enter itself runs
	-- from OnUpdateInput (input context — the proven home of the EnableFreeCam chain).
	self.m_BootPending = false
	self.m_EnterAfterReady = false
	self.m_EnterPending = false
	-- Dev/test auto-enter (ME_CONFIG.DEV_AUTO_ENTER_EDITOR): one-shot guard + a delay timer so the
	-- editor opens a few seconds after Level:Loaded, without deploy or F1.
	self.m_DevAutoEntered = false
	self.m_DevAutoEnterPending = false
	self.m_DevAutoEnterTimer = 0.0
end

--- Enter the editor programmatically, equivalent to the first F1. Sets the same lazy-boot flags
--- the F1 handler does (boot requested by PumpPendingBoot, enter by OnUIReady -> OnUpdateInput),
--- so it's safe to call from any context. Lets an e2e harness open the editor over CDP without
--- injecting physical deploy/F1 input.
function UIManager:DevEnterEditor()
	if self.m_ActiveMode == EditorMode.Editor then
		return
	end
	if self.m_WebUIBooted then
		self.m_ActiveMode = EditorMode.Playing
		self.m_EnterPending = true
	else
		self.m_BootPending = true
		self.m_EnterAfterReady = true
	end
end

--- Runs from Engine:Update (MapEditorClient:OnUpdate): performs a boot requested by F1
--- OUTSIDE the input event (WebUI:Init from input context froze the client).
function UIManager:PumpPendingBoot()
	if self.m_BootPending then
		self.m_BootPending = false
		self:BootWebUI()
	end
end

--- Boots the Gameface WebUI. Input is handed to the GAME by default; the editor-enter flow
--- (EnableFreeCam) enables the WebUI mouse afterwards.
function UIManager:BootWebUI()
	if self.m_WebUIBooted then
		return
	end
	self.m_WebUIBooted = true

	WebUI:Init()
	WebUI:Show()
	pcall(function()
		WebUI:DisableMouse()
		WebUI:DisableKeyboard()
	end)
end

function UIManager:RegisterEvents()
	Events:Subscribe('UIManager:LoadingComplete', self, self.OnLoadingComplete)
	Events:Subscribe('UIManager:SyncingProgress', self, self.OnSyncingProgress)
	Events:Subscribe('MapEditor:UIReady', self, self.OnUIReady)
end

--- The web app finished booting. If the boot was requested by an F1 (lazy path), request the
--- editor enter — but do NOT run EnableFreeCam here: this handler runs in the WebUI-event
--- delivery context, where the enter chain (HudToggle/FreeCam/EnableMouse) has never run
--- before (froze the client). The enter is performed from OnUpdateInput (the input context
--- the eager-boot F1 path always used).
function UIManager:OnUIReady()
	if self.m_EnterAfterReady then
		self.m_EnterAfterReady = false
		self.m_EnterPending = true
	end
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

	-- Dev/test: auto-enter the editor once (see ME_CONFIG.DEV_AUTO_ENTER_EDITOR) so e2e tests can
	-- drive the editor over CDP without physical deploy/F1 input. F1 still toggles back to play.
end

--- Dev/test auto-enter: requested from Level:Loaded (fires at the soldier screen once the level
--- is up), then fired after a short delay by TickAutoEnter so the WebUI boot lands AFTER the
--- load-memory spike settles (mirrors when a human would press F1). Depends on neither deploy nor
--- the server sync context (OnLoadingComplete only fires after those).
function UIManager:RequestDevAutoEnter()
	if not ME_CONFIG.DEV_AUTO_ENTER_EDITOR or self.m_DevAutoEntered then
		return
	end
	self.m_DevAutoEnterPending = true
	self.m_DevAutoEnterTimer = 0.0
end

function UIManager:TickAutoEnter(p_Delta)
	if not self.m_DevAutoEnterPending then
		return
	end
	self.m_DevAutoEnterTimer = self.m_DevAutoEnterTimer + (p_Delta or 0.016)
	if self.m_DevAutoEnterTimer >= 5.0 then
		self.m_DevAutoEnterPending = false
		self.m_DevAutoEntered = true
		self:DevEnterEditor()
	end
end

function UIManager:OnLevelDestroy()
	if self.m_WebUIBooted then
		WebUI:ExecuteJS("window.location = window.location")
	end
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
	-- Deferred lazy-boot editor enter (requested by OnUIReady): run it HERE, in the input
	-- context where the eager-boot F1 path always ran it.
	if self.m_EnterPending then
		self.m_EnterPending = false
		if self.m_ActiveMode == EditorMode.Playing then
			self:EnableFreeCam()
		end
	end

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
		if self.m_ActiveMode == EditorMode.Editor then
			self:DisableFreeCam()
		elseif self.m_ActiveMode == EditorMode.Playing then
			self:EnableFreeCam()
		else
			-- Gameface port fallback: if we never reached Playing (sync), still allow
			-- F1 to enter the editor so the UI/freecam are usable.
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
		m_Logger:Write('EnableFreeCam: not in Playing mode (' .. tostring(self.m_ActiveMode) .. '), abort')
		return
	end

	local s_LocalPlayer = PlayerManager:GetLocalPlayer()

	-- Don't change to freecam if the player isnt alive, maybe add message saying so?
	if s_LocalPlayer == nil or s_LocalPlayer.soldier == nil then
		m_Logger:Write('EnableFreeCam: no local player/soldier, abort')
		return
	end

	-- Lazy WebUI: this F1 arrives inside the Client:UpdateInput event; calling WebUI:Init()
	-- from input context hard-froze the client (input-system re-entrancy). Request the boot
	-- and do it on the next Engine:Update tick (PumpPendingBoot); the editor is entered when
	-- the web app reports ready (OnUIReady), not now.
	if not self.m_WebUIBooted then
		if not self.m_BootPending then
			self.m_BootPending = true
			self.m_EnterAfterReady = true
			print('[MapEditor] Booting editor UI... (F1 again once it appears, if needed)')
		end
		return
	end

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
	-- Lazy boot: the web app finishes booting SECONDS after the first F1, long after the
	-- editor-enter re-assert frames expired — re-assert the WebUI mouse again now so the
	-- freshly-booted page reliably captures the cursor.
	if self.m_ActiveMode == EditorMode.Editor then
		WebUI:BringToFront()
		WebUI:EnableMouse()
		self.m_ForceMouseFrames = 8
	end
end

UIManager = UIManager()

return UIManager
