---@class MapEditorClient
MapEditorClient = class 'MapEditorClient'

---@type Logger
local m_Logger = Logger("MapEditorClient", false)

require "WebUpdater"
require "Freecam"
require "Editor"
require "UIManager"
require "MessageActions"
require "ClientTransactionManager"
require "ClientGameObjectManager"
require "PartitionInspector"
local m_NativeViewport = require "NativeViewport"

function MapEditorClient:__init()
	m_Logger:Write("Initializing MapEditorClient")
	self:RegisterEvents()
end

function MapEditorClient:RegisterEvents()
	--VEXT events
	Events:Subscribe('Client:UpdateInput', self, self.OnUpdateInput)
	Events:Subscribe('Extension:Loaded', self, self.OnExtensionLoaded)
	Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
	Events:Subscribe('Engine:Update', self, self.OnUpdate)
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
	Events:Subscribe('Level:Loaded', self, self.OnLevelLoaded)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)
	Events:Subscribe('UI:DrawHud', self, self.OnDrawHud)
	Events:Subscribe('Level:LoadingInfo', self, self.OnLoadingInfo)
	Events:Subscribe('Level:LoadResources', self, self.OnLoadResources)

	-- Editor Events
	NetEvents:Subscribe('MapEditorClient:ReceiveProjectData', self, self.OnReceiveProjectData)
	NetEvents:Subscribe('MapEditorClient:ReceiveProjectHeaders', self, self.OnReceiveProjectHeaders)
	NetEvents:Subscribe('MapEditorClient:ReceiveCurrentProjectHeader', self, self.OnReceiveCurrentProjectHeader)
	NetEvents:Subscribe('MapEditorClient:ProjectImportFinished', self, self.OnProjectImportFinished)

	-- WebUI events
	Events:Subscribe('MapEditor:UIReloaded', self, self.OnUIReloaded)
	Events:Subscribe('MapEditor:SendToServer', self, self.OnSendCommandsToServer)
	Events:Subscribe('MapEditor:ReceiveMessage', self, self.OnReceiveMessages)

	Events:Subscribe('MapEditor:SetHighlight', self, self.OnSetHighlight)
	Events:Subscribe('MapEditor:SetSelection', self, self.OnSetSelection)
	Events:Subscribe('MapEditor:BoxReport', self, self.OnBoxReport)
	Events:Subscribe('MapEditor:SetGizmoMode', self, self.OnSetGizmoMode)
	Events:Subscribe('MapEditor:SetWorldSpace', self, self.OnSetWorldSpace)
	Events:Subscribe('MapEditor:SetGizmoCenter', self, self.OnSetGizmoCenter)
	Events:Subscribe('MapEditor:SetGizmoBasis', self, self.OnSetGizmoBasis)
	Events:Subscribe('MapEditor:SetOverlaySettings', self, self.OnSetOverlaySettings)
	Events:Subscribe('MapEditor:NativePick', self, self.OnNativePick)
	Events:Subscribe('MapEditor:NativeHighlight', self, self.OnNativeHighlight)
	Events:Subscribe('MapEditor:EnableFreeCamMovement', self, self.OnEnableFreeCamMovement)
	Events:Subscribe('MapEditor:DisableEditorMode', self, self.OnDisableEditorMode)
	Events:Subscribe('MapEditor:controlStart', self, self.OnCameraControlStart)
	Events:Subscribe('MapEditor:controlEnd', self, self.OnCameraControlEnd)
	Events:Subscribe('MapEditor:controlUpdate', self, self.OnCameraControlUpdate)
	Events:Subscribe('MapEditor:FocusCamera', self, self.OnFocusCamera)

	-- Hooks
	Hooks:Install('Input:PreUpdate', 200, self, self.OnUpdateInputHook)
	Hooks:Install('UI:PushScreen', 999, self, self.OnPushScreen)

	Hooks:Install('ResourceManager:LoadBundles', 900, self, self.OnLoadBundles)
    Hooks:Install('EntityFactory:CreateFromBlueprint', 900, self, self.OnEntityCreateFromBlueprint)
	Hooks:Install('EntityFactory:Create', 999, self, self.OnEntityCreate)
