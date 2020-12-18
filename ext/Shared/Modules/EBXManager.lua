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
function EBXManager:SetField(p_GameObjectGuid, p_GameObjectTransferData)
	local s_GameObject = GameObjectManager:GetGameObject(p_GameObjectGuid)
	if(not s_GameObject) then
		m_Logger:Warning('Could not find GameObject: ' .. p_GameObjectGuid)
		return nil, ActionResultType.Failure
	end
	local s_InstanceGuid = p_GameObjectTransferData.overrides[1].reference.instanceGuid;
	local s_Instance = ResourceManager:FindInstanceByGuid(Guid(p_GameObjectTransferData.overrides[1].reference.partitionGuid), Guid(s_InstanceGuid))
	if(not s_Instance) then
		--print("This shit fucked y'all:")
		--print(p_GameObjectTransferData.reference.partitionGuid)
		--print(p_GameObjectTransferData.reference.instanceGuid)
		return nil, ActionResultType.Failure
	end
	--print(p_GameObjectTransferData)
	s_Instance = _G[s_Instance.typeInfo.name](s_Instance)
	for _, l_Override in pairs(p_GameObjectTransferData.overrides) do
		if (l_Override.reference.instanceGuid ~= s_InstanceGuid) then
			s_Instance = ResourceManager:FindInstanceByGuid(Guid(l_Override.reference.partitionGuid), Guid(l_Override.reference.instanceGuid))
		end
		if(s_Instance.isReadOnly) then
			s_Instance:MakeWritable()
		end
		--print('Original value:')
		--print(s_Instance[l_Override.field] )
		local s_Value = ParseType(l_Override.type, l_Override.value)
		--print(s_Value)
		s_Instance[l_Override.field] = s_Value
		--print("Changed value: ")
		--print(l_Override.value)
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
