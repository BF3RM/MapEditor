class "WebUpdater"

local m_Logger = Logger("WebUpdater", true)

local UI_UPDATE_TIME = 0.016667 -- 60 fps

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

function WebUpdater:AddUpdate(p_Path, p_Payload)
	m_Logger:Write('Added update. Path: '..p_Path)
	table.insert(self.m_WebUpdateStack, {
		path = p_Path,
		payload = p_Payload
	})
end

function WebUpdater:OnUpdate(p_Delta, p_SimulationDelta)
	if not self.m_IsUIReady then
		return
	end

	self.m_ElapsedTime = self.m_ElapsedTime + p_Delta
	if self.m_ElapsedTime > UI_UPDATE_TIME then
		self.m_ElapsedTime = 0
		if self.m_WebUpdateStack ~= nil and #self.m_WebUpdateStack > 0 then
			WebUI:ExecuteJS(string.format("editor.vext.WebUpdateBatch(%s)", json.encode(self.m_WebUpdateStack)))
			self.m_WebUpdateStack = {}
		end
	end
end

return WebUpdater()
