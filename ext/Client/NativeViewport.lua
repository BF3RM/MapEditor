-- ext/Client/NativeViewport.lua
-- Gameface port: the three.js/WebGL viewport can't render in Gameface, so the
-- in-world editor overlay (hover-highlight + selection boxes) is drawn natively
-- via VEXT DebugRenderer, depth-correct, from the game objects the client tracks.
--
-- Picking stays in the WebUI (three.js Raycaster is CPU and works headless): the
-- WebUI raycasts on mouse-move/click and pushes the hit guid(s) here; we just draw
-- the boxes for the highlighted / selected objects. Draw calls MUST be issued from
-- UI:DrawHud (that is the only event where DebugRenderer paints).

NativeViewport = class 'NativeViewport'

local m_ColorSelected  = Vec4(1.0, 0.45, 0.1, 1.0)  -- orange: selected
local m_ColorHighlight = Vec4(0.95, 0.95, 0.95, 0.9) -- white: hover highlight

-- Transform gizmo axis colours (pure R/G/B like the original TransformControls
-- matRed/matGreen/matBlue = 0xff0000/0x00ff00/0x0000ff).
local m_ColorX = Vec4(1.0, 0.0, 0.0, 1.0)
local m_ColorY = Vec4(0.0, 1.0, 0.0, 1.0)
local m_ColorZ = Vec4(0.0, 0.0, 1.0, 1.0)
local m_ColorWhite = Vec4(1.0, 1.0, 1.0, 0.6)
-- cyan: objects placed but deliberately not instantiated (GH #394). Distinct from selected
-- (orange) and hover (white) so a marker is never mistaken for a selection.
local m_ColorPlaceholder = Vec4(0.2, 0.9, 1.0, 0.9)

-- Transparent plane-quad colours: in the original each plane square is coloured by
-- the axis PERPENDICULAR to it (gizmoTranslate.XY = matBlueTransparent, YZ = red,
-- XZ = green).
local m_ColorXT = Vec4(1.0, 0.0, 0.0, 0.5)
local m_ColorYT = Vec4(0.0, 1.0, 0.0, 0.5)
local m_ColorZT = Vec4(0.0, 0.0, 1.0, 0.5)

-- Rotate: XYZE full ring = matGray (0x787878), E full ring = matYellowTransparent.
local m_ColorGray = Vec4(0.47, 0.47, 0.47, 1.0)
local m_ColorYellow = Vec4(1.0, 1.0, 0.0, 0.4)

-- All gizmo dimensions below are in the original three.js "gizmo units"; the caller
-- multiplies by p_G (world units per gizmo unit) = distance * factor * size/4.
-- Original translate handle: line CylinderGeometry(r 0.0075, len 0.5); arrow
-- CylinderGeometry(0, 0.04, 0.1) at 0.5; center OctahedronGeometry(0.1).

-- Cone (arrowhead): base ring of radius p_R at p_Base, apex p_Base + p_Dir*p_H.
local function DrawCone(p_Base, p_Dir, p_H, p_R, p_Perp1, p_Perp2, p_Color)
	local s_Apex = p_Base + p_Dir * p_H
	local s_Seg = 12
	local s_Prev = nil
	for i = 0, s_Seg do
		local a = (i / s_Seg) * math.pi * 2.0
		local s_P = p_Base + p_Perp1 * (math.cos(a) * p_R) + p_Perp2 * (math.sin(a) * p_R)
		DebugRenderer:DrawLine(s_Apex, s_P, p_Color, p_Color)
		if s_Prev ~= nil then
			DebugRenderer:DrawLine(s_Prev, s_P, p_Color, p_Color)
		end
		s_Prev = s_P
	end
end

-- One translate axis: line 0->0.5, arrowhead at +0.5, and a mirror arrowhead at
-- -0.5 (both ends, as in the original gizmoTranslate).
local function DrawTranslateAxis(p_Center, p_Dir, p_Perp1, p_Perp2, p_G, p_Color)
	local s_NegDir = p_Dir * -1.0
	local s_PosEnd = p_Center + p_Dir * (0.5 * p_G)
	DebugRenderer:DrawLine(p_Center, s_PosEnd, p_Color, p_Color)
	DrawCone(s_PosEnd, p_Dir, 0.1 * p_G, 0.04 * p_G, p_Perp1, p_Perp2, p_Color)
	local s_NegEnd = p_Center + s_NegDir * (0.5 * p_G)
	DrawCone(s_NegEnd, s_NegDir, 0.1 * p_G, 0.04 * p_G, p_Perp1, p_Perp2, p_Color)
end

-- Arc / ring: sweeps u in [0, p_UMax], point = center + (cos u * vCos + sin u * vSin) * R.
-- A half-ring (rotate X/Y/Z) uses p_UMax = pi; a full ring (XYZE / E) uses 2*pi.
local function DrawArc(p_Center, p_VCos, p_VSin, p_R, p_UMax, p_Color)
	local s_Seg = 48
	local s_Prev = nil
	for i = 0, s_Seg do
		local u = (i / s_Seg) * p_UMax
		local c = math.cos(u)
		local s = math.sin(u)
		local s_P = Vec3(
			p_Center.x + (p_VCos.x * c + p_VSin.x * s) * p_R,
			p_Center.y + (p_VCos.y * c + p_VSin.y * s) * p_R,
			p_Center.z + (p_VCos.z * c + p_VSin.z * s) * p_R)
		if s_Prev ~= nil then
			DebugRenderer:DrawLine(s_Prev, s_P, p_Color, p_Color)
		end
		s_Prev = s_P
	end
end

-- Axis-aligned wireframe cube, half-extent p_H (scale handle Box(0.08) -> h 0.04,
-- centre Box(0.1) -> h 0.05).
local function DrawBox(p_Center, p_H, p_Color)
	local c = p_Center
	local h = p_H
	local s_Corners = {
		Vec3(c.x - h, c.y - h, c.z - h), Vec3(c.x + h, c.y - h, c.z - h),
		Vec3(c.x + h, c.y + h, c.z - h), Vec3(c.x - h, c.y + h, c.z - h),
		Vec3(c.x - h, c.y - h, c.z + h), Vec3(c.x + h, c.y - h, c.z + h),
		Vec3(c.x + h, c.y + h, c.z + h), Vec3(c.x - h, c.y + h, c.z + h),
	}
	local s_Edges = {
		{ 1, 2 }, { 2, 3 }, { 3, 4 }, { 4, 1 },
		{ 5, 6 }, { 6, 7 }, { 7, 8 }, { 8, 5 },
		{ 1, 5 }, { 2, 6 }, { 3, 7 }, { 4, 8 },
	}
	for _, e in ipairs(s_Edges) do
		DebugRenderer:DrawLine(s_Corners[e[1]], s_Corners[e[2]], p_Color, p_Color)
	end
end

-- Marker for a placed-but-not-instantiated object (GH #394). These have no engine entities, so
-- nothing would render them at all: without this they are invisible in the world and reachable
-- only from the Scene Instances tree. Drawn ALWAYS (not just when selected), because the whole
-- point is being able to find and position them.
--
-- Shows position AND facing: a person-sized wire box plus a forward arrow, since a capture point
-- or vehicle spawn placed backwards is a real mistake that a dot alone would hide.
local function DrawPlaceholderMarker(p_Transform, p_Color)
	local c = p_Transform.trans
	local s_Up = p_Transform.up
	local s_Fwd = p_Transform.forward
	local s_Left = p_Transform.left

	-- Wire box, 1m across and 2m tall, sitting on the object's origin.
	local h = 0.5
	local s_Top = c + s_Up * 2.0
	local s_Corners = {
		c + s_Left * h + s_Fwd * h, c - s_Left * h + s_Fwd * h,
		c - s_Left * h - s_Fwd * h, c + s_Left * h - s_Fwd * h,
	}
	local s_TopCorners = {
		s_Top + s_Left * h + s_Fwd * h, s_Top - s_Left * h + s_Fwd * h,
		s_Top - s_Left * h - s_Fwd * h, s_Top + s_Left * h - s_Fwd * h,
	}
	for i = 1, 4 do
		local j = (i % 4) + 1
		DebugRenderer:DrawLine(s_Corners[i], s_Corners[j], p_Color, p_Color)
		DebugRenderer:DrawLine(s_TopCorners[i], s_TopCorners[j], p_Color, p_Color)
		DebugRenderer:DrawLine(s_Corners[i], s_TopCorners[i], p_Color, p_Color)
	end

	-- Facing arrow along +forward, at waist height.
	local s_Mid = c + s_Up * 1.0
	local s_Tip = s_Mid + s_Fwd * 1.2
	DebugRenderer:DrawLine(s_Mid, s_Tip, p_Color, p_Color)
	DebugRenderer:DrawLine(s_Tip, s_Tip - s_Fwd * 0.3 + s_Left * 0.2, p_Color, p_Color)
	DebugRenderer:DrawLine(s_Tip, s_Tip - s_Fwd * 0.3 - s_Left * 0.2, p_Color, p_Color)
end

-- Outline square in the plane spanned by p_VA, p_VB (the translate/scale plane
-- handles: Box(0.15,0.15,0.01) -> half-extent 0.075).
local function DrawSquare(p_Center, p_VA, p_VB, p_H, p_Color)
	local a = p_VA * p_H
	local b = p_VB * p_H
	local p1 = p_Center - a - b
	local p2 = p_Center + a - b
	local p3 = p_Center + a + b
	local p4 = p_Center - a + b
	DebugRenderer:DrawLine(p1, p2, p_Color, p_Color)
	DebugRenderer:DrawLine(p2, p3, p_Color, p_Color)
	DebugRenderer:DrawLine(p3, p4, p_Color, p_Color)
	DebugRenderer:DrawLine(p4, p1, p_Color, p_Color)
end

-- One scale axis: line 0->+0.5 (lineGeometry2) and a cube handle at BOTH +-0.5.
local function DrawScaleAxis(p_Center, p_Dir, p_G, p_Color)
	local s_PosEnd = p_Center + p_Dir * (0.5 * p_G)
	local s_NegEnd = p_Center - p_Dir * (0.5 * p_G)
	DebugRenderer:DrawLine(p_Center, s_PosEnd, p_Color, p_Color)
	DrawBox(s_PosEnd, 0.05 * p_G, p_Color)
	DrawBox(s_NegEnd, 0.05 * p_G, p_Color)
end

function NativeViewport:__init()
	self.m_Active = false
	self.m_SelectedGuids = {}        -- [guidString] = true
	self.m_HighlightedGuid = nil     -- single guid string under the cursor
	self.m_GizmoMode = 'select'      -- select | translate | rotate | scale
	self.m_WorldSpace = 'local'      -- world | local (matches THREEManager default)
	self.m_GizmoCenter = nil         -- Vec3 sent from JS (selectionGroup origin), or nil
	self.m_AxisX = Vec3(1, 0, 0)     -- gizmo basis (world, or object-local in local space)
	self.m_AxisY = Vec3(0, 1, 0)
	self.m_AxisZ = Vec3(0, 0, 1)
end

-- p_List = {xx,xy,xz, yx,yy,yz, zx,zy,zz} from JS (the 3 gizmo axes).
function NativeViewport:SetGizmoBasis(p_List)
	if type(p_List) == 'table' and #p_List >= 9 then
		self.m_AxisX = Vec3(p_List[1], p_List[2], p_List[3])
		self.m_AxisY = Vec3(p_List[4], p_List[5], p_List[6])
		self.m_AxisZ = Vec3(p_List[7], p_List[8], p_List[9])
	end
end

-- p_List = {x, y, z} from JS (selectionGroup world origin), or empty to clear.
function NativeViewport:SetGizmoCenter(p_List)
	if type(p_List) == 'table' and #p_List >= 3 then
		self.m_GizmoCenter = Vec3(p_List[1], p_List[2], p_List[3])
	else
		self.m_GizmoCenter = nil
	end
end

-- p_Mode is one of GIZMO_MODE: 'select' hides the gizmo, otherwise draw that mode.
function NativeViewport:SetGizmoMode(p_Mode)
	if p_Mode == 'translate' or p_Mode == 'rotate' or p_Mode == 'scale' then
		self.m_GizmoMode = p_Mode
	else
		self.m_GizmoMode = 'select'
	end
end

function NativeViewport:SetWorldSpace(p_Space)
	if p_Space == 'world' or p_Space == 'local' then
		self.m_WorldSpace = p_Space
	end
end

function NativeViewport:SetActive(p_Active)
	self.m_Active = p_Active
	if not p_Active then
		self.m_HighlightedGuid = nil
		self.m_SelectedGuids = {}
	end
end

function NativeViewport:SetHighlight(p_Guid)
	if p_Guid == nil or p_Guid == '' then
		self.m_HighlightedGuid = nil
	else
		self.m_HighlightedGuid = tostring(p_Guid)
	end
end

function NativeViewport:SetSelection(p_GuidList)
	self.m_SelectedGuids = {}
	if type(p_GuidList) == 'table' then
		for _, l_Guid in ipairs(p_GuidList) do
			self.m_SelectedGuids[tostring(l_Guid)] = true
		end
	end
end

-- Draw every spatial entity's OBB for one game object.
local function DrawGameObject(p_GameObject, p_Color)
	if p_GameObject == nil or p_GameObject.gameEntities == nil then
		return
	end
	for _, l_GameEntity in pairs(p_GameObject.gameEntities) do
		if l_GameEntity.entity ~= nil and l_GameEntity.isSpatial then
			pcall(function()
				local s_Spatial = SpatialEntity(l_GameEntity.entity)
				if s_Spatial ~= nil and s_Spatial.aabb ~= nil then
					DebugRenderer:DrawOBB(s_Spatial.aabb, s_Spatial.aabbTransform, p_Color)
				end
			end)
		end
	end

	-- Recurse into child GameObjects so nested children's AABBs draw too — parity with the
	-- three.js viewport, which walks the whole subtree on select/highlight (GameObject.ts). The
	-- native drawer previously only drew the top object's own entities. Data's already here: each
	-- child carries its own gameEntities with live entity handles. (`local function` above already
	-- supports this self-recursion — the local is in scope inside its own body.)
	if p_GameObject.children ~= nil then
		for _, l_Child in pairs(p_GameObject.children) do
			DrawGameObject(l_Child, p_Color)
		end
	end
end

-- Called from UI:DrawHud each frame.
function NativeViewport:OnDraw()
	if not self.m_Active then
		return
	end
	if GameObjectManager == nil or GameObjectManager.m_GameObjects == nil then
		return
	end

	-- Placed-but-not-instantiated objects (cyan), always visible — they have no entities, so
	-- nothing else draws them. Iterates a dedicated table, not every tracked object.
	if GameObjectManager.m_Placeholders ~= nil then
		for _, l_GameObject in pairs(GameObjectManager.m_Placeholders) do
			if l_GameObject ~= nil and l_GameObject.transform ~= nil and l_GameObject.isDeleted ~= true then
				pcall(function() DrawPlaceholderMarker(l_GameObject.transform, m_ColorPlaceholder) end)
			end
		end
	end

	-- Selected objects (orange).
	for l_GuidStr, _ in pairs(self.m_SelectedGuids) do
		DrawGameObject(GameObjectManager.m_GameObjects[l_GuidStr], m_ColorSelected)
	end

	-- Hover highlight (white), unless it's already selected.
	if self.m_HighlightedGuid ~= nil and self.m_SelectedGuids[self.m_HighlightedGuid] ~= true then
		DrawGameObject(GameObjectManager.m_GameObjects[self.m_HighlightedGuid], m_ColorHighlight)
	end

	-- Transform gizmo: drawn at the selection centre at a constant on-screen size,
	-- matching three.js TransformControls exactly:
	--   factor = dist * min(1.9*tan(fov*pi/360)/zoom, 7);  gizmoScale = factor*size/4
	-- (size = 0.8 from GizmoWrapper:setSize(0.8), zoom = 1). Only drawn when a gizmo
	-- mode is active ('select' hides it, exactly like setGizmoMode -> hideGizmo).
	-- Gizmo centre = the origin JS pushed (selectionGroup world origin, matching the
	-- original TransformControls attach point + the JS drag hit-test), falling back
	-- to the averaged AABB centre if none was sent yet.
	local s_Center = nil
	if self.m_GizmoMode ~= 'select' then
		s_Center = self.m_GizmoCenter or self:GetSelectionCenter()
	end
	if s_Center ~= nil then
		local s_G = 1.0
		-- Camera right/up for the camera-facing rotate rings (XYZE gray, E yellow).
		local s_CamRight = Vec3(1, 0, 0)
		local s_CamUp = Vec3(0, 1, 0)
		pcall(function()
			local s_CamT = ClientUtils:GetCameraTransform()
			local s_Fov = 90.0
			if FreeCam ~= nil and FreeCam.GetCameraFOV ~= nil then
				s_Fov = FreeCam:GetCameraFOV() or 90.0
			end
			local dx = s_Center.x - s_CamT.trans.x
			local dy = s_Center.y - s_CamT.trans.y
			local dz = s_Center.z - s_CamT.trans.z
			local s_Dist = math.sqrt(dx * dx + dy * dy + dz * dz)
			local s_Factor = s_Dist * math.min(1.9 * math.tan(math.pi * s_Fov / 360.0), 7.0)
			s_G = s_Factor * 0.8 / 4.0
			s_CamRight = s_CamT.left     -- unit, perpendicular to forward
			s_CamUp = s_CamT.up          -- unit, perpendicular to forward + left
		end)
		if s_G < 0.02 then s_G = 0.02 end

		local s_AX = self.m_AxisX
		local s_AY = self.m_AxisY
		local s_AZ = self.m_AxisZ
		if self.m_GizmoMode == 'translate' then
			DrawTranslateAxis(s_Center, s_AX, s_AY, s_AZ, s_G, m_ColorX)
			DrawTranslateAxis(s_Center, s_AY, s_AX, s_AZ, s_G, m_ColorY)
			DrawTranslateAxis(s_Center, s_AZ, s_AX, s_AY, s_G, m_ColorZ)
			-- (Corner plane handles omitted: no plane-drag yet -> no dead handles.)
			-- Centre handle -> solid filled sphere.
			DebugRenderer:DrawSphere(s_Center, 0.1 * s_G, m_ColorWhite, false, false)
		elseif self.m_GizmoMode == 'rotate' then
			-- Full rings r0.5; each is drawn as a fake "tube" = 3 circles offset along
			-- its own axis so it reads solid/thick like the Chromium mesh gizmo.
			local d = 0.007 * s_G
			for _, o in ipairs({ -d, 0.0, d }) do
				DrawArc(s_Center + s_AX * o, s_AY, s_AZ, 0.5 * s_G, 2.0 * math.pi, m_ColorX)
				DrawArc(s_Center + s_AY * o, s_AX, s_AZ, 0.5 * s_G, 2.0 * math.pi, m_ColorY)
				DrawArc(s_Center + s_AZ * o, s_AX, s_AY, 0.5 * s_G, 2.0 * math.pi, m_ColorZ)
			end
			-- Camera-facing gray inner (r0.5) + yellow outer (r0.75) rings, thickened
			-- with concentric circles.
			for _, o in ipairs({ -d, 0.0, d }) do
				DrawArc(s_Center, s_CamRight, s_CamUp, 0.5 * s_G + o, 2.0 * math.pi, m_ColorGray)
				DrawArc(s_Center, s_CamRight, s_CamUp, 0.75 * s_G + o, 2.0 * math.pi, m_ColorYellow)
			end
		elseif self.m_GizmoMode == 'scale' then
			DrawScaleAxis(s_Center, s_AX, s_G, m_ColorX)
			DrawScaleAxis(s_Center, s_AY, s_G, m_ColorY)
			DrawScaleAxis(s_Center, s_AZ, s_G, m_ColorZ)
			-- (Corner plane handles omitted: no plane-drag yet -> no dead handles.)
			-- Centre handle -> cube.
			DrawBox(s_Center, 0.06 * s_G, m_ColorWhite)
		end
	end
end

-- Average world centre of the selected objects (from their spatial AABB transforms).
function NativeViewport:GetSelectionCenter()
	if GameObjectManager == nil or GameObjectManager.m_GameObjects == nil then
		return nil
	end
	local s_Sum = Vec3(0, 0, 0)
	local s_Count = 0
	for l_GuidStr, _ in pairs(self.m_SelectedGuids) do
		local s_GameObject = GameObjectManager.m_GameObjects[l_GuidStr]
		if s_GameObject ~= nil and s_GameObject.gameEntities ~= nil then
			for _, l_GameEntity in pairs(s_GameObject.gameEntities) do
				if l_GameEntity.entity ~= nil and l_GameEntity.isSpatial then
					local s_Ok = pcall(function()
						local s_Spatial = SpatialEntity(l_GameEntity.entity)
						if s_Spatial ~= nil and s_Spatial.aabbTransform ~= nil then
							s_Sum = s_Sum + s_Spatial.aabbTransform.trans
							s_Count = s_Count + 1
						end
					end)
					if s_Ok then break end
				end
			end
		end
	end
	if s_Count == 0 then
		return nil
	end
	return Vec3(s_Sum.x / s_Count, s_Sum.y / s_Count, s_Sum.z / s_Count)
end

return NativeViewport()
