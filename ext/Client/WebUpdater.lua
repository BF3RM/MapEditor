---@class WebUpdater
---@overload fun():WebUpdater
WebUpdater = class "WebUpdater"

local m_Logger = Logger("WebUpdater", false)

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

function WebUpdater:AddUpdate(p_Path, p_Payload, p_RemoveDuplicates)
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
			WebUI:ExecuteJS(string.format("window.vext.WebUpdateBatch(%s)", json.encode(self.m_WebUpdateStack)))
			self.m_WebUpdateStack = {}
		end
	end
end

WebUpdater = WebUpdater()

return WebUpdater
