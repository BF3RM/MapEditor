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

-- Frames between box-refresh requests for the selection (~4/second at 60fps). Fast enough that a
-- moving vehicle's box tracks it, slow enough to be nothing traffic-wise.
local BOX_REFRESH_FRAMES = 15
-- Most guids asked for in one RequestBoxes message; the server measures each one it is sent.
local BOX_REQUEST_LIMIT = 64

-- TEMP diagnostics from the vehicle-AABB investigation, silenced rather than deleted: they are how
-- the empty client entity bus and the DrawOBB userdata rejection were found, and will be wanted
-- again. They run inside the per-frame draw path, so they stay off unless flipped on.
local DIAG_ENABLED = false

local function m_DiagNet(p_Event, p_Text)
	if DIAG_ENABLED then
		NetEvents:SendLocal(p_Event, p_Text)
	end
end

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

	-- Which overlays to draw (GH #395). Defaults are "everything on", i.e. the behaviour before
	-- the toggles existed. maxDistance 0 = unlimited; anything else culls markers further than
	-- that from the camera, which also bounds the per-frame DebugRenderer cost on a busy level.
	self.m_Overlays = {
		enabled = true,
		selection = true,
		highlight = true,
		placeholders = true,
		maxDistance = 0,
	}
end

--- Apply overlay visibility settings pushed from the WebUI. Unknown/missing keys keep their
--- current value, so the UI can send partial updates.
---@param p_Settings table
function NativeViewport:SetOverlaySettings(p_Settings)
	if type(p_Settings) ~= 'table' then
		return
	end

	for l_Key, l_Default in pairs(self.m_Overlays) do
		local l_Value = p_Settings[l_Key]

		if type(l_Value) == type(l_Default) then
			self.m_Overlays[l_Key] = l_Value
		end
	end
end

--- True when a marker at p_Transform is within the configured draw distance of the camera.
---@param p_Transform LinearTransform
---@return boolean
function NativeViewport:WithinDrawDistance(p_Transform)
	local s_Max = self.m_Overlays.maxDistance

	if s_Max == nil or s_Max <= 0 then
		return true
	end

	local s_Ok, s_Within = pcall(function()
		local s_Cam = ClientUtils:GetCameraTransform().trans
		local s_Pos = p_Transform.trans
		local s_Dx, s_Dy, s_Dz = s_Pos.x - s_Cam.x, s_Pos.y - s_Cam.y, s_Pos.z - s_Cam.z

		return (s_Dx * s_Dx + s_Dy * s_Dy + s_Dz * s_Dz) <= (s_Max * s_Max)
	end)

	-- No camera (or anything else unexpected) -> draw it; a missing cull is far better than a
	-- silently blank viewport.
	return (not s_Ok) or s_Within
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

-- Draw an axis-aligned box as 12 edges, given its extents and a world transform.
--
-- DebugRenderer:DrawOBB wants an engine AxisAlignedBox userdata, and a replicated box is a plain
-- Lua table rebuilt from JSON -- passing it fails with "expected userdata, received table". The
-- engine type is not constructible from Lua as far as this codebase knows, but DrawLine takes
-- ordinary Vec3s, so the box is drawn edge by edge instead. Same picture, no userdata needed.
local function DrawBoxEdges(p_Min, p_Max, p_Transform, p_Color)
	local function Corner(p_X, p_Y, p_Z)
		return Vec3(
			p_Transform.trans.x + p_Transform.left.x * p_X + p_Transform.up.x * p_Y + p_Transform.forward.x * p_Z,
			p_Transform.trans.y + p_Transform.left.y * p_X + p_Transform.up.y * p_Y + p_Transform.forward.y * p_Z,
			p_Transform.trans.z + p_Transform.left.z * p_X + p_Transform.up.z * p_Y + p_Transform.forward.z * p_Z)
	end

	local c = {
		Corner(p_Min.x, p_Min.y, p_Min.z), Corner(p_Max.x, p_Min.y, p_Min.z),
		Corner(p_Max.x, p_Min.y, p_Max.z), Corner(p_Min.x, p_Min.y, p_Max.z),
		Corner(p_Min.x, p_Max.y, p_Min.z), Corner(p_Max.x, p_Max.y, p_Min.z),
		Corner(p_Max.x, p_Max.y, p_Max.z), Corner(p_Min.x, p_Max.y, p_Max.z),
	}

	-- bottom face, top face, then the four verticals
	local s_Edges = { {1,2},{2,3},{3,4},{4,1}, {5,6},{6,7},{7,8},{8,5}, {1,5},{2,6},{3,7},{4,8} }

	for _, l_E in ipairs(s_Edges) do
		DebugRenderer:DrawLine(c[l_E[1]], c[l_E[2]], p_Color, p_Color)
	end
end

-- Draw every spatial entity's OBB for one game object.
local function DrawGameObject(p_GameObject, p_Color)
	-- TEMP DIAG: reported once. Vehicles draw no box and the per-entity diagnostic never fired, so
	-- establish whether this function runs at all and what it is looking at.
	if not _G.__drawObjReported then
		_G.__drawObjReported = true

		local s_N, s_Detail = 0, ''

		if p_GameObject ~= nil and p_GameObject.gameEntities ~= nil then
			for _, l_GE in pairs(p_GameObject.gameEntities) do
				s_N = s_N + 1

				if s_N <= 3 then
					s_Detail = s_Detail .. ' [ent=' .. tostring(l_GE.entity ~= nil) ..
						' spatial=' .. tostring(l_GE.isSpatial) ..
						' aabb=' .. tostring(l_GE.aabb ~= nil) .. ']'
				end
			end
		end

		m_DiagNet('MapEditor:AabbDiag', 'DRAW-OBJ called obj=' ..
			(p_GameObject ~= nil and tostring(p_GameObject.guid):sub(-6) or 'NIL') ..
			' entities=' .. s_N .. s_Detail)
	end

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
		elseif l_GameEntity.isSpatial and l_GameEntity.aabb ~= nil then
			-- No engine entity in THIS realm. A networked vehicle is built by the server and the
			-- client never gets a handle to its entities, so the branch above skips it and a
			-- vehicle could never be outlined. The server sends its box instead
			-- (ReplicatedSpatialEntity); it is stored relative to the object, so put it back into
			-- world space before drawing.
			local s_Ok, s_Err = pcall(function()
				local s_Transform = l_GameEntity.aabb.transform

				if p_GameObject.transform ~= nil then
					s_Transform = ToWorld(s_Transform, p_GameObject.transform)
				end

				DrawBoxEdges(l_GameEntity.aabb.min, l_GameEntity.aabb.max, s_Transform, p_Color)
			end)

			-- TEMP DIAG: this runs per frame, so report only the first outcome. A pcall here would
			-- otherwise hide a type rejection from DrawOBB completely, and client Lua output is not
			-- readable from the host.
			if not _G.__replDrawReported2 then
				_G.__replDrawReported2 = true

				local s_Aabb = l_GameEntity.aabb
				local s_Desc = 'ok=' .. tostring(s_Ok) .. ' err=' .. tostring(s_Err) ..
					' minType=' .. type(s_Aabb.min) ..
					' transType=' .. type(s_Aabb.transform) ..
					' objT=' .. tostring(p_GameObject.transform ~= nil)

				m_DiagNet('MapEditor:AabbDiag', 'DRAW-REPL ' .. s_Desc)
			end
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
	-- TEMP DIAG: above the guard on purpose. Nothing reported from below it, which cannot
	-- distinguish "inactive" from "active but drawing nothing".
	if not _G.__activeReported then
		_G.__activeReported = true

		m_DiagNet('MapEditor:AabbDiag', 'ONDRAW active=' .. tostring(self.m_Active))
	end

	if not self.m_Active then
		return
	end
	if GameObjectManager == nil or GameObjectManager.m_GameObjects == nil then
		return
	end

	local s_Overlays = self.m_Overlays

	-- Placed-but-not-instantiated objects (cyan) — they have no entities, so nothing else draws
	-- them. Iterates a dedicated table, not every tracked object, and the flag is checked BEFORE
	-- the loop so switching the category off costs nothing per frame.
	if s_Overlays.enabled and s_Overlays.placeholders and GameObjectManager.m_Placeholders ~= nil then
		for _, l_GameObject in pairs(GameObjectManager.m_Placeholders) do
			if l_GameObject ~= nil and l_GameObject.transform ~= nil and l_GameObject.isDeleted ~= true
				and self:WithinDrawDistance(l_GameObject.transform) then
				pcall(function() DrawPlaceholderMarker(l_GameObject.transform, m_ColorPlaceholder) end)
			end
		end
	end

	-- A replicated box is a snapshot: the vehicle drives off under physics and the box stays put,
	-- because this realm has no entity handle to follow. Ask the server to re-measure what is
	-- selected, a few times a second. Only the selection, only while the viewport is drawing, and
	-- only when something selected actually carries a replicated box -- so a normal editing session
	-- with statics selected sends nothing at all.
	self.m_BoxRefreshTick = (self.m_BoxRefreshTick or 0) + 1

	if self.m_BoxRefreshTick >= BOX_REFRESH_FRAMES then
		self.m_BoxRefreshTick = 0

		local s_Wanted = {}

		self.m_BoxAsked = self.m_BoxAsked or {}

		-- Forget objects that are no longer selected, so reselecting one asks again (and this
		-- table cannot grow for the whole session).
		for l_GuidStr, _ in pairs(self.m_BoxAsked) do
			if self.m_SelectedGuids[l_GuidStr] == nil then
				self.m_BoxAsked[l_GuidStr] = nil
			end
		end

		local s_Fresh = {}

		for l_GuidStr, _ in pairs(self.m_SelectedGuids) do
			local s_Object = GameObjectManager.m_GameObjects[l_GuidStr]

			if s_Object ~= nil then
				-- Three cases, and only the first two are worth a message:
				--
				--   mover    - a replicated box for something physics-driven. It goes stale the
				--              moment the vehicle moves, so re-measure it every refresh.
				--   no box   - nothing drawable on this realm at all. Since the client's
				--              blueprint hook never fires, EVERY vanilla object arrives as
				--              server-only transfer data carrying no entities, so selecting a
				--              vanilla LAV outlined nothing: the old condition required an
				--              already-replicated entity, which such an object can never have.
				--              Ask ONCE -- a static does not move, and the reply gives it a box.
				--   local    - a real client entity; it draws itself, so ask for nothing.
				local s_Mover, s_Drawable = false, false

				-- Only something the EDITOR spawned is re-measured continuously. A vanilla vehicle
				-- is not being dragged by anyone, so one box is enough -- and re-measuring every
				-- vanilla selection ran the server out of memory (exit 8) after a handful of
				-- vehicles: each refresh made it walk the object's entities and build a payload,
				-- four times a second, for objects that were never moving in the first place.
				-- If a vanilla vehicle does drive off, reselecting it measures again.
				local s_IsSpawned = s_Object.origin == GameObjectOriginType.Custom or
					s_Object.origin == GameObjectOriginType.CustomChild

				if s_Object.gameEntities ~= nil then
					for _, l_GE in pairs(s_Object.gameEntities) do
						if l_GE.isReplicated then
							s_Drawable = s_Drawable or l_GE.aabb ~= nil

							if s_IsSpawned and string.find(tostring(l_GE.typeName), 'Vehicle') ~= nil then
								s_Mover = true
							end
						elseif l_GE.entity ~= nil and l_GE.isSpatial then
							s_Drawable = true
						end
					end
				end

				if s_Mover then
					table.insert(s_Wanted, l_GuidStr)
				elseif not s_Drawable and self.m_BoxAsked[l_GuidStr] == nil then
					table.insert(s_Fresh, l_GuidStr)
				end
			end
		end

		-- Bound the message: selecting a whole level would otherwise ask for everything at once.
		-- Only what is actually sent is marked as asked, so the remainder comes on later refreshes.
		for _, l_GuidStr in ipairs(s_Fresh) do
			if #s_Wanted >= BOX_REQUEST_LIMIT then
				break
			end

			self.m_BoxAsked[l_GuidStr] = true
			table.insert(s_Wanted, l_GuidStr)
		end

		if #s_Wanted > 0 then
			NetEvents:SendLocal('MapEditor:RequestBoxes', json.encode(s_Wanted))
		end
	end

	-- Selected objects (orange).
	if not _G.__overlayReported then
		_G.__overlayReported = true

		local s_Count = 0

		for _, _ in pairs(self.m_SelectedGuids) do
			s_Count = s_Count + 1
		end

		m_DiagNet('MapEditor:AabbDiag', 'OVERLAY enabled=' .. tostring(s_Overlays.enabled) ..
			' selection=' .. tostring(s_Overlays.selection) .. ' selectedGuids=' .. s_Count)
	end

	if s_Overlays.enabled and s_Overlays.selection then
		for l_GuidStr, _ in pairs(self.m_SelectedGuids) do
			DrawGameObject(GameObjectManager.m_GameObjects[l_GuidStr], m_ColorSelected)
		end
	end

	-- Hover highlight (white), unless it's already selected.
	if s_Overlays.enabled and s_Overlays.highlight
		and self.m_HighlightedGuid ~= nil and self.m_SelectedGuids[self.m_HighlightedGuid] ~= true then
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
