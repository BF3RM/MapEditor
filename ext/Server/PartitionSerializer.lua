---@class PartitionSerializer
--- Server-side EBX partition serializer.
---
--- Walks a loaded Frostbite DatabasePartition via the VEXT reflection API (TypeInfo / FieldInformation)
--- and produces the exact JSON shape the WebUI inspector expects (see WebUI/src/script/types/ebx/*.ts).
--- This replaces the static webx dependency (https://webx.powback.com/Games/Venice/<name>.json) with
--- live data from the running game.
---
--- Target shape (identical to webx):
---   { "$guid", "$name", "$primaryInstance",
---     "$instances": [ { "$guid", "$type", "$baseClass", "$fields": { "<Field>": <field>, ... } } ] }
--- where <field> is one of:
---   primitive : { "$type": "Single", "$value": 1.0 }
---   struct    : { "$type": "SomeStruct", "$value": { "<SubField>": <field>, ... } }
---   vec3      : { "$type": "Vec3", "$value": { "x": <field>, "y": <field>, "z": <field> } }
---   transform : { "$type": "LinearTransform", "$value": { "right": <vec3 field>, "up", "forward", "trans" } }
---   enum      : { "$type": "EnumName", "$enum": true, "$value": 3, "$enumValue": "Name" }
---   reference : { "$type": "DcType", "$ref": true, "$value": { "$instanceGuid", "$partitionGuid" } } | null
---   array     : { "$type": "<elementType>", "$array": true, "$value": [ ... ] }
---
--- Reflection helpers getFields(), isPrintable(), firstToLower() are globals from
--- __shared/Util/DataContainerExt (loaded on both realms).
PartitionSerializer = class 'PartitionSerializer'

local m_Logger = Logger("PartitionSerializer", false)

-- Cap struct recursion so a malformed / self-similar struct can never loop forever.
-- References (DataContainers) are NEVER recursed (emitted as pointers), so real EBX depth is small.
local MAX_DEPTH = 24

-- Serialized JSON is streamed to the requesting client in fixed-size string chunks. A single NetEvent
-- with a whole partition string can exceed the reliable-channel size limit (same lesson as LevelInjector).
local CHUNK_SIZE = 8000
-- Chunk-messages flushed per Engine:Update tick, so a big partition never hitches the server.
local MSGS_PER_TICK = 10

function PartitionSerializer:__init()
	m_Logger:Write("Initializing PartitionSerializer")
	-- partitionGuidLower -> DatabasePartition (the live engine object)
	self.m_Partitions = {}
	-- outgoing chunk send-queue { player, msgs = {...}, idx }
	self.m_SendQueue = nil
	self:RegisterEvents()
end

function PartitionSerializer:RegisterEvents()
	-- Cache every partition as it loads so we can serialize it on demand later.
	Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
	Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)

	-- WebUI (via client Lua) asks for a partition's live data.
	-- Payload: a JSON string { requestId, guid, name }.
	NetEvents:Subscribe('MapEditor:RequestPartitionData', self, self.OnRequestPartitionData)
end

---@param p_Partition DatabasePartition
function PartitionSerializer:OnPartitionLoaded(p_Partition)
	if p_Partition == nil or p_Partition.guid == nil then
		return
	end

	self.m_Partitions[tostring(p_Partition.guid):lower()] = p_Partition
end

function PartitionSerializer:OnLevelDestroy()
	-- Drop cached partition handles; they belong to the old level.
	self.m_Partitions = {}
	self.m_SendQueue = nil
end

--============================ Public API ============================--

--- Serialize a partition to the WebUI EBX table. Returns nil on failure.
---@param p_GuidOrName string partition GUID (preferred) or the name the caller knows
---@param p_Name string|nil optional display name to echo into "$name"
---@return table|nil
function PartitionSerializer:SerializePartition(p_GuidOrName, p_Name)
	local s_Partition = self:_ResolvePartition(p_GuidOrName)

	if s_Partition == nil then
		m_Logger:Error("Partition not found / not loaded: " .. tostring(p_GuidOrName))
		return nil
	end

	local s_Result = {
		["$guid"] = tostring(s_Partition.guid),
		["$name"] = p_Name or self:_PartitionName(s_Partition, p_GuidOrName),
		["$primaryInstance"] = "",
		["$instances"] = {},
	}

	local s_Ok, s_Primary = pcall(function() return s_Partition.primaryInstance end)
	if s_Ok and s_Primary ~= nil and s_Primary.instanceGuid ~= nil then
		s_Result["$primaryInstance"] = tostring(s_Primary.instanceGuid)
	end

	local s_InstancesOk, s_Instances = pcall(function() return s_Partition.instances end)
	if not s_InstancesOk or s_Instances == nil then
		m_Logger:Error("Failed to read partition.instances for " .. tostring(p_GuidOrName))
		return s_Result
	end

	for _, l_Instance in ipairs(s_Instances) do
		local s_InstOk, s_InstTable = pcall(function() return self:_SerializeInstance(l_Instance) end)

		if s_InstOk and s_InstTable ~= nil then
			table.insert(s_Result["$instances"], s_InstTable)
		elseif not s_InstOk then
			m_Logger:Write("Skipped an instance (serialize error): " .. tostring(s_InstTable))
		end
	end

	return s_Result
end

--============================ Runtime clone subtree ============================--

local ZERO_GUID = "00000000-0000-0000-0000-000000000000"

--- True when a DataContainer is a RUNTIME object rather than a member of a loaded partition.
---
--- The per-instance blueprint clones (GameObject:SetOverrides -> DeepClone) are created at runtime
--- and belong to no partition, which is exactly what makes them un-bakeable today: they exist only
--- in this process. That also makes them easy to tell apart from the stock content they reference —
--- a clone's own members have no partition guid, while everything it points at that came with the
--- game still does, and must stay an external reference rather than being copied into our bundle.
---@param p_Dc DataContainer
---@return boolean
function PartitionSerializer:_IsRuntimeDc(p_Dc)
	if p_Dc == nil then
		return false
	end

	local s_PartitionGuid = nil
	pcall(function() s_PartitionGuid = p_Dc.partitionGuid end)

	if s_PartitionGuid == nil then
		return true
	end

	local s_Str = tostring(s_PartitionGuid)

	return s_Str == "" or s_Str == ZERO_GUID
end

--- Collect every runtime DataContainer reachable from p_Root (inclusive), following only fields
--- that are themselves runtime — references into real partitions are endpoints, not edges.
---@param p_Root DataContainer
---@return table[] list of DataContainers, root first
function PartitionSerializer:_CollectRuntimeSubtree(p_Root)
	local s_Collected = {}
	local s_Seen = {}
	local s_Queue = { p_Root }

	while #s_Queue > 0 do
		local s_Dc = table.remove(s_Queue, 1)
		local s_Guid = nil
		pcall(function() s_Guid = tostring(s_Dc.instanceGuid) end)

		if s_Guid ~= nil and not s_Seen[s_Guid] then
			s_Seen[s_Guid] = true
			s_Collected[#s_Collected + 1] = s_Dc

			for _, l_Child in ipairs(self:_ChildDataContainers(s_Dc)) do
				if self:_IsRuntimeDc(l_Child) then
					s_Queue[#s_Queue + 1] = l_Child
				end
			end
		end
	end

	return s_Collected
end

--- Every DataContainer referenced by p_Dc's fields, INCLUDING ones reachable only through inline
--- structs. Mirrors the recursion in _SerializeFields: that walk descends into structs, so a walk
--- that only looked at top-level fields would miss containers the serialized output still
--- references — dangling pointers in the emitted partition (observed: 5 of 371 refs on a real
--- WallLamp clone).
---@param p_Dc DataContainer
---@return table[]
function PartitionSerializer:_ChildDataContainers(p_Dc)
	local s_Children = {}
	self:_CollectFieldDataContainers(p_Dc, s_Children, 0)
	return s_Children
end

--- Append every DataContainer referenced by p_Value's fields into p_Out, recursing through inline
--- structs but NEVER through DataContainers (those are the graph edges the caller follows itself).
---@param p_Value table instance or inline struct
---@param p_Out table[] accumulator
---@param p_Depth number
function PartitionSerializer:_CollectFieldDataContainers(p_Value, p_Out, p_Depth)
	if p_Value == nil or p_Depth > MAX_DEPTH then
		return
	end

	local s_TypeInfo = nil
	pcall(function() s_TypeInfo = p_Value.typeInfo end)

	if s_TypeInfo == nil then
		return
	end

	local s_Casted = p_Value
	pcall(function() s_Casted = _G[s_TypeInfo.name](p_Value) end)

	for _, l_Field in ipairs(getFields(s_TypeInfo)) do
		if l_Field.typeInfo == nil or l_Field.typeInfo.enum or isPrintable(l_Field.typeInfo.name) then
			goto continue
		end

		local s_Ok, s_FieldValue = pcall(function() return s_Casted[firstToLower(l_Field.name)] end)

		if not s_Ok or s_FieldValue == nil then
			goto continue
		end

		if l_Field.typeInfo.array then
			local s_Len = 0
			pcall(function() s_Len = #s_FieldValue end)

			for i = 1, s_Len do
				local s_Member = nil
				pcall(function() s_Member = s_FieldValue[i] end)

				if s_Member ~= nil then
					self:_TakeDataContainerOrRecurse(s_Member, p_Out, p_Depth)
				end
			end
		else
			self:_TakeDataContainerOrRecurse(s_FieldValue, p_Out, p_Depth)
		end

		::continue::
	end
end

--- A DataContainer is an edge (collect it, stop); anything else with fields is an inline struct
--- whose own fields may still reference containers (descend).
function PartitionSerializer:_TakeDataContainerOrRecurse(p_Value, p_Out, p_Depth)
	local s_IsDc = false
	pcall(function() s_IsDc = (p_Value.instanceGuid ~= nil) end)

	if s_IsDc then
		p_Out[#p_Out + 1] = p_Value
		return
	end

	self:_CollectFieldDataContainers(p_Value, p_Out, p_Depth + 1)
end

--- Partition guid of a referenced container, as a string. A runtime container (a clone member)
--- has none, and tostring(nil) would put the literal text "nil" in the JSON — emit the zero guid
--- instead, which is what "belongs to no partition" means everywhere else in this file.
---@param p_Value DataContainer
---@return string
function PartitionSerializer:_RefPartitionGuid(p_Value)
	local s_Guid = nil
	pcall(function() s_Guid = p_Value.partitionGuid end)

	if s_Guid == nil then
		return ZERO_GUID
	end

	local s_Str = tostring(s_Guid)

	if s_Str == "" or s_Str == "nil" then
		return ZERO_GUID
	end

	return s_Str
end

--- Serialize a runtime clone (and its runtime members) as a standalone partition table, in the
--- same shape SerializePartition produces. This is what makes a per-instance EBX override
--- bakeable: the level generator can compile it as a real partition and point the object's
--- ReferenceObjectData at it instead of the stock blueprint (GH #396).
---@param p_Root DataContainer the cloned blueprint
---@param p_Name string partition name to embed
---@return table|nil
function PartitionSerializer:SerializeCloneSubtree(p_Root, p_Name)
	if p_Root == nil then
		return nil
	end

	local s_RootGuid = nil
	pcall(function() s_RootGuid = tostring(p_Root.instanceGuid) end)

	if s_RootGuid == nil then
		m_Logger:Error("SerializeCloneSubtree: root has no instanceGuid")
		return nil
	end

	local s_Members = self:_CollectRuntimeSubtree(p_Root)

	local s_Result = {
		["$guid"] = s_RootGuid, -- the generator remaps this to a fresh partition guid
		["$name"] = p_Name or ("CustomBlueprints/" .. s_RootGuid),
		["$primaryInstance"] = s_RootGuid,
		["$instances"] = {},
	}

	for _, l_Dc in ipairs(s_Members) do
		local s_Ok, s_Table = pcall(function() return self:_SerializeInstance(l_Dc) end)

		if s_Ok and s_Table ~= nil then
			table.insert(s_Result["$instances"], s_Table)
		elseif not s_Ok then
			m_Logger:Write("SerializeCloneSubtree: skipped a member: " .. tostring(s_Table))
		end
	end

	return s_Result
end

--============================ Instance / field walking ============================--

---@param p_Instance Instance|DataContainer
---@return table|nil
function PartitionSerializer:_SerializeInstance(p_Instance)
	if p_Instance == nil or p_Instance.typeInfo == nil then
		return nil
	end

	local s_TypeInfo = p_Instance.typeInfo
	local s_Casted = _G[s_TypeInfo.name](p_Instance)

	local s_BaseClass = "DataContainer"
	if s_TypeInfo.super ~= nil and s_TypeInfo.super.name ~= nil then
		s_BaseClass = s_TypeInfo.super.name
	end

	return {
		["$guid"] = tostring(p_Instance.instanceGuid),
		["$type"] = s_TypeInfo.name,
		["$baseClass"] = s_BaseClass,
		["$fields"] = self:_SerializeFields(s_Casted, s_TypeInfo, 0),
	}
end

--- Build the { FieldName = <field> } map for an instance or struct.
---@param p_Casted table casted instance/struct
---@param p_TypeInfo TypeInfo
---@param p_Depth number
---@return table
function PartitionSerializer:_SerializeFields(p_Casted, p_TypeInfo, p_Depth)
	local s_Fields = {}

	if p_Depth > MAX_DEPTH or p_TypeInfo == nil then
		return s_Fields
	end

	-- Skip container types known to crash on field reads (mirrors DataContainerExt guards).
	local s_LowerName = tostring(p_TypeInfo.name):lower()
	if string.match(s_LowerName, "voice") or string.match(s_LowerName, "sound") then
		return s_Fields
	end

	for _, l_Field in ipairs(getFields(p_TypeInfo)) do
		if l_Field.typeInfo == nil or l_Field.name == "MaterialPairs" then
			goto continue
		end

		local s_MemberName = firstToLower(l_Field.name)

		local s_Ok, s_Value = pcall(function() return p_Casted[s_MemberName] end)
		if not s_Ok then
			s_Value = nil
		end

		local s_FieldOk, s_FieldTable = pcall(function()
			return self:_EncodeField(l_Field.typeInfo, s_Value, p_Depth)
		end)

		if s_FieldOk and s_FieldTable ~= nil then
			s_Fields[l_Field.name] = s_FieldTable
		else
			-- Emit a null reference placeholder so the field still appears in the inspector.
			s_Fields[l_Field.name] = { ["$type"] = l_Field.typeInfo.name, ["$ref"] = true }
		end

		::continue::
	end

	return s_Fields
end

--- Encode one field into its WebUI field table given the field's declared TypeInfo and raw value.
---@param p_TypeInfo TypeInfo declared field type
---@param p_Value any raw value read from the instance
---@param p_Depth number
---@return table
function PartitionSerializer:_EncodeField(p_TypeInfo, p_Value, p_Depth)
	-- Array ------------------------------------------------------------------
	if p_TypeInfo.array then
		return self:_EncodeArray(p_TypeInfo, p_Value, p_Depth)
	end

	-- Enum -------------------------------------------------------------------
	if p_TypeInfo.enum then
		local s_Field = { ["$type"] = p_TypeInfo.name, ["$enum"] = true }
		local s_Num = self:_ToNumber(p_Value)
		s_Field["$value"] = s_Num
		local s_EnumName = self:_ReverseEnum(p_TypeInfo.name, s_Num)
		if s_EnumName ~= nil then
			s_Field["$enumValue"] = s_EnumName
		end
		return s_Field
	end

	-- Primitive / known value struct (Vec2/3/4, LinearTransform, Guid, ...) ---
	if isPrintable(p_TypeInfo.name) then
		return {
			["$type"] = p_TypeInfo.name,
			["$value"] = self:_EncodePrimitive(p_TypeInfo.name, p_Value),
		}
	end

	-- nil object -> null reference ------------------------------------------
	if p_Value == nil then
		-- $value omitted == JSON null on the WebUI side (parseValue: !$value -> null).
		return { ["$type"] = p_TypeInfo.name, ["$ref"] = true }
	end

	-- DataContainer reference (has an instanceGuid) -> pointer, never inlined -
	local s_IsRef = false
	pcall(function() s_IsRef = (p_Value.instanceGuid ~= nil) end)

	if s_IsRef then
		return {
			["$type"] = p_TypeInfo.name,
			["$ref"] = true,
			["$value"] = {
				["$instanceGuid"] = tostring(p_Value.instanceGuid),
				["$partitionGuid"] = self:_RefPartitionGuid(p_Value),
			},
		}
	end

	-- Inline struct ----------------------------------------------------------
	local s_StructTypeInfo = p_TypeInfo
	pcall(function() s_StructTypeInfo = p_Value.typeInfo or p_TypeInfo end)

	local s_Casted = p_Value
	pcall(function() s_Casted = _G[s_StructTypeInfo.name](p_Value) end)

	return {
		["$type"] = p_TypeInfo.name,
		["$value"] = self:_SerializeFields(s_Casted, s_StructTypeInfo, p_Depth + 1),
	}
end

---@param p_TypeInfo TypeInfo array field type (has .elementType)
function PartitionSerializer:_EncodeArray(p_TypeInfo, p_Value, p_Depth)
	local s_ElementType = p_TypeInfo.elementType
	local s_Field = {
		["$type"] = s_ElementType ~= nil and s_ElementType.name or "DataContainer",
		["$array"] = true,
	}

	local s_Values = {}
	local s_IsRef = false

	if p_Value ~= nil and s_ElementType ~= nil then
		local s_Len = 0
		pcall(function() s_Len = #p_Value end)

		for i = 1, s_Len do
			local s_Member = nil
			pcall(function() s_Member = p_Value[i] end)

			if s_Member == nil then
				goto continue
			end

			if isPrintable(s_ElementType.name) then
				s_Values[#s_Values + 1] = self:_EncodePrimitive(s_ElementType.name, s_Member)
			elseif s_ElementType.enum then
				s_Values[#s_Values + 1] = self:_ToNumber(s_Member)
			else
				local s_MemberIsRef = false
				pcall(function() s_MemberIsRef = (s_Member.instanceGuid ~= nil) end)

				if s_MemberIsRef then
					s_IsRef = true
					s_Values[#s_Values + 1] = {
						["$instanceGuid"] = tostring(s_Member.instanceGuid),
						["$partitionGuid"] = self:_RefPartitionGuid(s_Member),
					}
				else
					-- Inline struct element: emit its field-map (parseValue wraps it back into a Field).
					local s_MemberType = s_ElementType
					pcall(function() s_MemberType = s_Member.typeInfo or s_ElementType end)
					local s_Casted = s_Member
					pcall(function() s_Casted = _G[s_MemberType.name](s_Member) end)
					s_Values[#s_Values + 1] = self:_SerializeFields(s_Casted, s_MemberType, p_Depth + 1)
				end
			end

			::continue::
		end
	end

	if s_IsRef then
		s_Field["$ref"] = true
	end

	s_Field["$value"] = s_Values
	return s_Field
end

--============================ Value helpers ============================--

--- Return the WebUI "$value" payload for a primitive/known-struct type.
--- Scalars -> raw number/bool/string. Vec* / LinearTransform -> nested field structs.
function PartitionSerializer:_EncodePrimitive(p_TypeName, p_Value)
	if p_TypeName == "Boolean" then
		return p_Value == true
	end

	if p_TypeName == "CString" then
		if p_Value == nil then return "" end
		return tostring(p_Value)
	end

	if p_TypeName == "Guid" then
		if p_Value == nil then return nil end
		return tostring(p_Value)
	end

	if p_TypeName == "Vec2" then
		return {
			x = self:_Scalar(p_Value, "x"),
			y = self:_Scalar(p_Value, "y"),
		}
	end

	if p_TypeName == "Vec3" then
		return {
			x = self:_Scalar(p_Value, "x"),
			y = self:_Scalar(p_Value, "y"),
			z = self:_Scalar(p_Value, "z"),
		}
	end

	if p_TypeName == "Vec4" then
		return {
			x = self:_Scalar(p_Value, "x"),
			y = self:_Scalar(p_Value, "y"),
			z = self:_Scalar(p_Value, "z"),
			w = self:_Scalar(p_Value, "w"),
		}
	end

	if p_TypeName == "LinearTransform" then
		-- WebUI LinearTransform.fromJSON reads .right/.up/.forward/.trans, each a Vec3 field.
		-- VEXT exposes the columns as .left/.up/.forward/.trans (right == left column).
		return {
			right = self:_Vec3Field(p_Value, "left"),
			up = self:_Vec3Field(p_Value, "up"),
			forward = self:_Vec3Field(p_Value, "forward"),
			trans = self:_Vec3Field(p_Value, "trans"),
		}
	end

	-- Numeric primitives (Single / Float* / Int* / Uint* / SByte, etc.)
	return self:_ToNumber(p_Value)
end

--- { "$type": "Single", "$value": <number> } for one component of a vector.
function PartitionSerializer:_Scalar(p_Vec, p_Component)
	local s_Val = 0
	pcall(function() s_Val = p_Vec[p_Component] end)
	return { ["$type"] = "Single", ["$value"] = self:_ToNumber(s_Val) }
end

--- { "$type": "Vec3", "$value": { x,y,z } } for one column of a LinearTransform.
function PartitionSerializer:_Vec3Field(p_Transform, p_Column)
	local s_Vec = nil
	pcall(function() s_Vec = p_Transform[p_Column] end)
	return {
		["$type"] = "Vec3",
		["$value"] = {
			x = self:_Scalar(s_Vec, "x"),
			y = self:_Scalar(s_Vec, "y"),
			z = self:_Scalar(s_Vec, "z"),
		},
	}
end

function PartitionSerializer:_ToNumber(p_Value)
	if type(p_Value) == "number" then
		return p_Value
	end
	local s_Num = tonumber(p_Value)
	if s_Num ~= nil then
		return s_Num
	end
	s_Num = tonumber(tostring(p_Value))
	return s_Num or 0
end

--- Best-effort enum value -> member name via the global enum table (e.g. _G["Realm"]).
function PartitionSerializer:_ReverseEnum(p_EnumType, p_Value)
	local s_Table = _G[p_EnumType]
	if type(s_Table) ~= "table" then
		return nil
	end

	for k, v in pairs(s_Table) do
		if v == p_Value and type(k) == "string" then
			return k
		end
	end

	return nil
end

--============================ Partition lookup ============================--

function PartitionSerializer:_ResolvePartition(p_GuidOrName)
	if p_GuidOrName == nil then
		return nil
	end

	-- Direct GUID hit (the WebUI sends FBPartition.guid).
	local s_ByGuid = self.m_Partitions[tostring(p_GuidOrName):lower()]
	if s_ByGuid ~= nil then
		return s_ByGuid
	end

	-- Fall back to a name match against the live partition name, if the engine exposes one.
	for _, l_Partition in pairs(self.m_Partitions) do
		local s_Name = nil
		pcall(function() s_Name = l_Partition.name end)
		if s_Name ~= nil and tostring(s_Name):lower() == tostring(p_GuidOrName):lower() then
			return l_Partition
		end
	end

	return nil
end

function PartitionSerializer:_PartitionName(p_Partition, p_Fallback)
	local s_Name = nil
	pcall(function() s_Name = p_Partition.name end)
	if s_Name ~= nil and s_Name ~= "" then
		return tostring(s_Name)
	end
	return tostring(p_Fallback)
end

--- Resolve a SINGLE referenced instance when its partition isn't in the Partition:Loaded cache
--- (lazy/streamed blueprint partitions). The reference carries the instance guid and the instance
--- is loaded in memory, so find it via ResourceManager (by partition+instance guid, else a global
--- search by instance guid) and serialize a one-instance partition keyed by that guid — enough for
--- the WebUI to resolve the reference (type + fields) instead of showing "not loaded".
---@param p_PartitionGuid string|nil
---@param p_InstanceGuid string
---@param p_Name string|nil
---@return table|nil
function PartitionSerializer:_SerializeInstanceFallback(p_PartitionGuid, p_InstanceGuid, p_Name)
	if p_InstanceGuid == nil then
		return nil
	end

	local s_Instance = nil

	-- SEPARATE pcalls: a throw in FindInstanceByGuid (e.g. the partition guid is bogus, which it is
	-- for a zero/imported reference) must not skip the global SearchForInstanceByGuid below.
	if p_PartitionGuid ~= nil and tostring(p_PartitionGuid) ~= tostring(p_InstanceGuid) then
		pcall(function()
			s_Instance = ResourceManager:FindInstanceByGuid(Guid(tostring(p_PartitionGuid)), Guid(tostring(p_InstanceGuid)))
		end)
	end
	if s_Instance == nil then
		pcall(function()
			s_Instance = ResourceManager:SearchForInstanceByGuid(Guid(tostring(p_InstanceGuid)))
		end)
	end

	if s_Instance == nil then
		m_Logger:Error("Instance fallback: couldn't resolve " .. tostring(p_PartitionGuid) .. "/" .. tostring(p_InstanceGuid))
		return nil
	end

	local s_Ok, s_InstTable = pcall(function() return self:_SerializeInstance(s_Instance) end)

	if not s_Ok or s_InstTable == nil then
		m_Logger:Error("Instance fallback: serialize failed for " .. tostring(p_InstanceGuid))
		return nil
	end

	return {
		["$guid"] = tostring(p_PartitionGuid or ""),
		["$name"] = p_Name or tostring(p_PartitionGuid or ""),
		["$primaryInstance"] = tostring(p_InstanceGuid),
		["$instances"] = { s_InstTable },
	}
end

--============================ Transport (NetEvent, chunked) ============================--

--- Client requested a partition. Payload is a JSON string { requestId, guid, name }.
---@param p_Player Player
---@param p_RequestJson string
function PartitionSerializer:OnRequestPartitionData(p_Player, p_RequestJson)
	local s_Ok, s_Request = pcall(function() return json.decode(p_RequestJson) end)

	if not s_Ok or type(s_Request) ~= "table" then
		m_Logger:Error("Bad partition request payload")
		return
	end

	local s_RequestId = s_Request.requestId
	local s_Key = s_Request.guid or s_Request.name

	m_Logger:Write("Partition requested: " .. tostring(s_Key) .. " (req " .. tostring(s_RequestId) .. ")")

	local s_Partition = self:SerializePartition(s_Key, s_Request.name)

	-- Fallback for references whose PARTITION isn't in the Partition:Loaded cache (blueprint
	-- partitions that loaded lazily or before we subscribed — e.g. VehicleSpawnReferenceObjectData
	-- blueprints). The reference still carries the target instance guid, and the instance IS loaded
	-- in memory, so resolve just that instance via ResourceManager and serialize a one-instance
	-- partition. Without this the WebUI showed those references as "not loaded" forever.
	if s_Partition == nil and s_Request.instance ~= nil then
		s_Partition = self:_SerializeInstanceFallback(s_Request.guid, s_Request.instance, s_Request.name)
	end

	if s_Partition == nil then
		NetEvents:SendToLocal("MapEditorClient:PartitionDataError", p_Player, {
			requestId = s_RequestId,
			message = "Partition not loaded on server: " .. tostring(s_Key),
		})
		return
	end

	local s_EncOk, s_Json = pcall(function() return json.encode(s_Partition) end)

	if not s_EncOk or s_Json == nil then
		NetEvents:SendToLocal("MapEditorClient:PartitionDataError", p_Player, {
			requestId = s_RequestId,
			message = "Failed to encode partition: " .. tostring(s_Key),
		})
		return
	end

	self:_QueueChunked(p_Player, s_RequestId, s_Json)
end

--- Split the JSON string into chunk-messages, flushed a few per frame (see OnEngineUpdate).
function PartitionSerializer:_QueueChunked(p_Player, p_RequestId, p_Json)
	local s_Total = #p_Json
	local s_Count = math.max(1, math.ceil(s_Total / CHUNK_SIZE))

	local s_Msgs = {}
	s_Msgs[#s_Msgs + 1] = {
		e = "MapEditorClient:PartitionDataBegin",
		p = { requestId = p_RequestId, chunks = s_Count },
	}

	local s_Index = 0
	for i = 1, s_Total, CHUNK_SIZE do
		s_Index = s_Index + 1
		s_Msgs[#s_Msgs + 1] = {
			e = "MapEditorClient:PartitionDataChunk",
			p = { requestId = p_RequestId, index = s_Index, data = string.sub(p_Json, i, i + CHUNK_SIZE - 1) },
		}
	end

	s_Msgs[#s_Msgs + 1] = {
		e = "MapEditorClient:PartitionDataEnd",
		p = { requestId = p_RequestId },
	}

	-- One request at a time is fine for the inspector; a new request replaces any in-flight queue.
	self.m_SendQueue = { player = p_Player, msgs = s_Msgs, idx = 1 }
end

function PartitionSerializer:OnEngineUpdate()
	local s_Q = self.m_SendQueue
	if s_Q == nil then
		return
	end

	local s_Sent = 0
	while s_Q.idx <= #s_Q.msgs and s_Sent < MSGS_PER_TICK do
		local s_M = s_Q.msgs[s_Q.idx]
		NetEvents:SendToLocal(s_M.e, s_Q.player, s_M.p)
		s_Q.idx = s_Q.idx + 1
		s_Sent = s_Sent + 1
	end

	if s_Q.idx > #s_Q.msgs then
		self.m_SendQueue = nil
	end
end

PartitionSerializer = PartitionSerializer()

return PartitionSerializer
