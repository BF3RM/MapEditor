---@class WebUpdater
---@overload fun():WebUpdater
WebUpdater = class "WebUpdater"

local m_Logger = Logger("WebUpdater", false)

local UI_UPDATE_TIME = 0.016667 -- 60 fps

-- Max WebUI updates flushed per tick. A B2K/XP1 level streams ~17k object updates into the
-- editor; sending them all in one batch makes Gameface build its tree in a single blocking
-- burst (multi-second freeze, esp. on entering the editor). Capping the batch drains the
-- backlog PROGRESSIVELY over many frames so objects load in the background and the game stays
-- responsive. (CEF tolerated the burst; Cohtml/Gameface does not.)
local MAX_UPDATES_PER_TICK = 40

function WebUpdater:__init()
	m_Logger:Write("Initializing WebUpdater")
	self:RegisterEvents()
	self:RegisterVars()
end

function WebUpdater:RegisterVars()
	self.m_WebUpdateStack = {}
	self.m_IsUIReady = false
	self.m_ElapsedTime = 0
end

function WebUpdater:RegisterEvents()
	Events:Subscribe('MapEditor:UIReady', self, self.OnUIReady)
end

function WebUpdater:OnUIReady()
	m_Logger:Write('UI is ready')
	self.m_IsUIReady = true
end

function WebUpdater:AddUpdate(p_Path, p_Payload, p_RemoveDuplicates)
	-- No WebUI booted yet (lazy boot pending) -> drop the update instead of queueing (the
	-- queue would grow unbounded since UIReady never fires, and on boot the UIReloaded ->
	-- InitializeUIData handshake resends the full state anyway).
	if UIManager == nil or not UIManager.m_WebUIBooted then
		return
	end

	m_Logger:Write('Added update. Path: '..p_Path)

	if p_RemoveDuplicates then
		for i, l_WebUpdate in pairs(self.m_WebUpdateStack) do
			if l_WebUpdate.path == p_Path then
				self.m_WebUpdateStack[i].payload = p_Payload
				return
			end
		end
	end

	table.insert(self.m_WebUpdateStack, {
		path = p_Path,
		payload = p_Payload
	})
end

function WebUpdater:OnUpdate(p_DeltaTime, p_SimulationDelta)
	if not self.m_IsUIReady then
		return
	end

	self.m_ElapsedTime = self.m_ElapsedTime + p_DeltaTime

	if self.m_ElapsedTime > UI_UPDATE_TIME then
		self.m_ElapsedTime = 0

		if self.m_WebUpdateStack ~= nil and #self.m_WebUpdateStack > 0 then
			local s_Count = #self.m_WebUpdateStack

			if s_Count <= MAX_UPDATES_PER_TICK then
				-- Small backlog: send it all.
				WebUI:ExecuteJS(string.format("window.vext.WebUpdateBatch(%s)", json.encode(self.m_WebUpdateStack)))
				self.m_WebUpdateStack = {}
			else
				-- Big backlog: send only the first MAX_UPDATES_PER_TICK this tick, keep the rest
				-- queued for following ticks so the WebUI ingests them progressively.
				local s_Batch = {}
				for i = 1, MAX_UPDATES_PER_TICK do
					s_Batch[i] = self.m_WebUpdateStack[i]
				end

				local s_Rest = {}
				for i = MAX_UPDATES_PER_TICK + 1, s_Count do
					s_Rest[#s_Rest + 1] = self.m_WebUpdateStack[i]
				end
				self.m_WebUpdateStack = s_Rest

				WebUI:ExecuteJS(string.format("window.vext.WebUpdateBatch(%s)", json.encode(s_Batch)))
			end
		end
	end
end

WebUpdater = WebUpdater()

return WebUpdater