end

----------- Game functions----------------

---@param p_Delta number
---@param p_SimulationDelta number
function MapEditorClient:OnUpdate(p_Delta, p_SimulationDelta)
	-- Perform a lazy WebUI boot requested by F1, here in Engine:Update — doing WebUI:Init()
	-- inside the input event froze the client.
	UIManager:PumpPendingBoot()
	UIManager:TickAutoEnter(p_Delta)
	WebUpdater:OnUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorClient:OnLevelLoaded(p_MapName, p_GameModeName)
	InstanceParser:OnLevelLoaded(p_MapName, p_GameModeName)
	-- Dev/test: schedule the auto-enter (fires ~5s later via TickAutoEnter in OnUpdate).
	UIManager:RequestDevAutoEnter()

end

function MapEditorClient:OnExtensionLoaded()
	-- Lazy WebUI: defer the boot to the first F1 (UIManager:BootWebUI) so the Gameface
	-- app's ~400-500MB never stack on top of the level-load memory peak (32-bit process).
	if ME_CONFIG.LAZY_WEBUI then
		return
	end

	-- Eager boot. Default input to the GAME (freecam) on load; the WebUI grabs it only in
	-- editor mode (F1). Without this the shown WebUI swallows mouse+keyboard so
	-- freecam/WASD stop working.
	UIManager:BootWebUI()
end

function MapEditorClient:OnExtensionUnloading()
	--Editor:OnExtensionUnloading() -- TODO: this was never implemented?
end

function MapEditorClient:OnPartitionLoaded(p_Partition)
	InstanceParser:OnPartitionLoaded(p_Partition)
end

---@param p_Message Message
function MapEditorClient:OnEngineMessage(p_Message)
	Editor:OnEngineMessage(p_Message)
	ClientTransactionManager:OnEngineMessage(p_Message)
end

function MapEditorClient:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
	UIManager:OnPushScreen(p_Hook, p_Screen, p_GraphPriority, p_ParentGraph)
end

function MapEditorClient:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
	FreeCam:OnUpdateInputHook(p_Hook, p_Cache, p_DeltaTime)
end

function MapEditorClient:OnUpdateInput(p_Delta)
	FreeCam:OnUpdateInput(p_Delta)
	UIManager:OnUpdateInput(p_Delta)
end

---@param p_Delta number
---@param p_Pass UpdatePass
function MapEditorClient:OnUpdatePass(p_Delta, p_Pass)
	if p_Pass == UpdatePass.UpdatePass_PreSim then
		Editor:OnUpdatePassPreSim()
	end

	ClientTransactionManager:OnUpdatePass(p_Delta, p_Pass)
end

function MapEditorClient:OnDrawHud()
	Editor:OnDrawHud()
	-- DebugRenderer draws must be issued from UI:DrawHud (not Engine:Update).
	m_NativeViewport:OnDraw()
end

---@param p_Json string
function MapEditorClient:OnSetHighlight(p_Json)
	local s_Ok, s_Guid = pcall(function() return json.decode(p_Json) end)
	m_NativeViewport:SetHighlight(s_Ok and s_Guid or nil)
end

---@param p_Json string
--- Ask the viewport to publish what it can outline (window.__boxReport). Test/support hook.
function MapEditorClient:OnBoxReport()
	-- Carry the editor state too: "no box" and "the editor never entered" look identical from
	-- the WebUI otherwise, and the reason entry fails is logged client-side where nothing reads it.
	local s_Soldier = false
	local s_Player = false

	pcall(function()
		local s_LocalPlayer = PlayerManager:GetLocalPlayer()
		s_Player = s_LocalPlayer ~= nil
		s_Soldier = s_LocalPlayer ~= nil and s_LocalPlayer.soldier ~= nil
	end)

	m_NativeViewport:SelectionBoxReport({
		mode = tostring(UIManager.m_ActiveMode),
		hasPlayer = s_Player,
		hasSoldier = s_Soldier,
	})
