---@class RawWriteProbe
---Field-safety probe. Writes ONE field of a vehicle blueprint on BOTH realms, with none of the
---editor's machinery involved -- no GameObject, no clone, no overrides -- so a spawn afterwards
---tests the WRITE and nothing else.
---
---Why it exists: modifying `vehicleConfig.gravityModifier` on both realms and then spawning another
---vehicle is safe, while modifying `object.exitDirectionSpeedThreshold` the same way kills the
---client. Both are Float32 on the same blueprint. Until we know which fields are safe, "live editing
---crashes" is unactionable; with a list it becomes a rule the editor can enforce.
---
---Both realms must write, always: MapEditor spawns on both, and one-sided data is itself fatal
---(docs/vehicle-edit-crash.md). The client half also reports its result to the server, because
---client Lua output reaches no log readable from the host.
class 'RawWriteProbe'

local m_Logger = Logger('RawWriteProbe', true)

function RawWriteProbe:__init()
	if SharedUtils:IsClientModule() then
		Events:Subscribe('MapEditor:RawWrite', self, self.OnClientRequest)
	else
		NetEvents:Subscribe('MapEditor:RawWriteServer', self, self.OnServerRequest)
		NetEvents:Subscribe('MapEditor:RawWriteReport', self, self.OnClientReport)
	end
end

---Split "components.1.vehicleConfig.gravityModifier" into its segments.
local function Segments(p_Path)
	local s_Out = {}

	for l_Part in tostring(p_Path):gmatch('[^%.]+') do
		s_Out[#s_Out + 1] = l_Part
	end

	return s_Out
end

---Walk `blueprint.object` down `p_Path` and set the final field to `p_Value`.
---
---Every container on the way is made writable, which is what the editor's own SetField does. Array
---segments are numeric and 1-BASED, matching how the engine names elements.
local function WritePath(p_Blueprint, p_Path, p_Value)
	local s_Root = _G[p_Blueprint.typeInfo.name](p_Blueprint)
	s_Root:MakeWritable()

	local s_Node = _G[s_Root.object.typeInfo.name](s_Root.object)
	s_Node:MakeWritable()

	local s_Parts = Segments(p_Path)
	local i = 1

	-- Walk to the container holding the final field. An ARRAY segment is a field name followed by a
	-- 1-based index ("components", "1"), and the array itself must be indexed, never cast -- casting
	-- it threw "attempt to index a nil value (field 'typeInfo')", the write silently failed, and the
	-- run then reported the field SAFE on the strength of a write that never happened.
	while i <= #s_Parts - 1 do
		local l_Key = s_Parts[i]
		local l_Index = tonumber(s_Parts[i + 1])
		local l_Child

		if l_Index ~= nil then
			local l_Array = s_Node[l_Key]

			if l_Array == nil then
				error('no array "' .. l_Key .. '"')
			end

			l_Child = l_Array[l_Index]
			i = i + 2
		else
			l_Child = s_Node[l_Key]
			i = i + 1
		end

		if l_Child == nil then
			error('path stops at "' .. l_Key .. '"')
		end

		s_Node = _G[l_Child.typeInfo.name](l_Child)
		s_Node:MakeWritable()
	end

	local s_Field = s_Parts[#s_Parts]
	local s_Before = s_Node[s_Field]

	if s_Before == nil then
		error('no field "' .. s_Field .. '" at the end of the path')
	end

	s_Node[s_Field] = p_Value

	return s_Before, s_Node[s_Field]
end

---payload: "<blueprint>|<path>|<value>"
local function Parse(p_Payload)
	local s_Text = tostring(p_Payload):gsub('^"(.*)"$', '%1')
	local s_Bp, s_Path, s_Value = s_Text:match('^([^|]+)|([^|]+)|([^|]+)$')

	return s_Bp, s_Path, tonumber(s_Value)
end

function RawWriteProbe:OnClientRequest(p_Payload)
	-- This realm writes too, then asks the server to do the same.
	self:Write(p_Payload, true)
	NetEvents:SendLocal('MapEditor:RawWriteServer', tostring(p_Payload))
end

function RawWriteProbe:OnServerRequest(p_Player, p_Payload)
	self:Write(p_Payload, false)
end

function RawWriteProbe:OnClientReport(p_Player, p_Text)
	m_Logger:Warning('RAWWRITE ' .. tostring(p_Text))
end

function RawWriteProbe:Write(p_Payload, p_IsClient)
	local s_BpName, s_Path, s_Value = Parse(p_Payload)

	if s_BpName == nil or s_Path == nil or s_Value == nil then
		m_Logger:Warning('RAWWRITE bad payload: ' .. tostring(p_Payload))
		return
	end

	local s_Bp = ResourceManager:SearchForDataContainer(s_BpName)

	if s_Bp == nil then
		m_Logger:Warning('RAWWRITE blueprint not resident: ' .. s_BpName)
		return
	end

	local s_Ok, s_Before, s_After = pcall(WritePath, s_Bp, s_Path, s_Value)
	local s_Text = (p_IsClient and 'CLIENT' or 'SERVER') .. ' ' .. s_Path ..
		' ok=' .. tostring(s_Ok) ..
		(s_Ok and (' ' .. tostring(s_Before) .. ' -> ' .. tostring(s_After))
		      or (' err=' .. tostring(s_Before)))

	if p_IsClient then
		NetEvents:SendLocal('MapEditor:RawWriteReport', s_Text)
		-- Publish to the WebUI as well: the test must be able to verify the write LANDED. Judging a
		-- field on a write that silently failed is how this reported a fatal field as SAFE.
		WebUI:ExecuteJS('window.__rawWrite = ' .. json.encode({
			ok = s_Ok,
			path = s_Path,
			before = tostring(s_Before),
			after = tostring(s_After),
		}) .. ';')
	else
		m_Logger:Warning('RAWWRITE ' .. s_Text)
	end
end

RawWriteProbe = RawWriteProbe()
