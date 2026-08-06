---@class EBXManager
EBXManager = class 'EBXManager'

local m_Logger = Logger("EBXManager", false)

function EBXManager:__init(p_Realm)
	m_Logger:Write("Initializing EBXManager: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
end

function EBXManager:OnLevelDestroy()
end

function EBXManager:SetFields(p_Overrides)
	for _, v in pairs(p_Overrides) do
		m_Logger:Write(_)
		m_Logger:Write(v)
		self:SetField(v.field, v.reference, v.type)
	end
end

function EBXManager:SetField(p_Instance, p_Field, p_Path)
	m_Logger:Write(p_Path .. "/" .. p_Field.field)

	if p_Instance ~= nil then
		if p_Instance.instanceGuid ~= nil then
			p_Instance:MakeWritable()
			p_Instance = _G[p_Instance.typeInfo.name](p_Instance)
		end

		if isPrintable(p_Field.type) then -- Set value directly
			p_Instance[p_Field.field] = ParseType(p_Field.type, p_Field.value)
			return p_Path .. '.' .. p_Field.field
		else
			local s_TypeInfo = p_Instance.typeInfo

			if s_TypeInfo then
				if s_TypeInfo.array then -- Go to the array index
					return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field)
				elseif s_TypeInfo.enum then
					p_Instance[p_Field.field] = tonumber(p_Field.value)
					return p_Path .. '.' .. p_Field.field
				else
					return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field)
				end
			else-- It's not a primitive value and it's not an array, so it's either an instance or a struct. Either way, process that bitch.
				return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field)
			end
		end
	else
		m_Logger:Error("No instance passed: " .. p_Field.field)
	end
end

-- The LIVE serializer emits VEXT engine type-names (Float32/Uint32/Int64/CString/…)
-- while the old webx JSON used pipeline names (Single/Int32/UInt32/String). Handle BOTH:
-- otherwise ParseType returns nil for a modern type-name, and assigning nil to a typed
-- engine field throws ("expected number, received nil") — which aborted the whole edit
-- in GameObject:SetOverride before Disable/Enable, so nothing ever applied.
local s_NumericTypes = {
	Single = true, Double = true,
	Float8 = true, Float16 = true, Float32 = true, Float64 = true,
	Int8 = true, Int16 = true, Int32 = true, Int64 = true,
	Uint8 = true, Uint16 = true, Uint32 = true, Uint64 = true,
	UInt16 = true, UInt32 = true, UInt64 = true,
	SByte = true, Byte = true, Enum = true,
}
local s_StringTypes = { String = true, CString = true }

function ParseType(p_Type, p_Val)
	if p_Type == "Boolean" then
		return p_Val == true or p_Val == "true"
	end

	if s_NumericTypes[p_Type] then
		return tonumber(p_Val)
	end

	if s_StringTypes[p_Type] then
		return tostring(p_Val)
	end

	if p_Type == "Vec2" then
		return Vec2(tonumber(p_Val.x), tonumber(p_Val.y))
	end

	if p_Type == "Vec3" then
		return Vec3(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z))
	end

	if p_Type == "Vec4" then
		return Vec4(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z), tonumber(p_Val.w))
	end

	if p_Type == "Guid" then
		return Guid(tostring(p_Val))
	end

	-- Fallback: an unlisted enum/number spelling -> number; otherwise the raw value.
	-- NEVER return nil — assigning nil to a typed engine field throws and aborts the edit.
	local s_Number = tonumber(p_Val)
	if s_Number ~= nil then
		return s_Number
	end

	return p_Val
end

EBXManager = EBXManager()

return EBXManager