end

function MapEditorClient:OnSetSelection(p_Json)
	local s_Ok, s_List = pcall(function() return json.decode(p_Json) end)
	m_NativeViewport:SetSelection((s_Ok and type(s_List) == 'table') and s_List or {})
end

---@param p_Json string
function MapEditorClient:OnSetGizmoMode(p_Json)
	local s_Ok, s_Mode = pcall(function() return json.decode(p_Json) end)
	m_NativeViewport:SetGizmoMode((s_Ok and type(s_Mode) == 'string') and s_Mode or 'select')
end

---@param p_Json string
function MapEditorClient:OnSetWorldSpace(p_Json)
	local s_Ok, s_Space = pcall(function() return json.decode(p_Json) end)
	m_NativeViewport:SetWorldSpace((s_Ok and type(s_Space) == 'string') and s_Space or 'world')
end

---@param p_Json string
function MapEditorClient:OnSetGizmoCenter(p_Json)
	local s_Ok, s_List = pcall(function() return json.decode(p_Json) end)
	m_NativeViewport:SetGizmoCenter((s_Ok and type(s_List) == 'table') and s_List or nil)
end

---@param p_Json string
function MapEditorClient:OnSetGizmoBasis(p_Json)
	local s_Ok, s_List = pcall(function() return json.decode(p_Json) end)
	if s_Ok and type(s_List) == 'table' then
		m_NativeViewport:SetGizmoBasis(s_List)
	end
end

---Overlay/gizmo visibility toggles from the viewport header (GH #395).
---@param p_Json string
function MapEditorClient:OnSetOverlaySettings(p_Json)
	local s_Ok, s_Settings = pcall(function() return json.decode(p_Json) end)

	if s_Ok and type(s_Settings) == 'table' then
		m_NativeViewport:SetOverlaySettings(s_Settings)
	end
end

-- Precise picking: native physics raycast against the real collision geometry, then
-- map the hit point to the GameObject whose spatial OBB contains it (smallest one, so
-- a big overlapping box never wins over the object you actually clicked).
function MapEditorClient:FindGuidAtPoint(p_Point, p_HitEntity, p_CullSq)
	if GameObjectManager == nil or GameObjectManager.m_GameObjects == nil then
		return ''
	end

	-- Fast path: the physics ray reports the exact entity it hit (RayCastHit.rigidBody). If we
	-- track that entity, map it to its GameObject by matching instanceId — just integer compares,
	-- NO engine reads / OBB math — and return immediately. This is what makes hover usable on
	-- B2K/XP1 (thousands of objects). Falls through to the OBB scan if the hit entity isn't one
	-- we track (e.g. baked static-model-group physics).
	if p_HitEntity ~= nil then
		local s_HitId = nil
		pcall(function() s_HitId = p_HitEntity.instanceId end)
		if s_HitId ~= nil then
			for l_GuidStr, l_GO in pairs(GameObjectManager.m_GameObjects) do
				if l_GO ~= nil and l_GO.gameEntities ~= nil then
					for _, l_GE in pairs(l_GO.gameEntities) do
						if l_GE.instanceId == s_HitId then
							return l_GuidStr
						end
					end
				end
			end
		end
	end

	local s_Best = ''
	local s_BestVol = 1e30
	-- Broad-phase cull (squared radius): only objects whose origin is within this distance of
	-- the physics-ray hit point run the expensive per-entity SpatialEntity/OBB test. Turns an
	-- O(all objects) hover scan — unusable on B2K/XP1's thousands of objects (~150ms/hover, and
	-- it fires on every mouse move) — into O(the few nearby ones). Generous (150m) so even large
	-- prefabs whose origin sits far from the hovered surface are never wrongly skipped.
	local s_CullSq = p_CullSq or (150.0 * 150.0)
	for l_GuidStr, l_GO in pairs(GameObjectManager.m_GameObjects) do
		local s_Near = true
		if l_GO ~= nil and l_GO.transform ~= nil and l_GO.transform.trans ~= nil then
			local o = l_GO.transform.trans
			local dx, dy, dz = p_Point.x - o.x, p_Point.y - o.y, p_Point.z - o.z
			s_Near = (dx * dx + dy * dy + dz * dz) <= s_CullSq
		end
		if l_GO ~= nil and l_GO.gameEntities ~= nil and s_Near then
			for _, l_GE in pairs(l_GO.gameEntities) do
				if l_GE.entity ~= nil and l_GE.isSpatial then
					pcall(function()
						local s_S = SpatialEntity(l_GE.entity)
						if s_S == nil or s_S.aabb == nil then return end
						local s_AABB = s_S.aabb
						local s_T = s_S.aabbTransform
						local s_Rel = p_Point - s_T.trans
						local lx = s_Rel:Dot(s_T.left)
						local ly = s_Rel:Dot(s_T.up)
						local lz = s_Rel:Dot(s_T.forward)
						-- small epsilon so a surface hit still counts as inside
						local e = 0.05
						if lx >= s_AABB.min.x - e and lx <= s_AABB.max.x + e and
							ly >= s_AABB.min.y - e and ly <= s_AABB.max.y + e and
							lz >= s_AABB.min.z - e and lz <= s_AABB.max.z + e then
							local vol = (s_AABB.max.x - s_AABB.min.x) *
								(s_AABB.max.y - s_AABB.min.y) *
								(s_AABB.max.z - s_AABB.min.z)
							if vol < s_BestVol then
								s_BestVol = vol
								s_Best = l_GuidStr
							end
						end
					end)
				end
			end
		end
	end
	return s_Best
