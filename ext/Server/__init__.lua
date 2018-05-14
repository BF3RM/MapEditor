class 'MapEditorServer'

local Shared = require '__shared/MapEditorShared'

function MapEditorServer:__init()
	print("Initializing MapEditorServer")
	self:RegisterVars()
	self:RegisterEvents()
	Shared:__init()
end


function MapEditorServer:RegisterVars()
end


function MapEditorServer:RegisterEvents()
	self.m_EngineMessageEvent = Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
	self.m_OnRoundReset = Events:Subscribe("Server:RoundReset", self, self.OnRoundReset)
end

function MapEditorServer:OnRoundReset()
	NetEvents:BroadcastLocal('MapEditor:RoundReset')
end

function MapEditorServer:OnEngineMessage(p_Message) 

	if p_Message.type == MessageType.ClientConnectedMessage or
		p_Message.type == MessageType.ServerLevelLoadedMessage then 
	end
end


g_MapEditorServer = MapEditorServer()

