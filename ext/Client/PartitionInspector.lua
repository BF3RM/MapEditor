---@class PartitionInspector
--- Client-side transport bridge for the live EBX partition inspector.
---
--- Flow:
---   1. WebUI (JS) dispatches 'MapEditor:RequestPartitionData' with a JSON string { requestId, guid, name }.
---   2. This module forwards it to the server (NetEvents:SendLocal).
---   3. PartitionSerializer (server) serializes the live partition and streams it back CHUNKED.
---   4. This module reassembles the chunks and hands the full JSON string to the WebUI by calling
---      window.__onPartitionData(requestId, jsonString) via WebUI:ExecuteJS.
---
--- The WebUI owner wires FBPartition.getData() to (1) + a matching window.__onPartitionData / __onPartitionError
--- resolver. See the transport contract in the module header comments / report.
PartitionInspector = class 'PartitionInspector'

local m_Logger = Logger("PartitionInspector", false)

function PartitionInspector:__init()
	m_Logger:Write("Initializing PartitionInspector")
	-- requestId -> { chunks = {}, expected = n }
	self.m_Incoming = {}
	self:RegisterEvents()
end

function PartitionInspector:RegisterEvents()
	-- From the WebUI (JS -> client Lua). The JS side calls:
	--   WebUI.Call('DispatchEventLocal', 'MapEditor:RequestPartitionData', JSON.stringify({requestId, guid, name}))
	Events:Subscribe('MapEditor:RequestPartitionData', self, self.OnRequestPartitionData)

	-- From the server (chunked reply).
	NetEvents:Subscribe('MapEditorClient:PartitionDataBegin', self, self.OnPartitionDataBegin)
	NetEvents:Subscribe('MapEditorClient:PartitionDataChunk', self, self.OnPartitionDataChunk)
	NetEvents:Subscribe('MapEditorClient:PartitionDataEnd', self, self.OnPartitionDataEnd)
	NetEvents:Subscribe('MapEditorClient:PartitionDataError', self, self.OnPartitionDataError)
end

--- WebUI asked for a partition. Forward the raw JSON request straight to the server.
---@param p_RequestJson string JSON string { requestId, guid, name }
function PartitionInspector:OnRequestPartitionData(p_RequestJson)
	if type(p_RequestJson) ~= "string" then
		m_Logger:Error("RequestPartitionData expected a JSON string")
		return
	end

	m_Logger:Write("Forwarding partition request to server")
	NetEvents:SendLocal('MapEditor:RequestPartitionData', p_RequestJson)
end

--- Server begins streaming a partition.
function PartitionInspector:OnPartitionDataBegin(p_Info)
	if p_Info == nil or p_Info.requestId == nil then
		return
	end

	self.m_Incoming[p_Info.requestId] = {
		chunks = {},
		expected = p_Info.chunks or 0,
	}
end

--- One chunk of the JSON string.
function PartitionInspector:OnPartitionDataChunk(p_Chunk)
	if p_Chunk == nil or p_Chunk.requestId == nil then
		return
	end

	local s_Entry = self.m_Incoming[p_Chunk.requestId]
	if s_Entry == nil then
		-- Late/duplicate begin missing; start a fresh buffer.
		s_Entry = { chunks = {}, expected = 0 }
		self.m_Incoming[p_Chunk.requestId] = s_Entry
	end

	if p_Chunk.index ~= nil and p_Chunk.data ~= nil then
		s_Entry.chunks[p_Chunk.index] = p_Chunk.data
	end
end

--- Server finished streaming: reassemble and deliver to the WebUI.
function PartitionInspector:OnPartitionDataEnd(p_Info)
	if p_Info == nil or p_Info.requestId == nil then
		return
	end

	local s_RequestId = p_Info.requestId
	local s_Entry = self.m_Incoming[s_RequestId]
	self.m_Incoming[s_RequestId] = nil

	if s_Entry == nil then
		return
	end

	-- Concatenate chunks in index order.
	local s_Parts = {}
	local s_Max = s_Entry.expected

	if s_Max == nil or s_Max <= 0 then
		for k in pairs(s_Entry.chunks) do
			if k > (s_Max or 0) then s_Max = k end
		end
	end

	for i = 1, (s_Max or 0) do
		s_Parts[#s_Parts + 1] = s_Entry.chunks[i] or ""
	end

	local s_Json = table.concat(s_Parts)

	-- Hand the raw JSON string to the WebUI. json.encode wraps it into a safe, fully-escaped
	-- JS string literal; the WebUI does JSON.parse(...) on it.
	local s_JsLiteral = json.encode(s_Json)
	WebUI:ExecuteJS(string.format(
		"if(window.__onPartitionData){window.__onPartitionData(%s,%s);}",
		tostring(tonumber(s_RequestId) or 0),
		s_JsLiteral
	))
end

--- Server could not serve the partition.
function PartitionInspector:OnPartitionDataError(p_Info)
	if p_Info == nil or p_Info.requestId == nil then
		return
	end

	self.m_Incoming[p_Info.requestId] = nil

	local s_Message = json.encode(tostring(p_Info.message or "unknown error"))
	WebUI:ExecuteJS(string.format(
		"if(window.__onPartitionError){window.__onPartitionError(%s,%s);}",
		tostring(tonumber(p_Info.requestId) or 0),
		s_Message
	))
end

PartitionInspector = PartitionInspector()

return PartitionInspector
