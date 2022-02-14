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
					return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path + '.' + p_Field.field)
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

function ParseType(p_Type, p_Val)
	--m_Logger:Write(p_Type)
	--m_Logger:Write(p_Val)

	if p_Type == "Boolean" then
		if p_Val == "true" then
			return true
		else
			return false
		end
	end

	if p_Type == "Single" or
	p_Type == "Int32" or
	p_Type == "UInt32" or
	p_Type == "Int16" or
	p_Type == "UInt16" or
	p_Type == "SByte" then
		return tonumber(p_Val)
	end

	if p_Type == "Vec2" then -- Vec2
		return Vec4(tonumber(p_Val.x), tonumber(p_Val.y))
	end

	if p_Type == "Vec3" then -- Vec3
		return Vec3(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z))
	end

	if p_Type == "Vec4" then -- Vec3
		return Vec4(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z), tonumber(p_Val.w))
	end

	if p_Type == "Enum" then -- Enum
		return tonumber(p_Val) -- Value
	end

	if p_Type == "String" then -- Enum
		return p_Val -- Value
	end
end

return EBXManager()
