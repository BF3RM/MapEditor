class 'EBXManager'

local m_Logger = Logger("EBXManager", true)

function EBXManager:__init(p_Realm)
	m_Logger:Write("Initializing EBXManager: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
	self:RegisterVars()
end

function EBXManager:RegisterVars()
end

function EBXManager:OnLevelDestroy()
	self:RegisterVars()
end
function EBXManager:SetFields(p_Overrides)
	for _,v in pairs(p_Overrides) do
		self:SetField(v.field, v.reference, v.type, v.value)
	end
end

function EBXManager:SetField(p_Field, reference, p_Type, p_Value)
	local s_Instance = p_GameObject.originalRef:Get()
	if(s_Instance) then
		if(isPrintable(p_Type)) then
			local s_Value = ParseType(l_Override.type, l_Override.value)
			s_Instance[l_Override.field] = s_Value
		end
	end
end

function ParseType(p_Type, p_Val)
	--print(p_Type)
	--print(p_Val)
	local s_Type = p_Type
	local s_Val = p_Val
	if(s_Type == "Boolean") then
		if(s_Val == "true") then
			return true
		else
			return false
		end
	end
	if(s_Type == "Single" or
	s_Type == "Int32" or
	s_Type == "UInt32" or
	s_Type == "Int16" or
	s_Type == "UInt16" or
	s_Type == "SByte" ) then
		return tonumber(s_Val)
	end
	if(s_Type == "Vec2") then -- Vec2
		return Vec3(s_Val.x, s_Val.y)
	end
	if(s_Type == "Vec3") then -- Vec3
		return Vec3(s_Val.x, s_Val.y, s_Val.z)
	end
	if(s_Type == "Vec4") then -- Vec3
		return Vec3(s_Val.x, s_Val.y, s_Val.z, s_Val.w)
	end
	if(s_Type == "Enum") then -- Enum
		return tonumber(s_Val)  -- Value
	end
	if(s_Type == "String") then -- Enum
		return s_Val  -- Value
	end
end
return EBXManager()