end

---@param p_Json string
function MapEditorClient:OnNativePick(p_Json)
	local s_Ok, s_D = pcall(function() return json.decode(p_Json) end)
	if not s_Ok or s_D == nil then return end
	local s_Guid = ''
	pcall(function()
		local s_From = Vec3(s_D.ox, s_D.oy, s_D.oz)
		local s_To = Vec3(s_D.ox + s_D.dx * 2000.0, s_D.oy + s_D.dy * 2000.0, s_D.oz + s_D.dz * 2000.0)
		local s_Hit = RaycastManager:Raycast(s_From, s_To, RayCastFlags.DontCheckWater)
		if s_Hit ~= nil and s_Hit.position ~= nil then
			s_Guid = self:FindGuidAtPoint(s_Hit.position, s_Hit.rigidBody)
		end
	end)
	local s_Safe = tostring(s_Guid):gsub("[^%x%-]", "")
	WebUI:ExecuteJS("if(window.__onNativePick){window.__onNativePick('" .. s_Safe .. "');}")
end

---@param p_Json string
function MapEditorClient:OnNativeHighlight(p_Json)
	local s_Ok, s_D = pcall(function() return json.decode(p_Json) end)
	if not s_Ok or s_D == nil then return end
	local s_Guid = ''
	pcall(function()
		local s_From = Vec3(s_D.ox, s_D.oy, s_D.oz)
		local s_To = Vec3(s_D.ox + s_D.dx * 2000.0, s_D.oy + s_D.dy * 2000.0, s_D.oz + s_D.dz * 2000.0)
		local s_Hit = RaycastManager:Raycast(s_From, s_To, RayCastFlags.DontCheckWater)
		if s_Hit ~= nil and s_Hit.position ~= nil then
			-- Hover fires continuously, so cull tighter (50m): only objects near the hovered
			-- surface get the expensive per-entity test. An occasional missed highlight on a
			-- huge prefab is fine — the CLICK below uses a generous radius, so selection stays
			-- accurate.
			s_Guid = self:FindGuidAtPoint(s_Hit.position, s_Hit.rigidBody, 50.0 * 50.0)
		end
	end)
	m_NativeViewport:SetHighlight(s_Guid ~= '' and s_Guid or nil)
end

function MapEditorClient:OnLevelDestroy()
	GameObjectManager:OnLevelDestroy()
	FreeCam:OnLevelDestroy()
	ClientTransactionManager:OnLevelDestroy()
	ClientGameObjectManager:OnLevelDestroy()
	UIManager:OnLevelDestroy()
end

function MapEditorClient:OnLoadResources()
	ClientTransactionManager:OnLoadResources()
end

function MapEditorClient:OnLoadBundles(p_Hook, p_Bundles, p_Compartment)
	local s_LoadingInfo = ''

	for l_Index, l_Bundle in pairs(p_Bundles) do
		s_LoadingInfo = s_LoadingInfo .. l_Bundle

		if l_Index ~= #p_Bundles then
			s_LoadingInfo = s_LoadingInfo .. ", "
		end
	end

	UIManager:SetLoadingInfo('Mounting bundles: ' .. tostring(s_LoadingInfo))
	EditorCommon:OnLoadBundles(p_Hook, p_Bundles, p_Compartment)
end

function MapEditorClient:OnEntityCreate(p_Hook, p_EntityData, p_Transform )
	GameObjectManager:OnEntityCreate(p_Hook, p_EntityData, p_Transform )
end

function MapEditorClient:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
	GameObjectManager:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
end

function MapEditorClient:OnLoadingInfo(p_Info)
	UIManager:SetLoadingInfo(p_Info)
end

----------- Editor functions----------------

function MapEditorClient:OnSendCommandsToServer(p_CommandsJson)
	ClientTransactionManager:OnSendCommandsToServer(p_CommandsJson)
end

function MapEditorClient:OnReceiveMessages(p_Messages)
	ClientTransactionManager:OnReceiveMessages(p_Messages)
end

function MapEditorClient:OnReceiveProjectData(p_ProjectData)
	-- TODO: Handle properly in the project admin view
	WebUpdater:AddUpdate('SetProjectData', p_ProjectData)
end

function MapEditorClient:OnProjectImportFinished(p_Msg)
	WebUpdater:AddUpdate('ProjectImportFinished', p_Msg)
end

----------- WebUI functions----------------

function MapEditorClient:OnUIReloaded()
	Editor:InitializeUIData(ClientTransactionManager:GetExecutedCommandActions())
	UIManager:OnUIReloaded()
end

function MapEditorClient:OnReceiveProjectHeaders(p_ProjectHeaders)
	WebUpdater:AddUpdate('SetProjectHeaders', p_ProjectHeaders)
end

function MapEditorClient:OnReceiveCurrentProjectHeader(p_CurrentProjectHeader)
	WebUpdater:AddUpdate('SetCurrentProjectHeader', p_CurrentProjectHeader)
end

function MapEditorClient:OnEnableFreeCamMovement()
	UIManager:OnEnableFreeCamMovement()
	FreeCam:OnEnableFreeCamMovement()
end

function MapEditorClient:OnDisableEditorMode()
	UIManager:OnDisableEditorMode()
end

function MapEditorClient:OnCameraControlStart()
	FreeCam:OnControlStart()
end

function MapEditorClient:OnCameraControlEnd()
	FreeCam:OnControlEnd()
end

function MapEditorClient:OnCameraControlUpdate(p_TransformJson)
	local s_Transform = DecodeParams(json.decode(p_TransformJson))

	if s_Transform then
		FreeCam:OnControlUpdate(s_Transform.transform)
	end

	Editor:OnControlUpdate()
end

function MapEditorClient:OnFocusCamera(p_Json)
	local s_Params = DecodeParams(json.decode(p_Json))
	if s_Params and s_Params.transform then
		FreeCam:StartFocus(s_Params.transform, s_Params.duration or 0.26)
	end
end

return MapEditorClient()
