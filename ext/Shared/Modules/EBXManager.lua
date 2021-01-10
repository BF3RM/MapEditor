class 'EBXManager'

local m_Logger = Logger("EBXManager", true)

function EBXManager:__init(p_Realm)
	m_Logger:Write("Initializing EBXManager: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
	self:RegisterVars()
end

function EBXManager:RegisterVars()
	self.m_ClonedInstances = {}
end

function EBXManager:OnLevelDestroy()
	self:RegisterVars()
end
function EBXManager:CloneBlueprint(p_BlueprintCtrRef, p_Guid)
	print("Cloning blueprint: " .. tostring(p_BlueprintCtrRef.instanceGuid))
	local s_BP = p_BlueprintCtrRef:Get()
	local s_BPPartition = ResourceManager:FindDatabasePartition(Guid(p_BlueprintCtrRef.partitionGuid))
	print(p_BlueprintCtrRef.partitionGuid)
	print(p_Guid)
	print(tostring(s_BP))
	local s_ClonedBlueprint = s_BP:Clone(Guid(p_Guid))
	s_BPPartition:AddInstance(s_ClonedBlueprint)
	InstanceParser:SetPartition(p_BlueprintCtrRef.partitionGuid, p_Guid)
	m_Logger:Write(p_BlueprintCtrRef.partitionGuid)
	m_Logger:Write(p_Guid)
	m_Logger:Write("Blueprint cloned:")
	m_Logger:Write(s_ClonedBlueprint)
	return s_ClonedBlueprint, CtrRef {
		typeName = s_ClonedBlueprint.typeInfo.name,
		instanceGuid = tostring(p_Guid),
		partitionGuid = p_BlueprintCtrRef.partitionGuid
	}
end
function EBXManager:SetFields(p_Overrides)
	print("SetFields Notimplemented")
	--for _,v in pairs(p_Overrides) do
	--	m_Logger:Write(_)
	--	m_Logger:Write(v)
	--	self:SetField(v.field, v.reference, v.type, v.value)
	--end
end
function EBXManager:PatchLinks(p_Blueprint, p_OldInstance, p_NewInstance)
	local connectionTypes = {
		propertyConnections,
		linkConnections,
		eventConnections
	}
	for k, connectionType in pairs(connectionTypes) do
		for k,connection in pairs(p_Blueprint[connectionType]) do
			if(connection.source == p_OldInstance) then
				print("Replaced " .. connectionType)
				connection.source = p_NewInstance
			end
			if(connection.target == p_OldInstance) then
				print("Replaced " .. connectionType)
				connection.target = p_NewInstance
			end
		end
	end
end
function EBXManager:SetField(p_Instance, p_Field, p_Path, p_RootGuid, p_Partition, p_RequiresRespawn)
	m_Logger:Write(p_Path .. "/" .. p_Field.field)
	if(p_Instance) then
		if(p_Instance.typeInfo ~= nil) then
			p_Instance = _G[p_Instance.typeInfo.name](p_Instance)
		end
		if(isPrintable(p_Field.type)) then -- Set value directly
			print("Set " .. p_Field.field .. " to " .. tostring(p_Field.value))
			p_Instance[p_Field.field] = ParseType(p_Field.type, p_Field.value)
			return p_Path .. '.' .. p_Field.field, p_RequiresRespawn
		else
			if (p_Instance[p_Field.field] and p_Instance[p_Field.field].instanceGuid) then
				if(self.m_ClonedInstances[tostring(p_RootGuid)] == nil) then
					self.m_ClonedInstances[tostring(p_RootGuid)] = {}
				end
				if(self.m_ClonedInstances[tostring(p_RootGuid)][tostring(p_Instance.instanceGuid)] == nil) then
					local s_ClonedInstance = _G[p_Instance[p_Field.field].typeInfo.name](p_Instance[p_Field.field]:Clone(GenerateGuid()));
					m_Logger:Write("Cloning:")
					m_Logger:Write("From: " .. tostring(p_Instance[p_Field.field].instanceGuid))
					m_Logger:Write("To: " .. tostring(s_ClonedInstance.instanceGuid))
					self.m_ClonedInstances[tostring(p_RootGuid)][tostring(p_Instance.instanceGuid)] = s_ClonedInstance
					p_Instance[p_Field.field] = s_ClonedInstance
					p_RequiresRespawn = true -- We changed a reference, enabling and disabling is no longer enough.
					if (p_Partition) then
						print(p_Partition.guid)
						InstanceParser:SetPartition(p_Partition.guid, s_ClonedInstance.instanceGuid)
						p_Partition:AddInstance(s_ClonedInstance)
					else
						print("Missing partition")
					end
				else
					print("Instance already cloned.")
				end
			end
			local s_TypeInfo = p_Instance.typeInfo
			if(s_TypeInfo) then
				if(s_TypeInfo.array) then -- Go to the array index
					print("Stepped into array")
					return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path + '.' + p_Field.field, p_RootGuid, p_Partition, p_RequiresRespawn)
				elseif(s_TypeInfo.enum) then
					print("Set enum: " .. p_Field.value)
					p_Instance[p_Field.field] = number(p_Field.value)
					return p_Path .. '.' .. p_Field.field
				else
					print("Stepping into reference")
					return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field, p_RootGuid, p_Partition, p_RequiresRespawn)
				end
				-- Instance?
			else-- It's not a primitive value, it's not an array, it doesn't have typeInfo, so it's a struct.?
				print("Stepping intos struct")
				return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field, p_RootGuid, p_Partition, p_RequiresRespawn)
			end
		end
	else
		m_Logger:Error("No instance passed: " .. p_Field.field)
	end
end

function ParseType(p_Type, p_Val)
	--m_Logger:Write(p_Type)
	--m_Logger:Write(p_Val)
	if(p_Type == "Boolean") then
		if(p_Val == "true") then
			return true
		else
			return false
		end
	end
	if(p_Type == "Single" or
	p_Type == "Int32" or
	p_Type == "UInt32" or
	p_Type == "Int16" or
	p_Type == "UInt16" or
	p_Type == "SByte" ) then
		return tonumber(p_Val)
	end
	if(p_Type == "Vec2") then -- Vec2
		return Vec4(tonumber(p_Val.x), tonumber(p_Val.y))
	end
	if(p_Type == "Vec3") then -- Vec3
		return Vec3(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z))
	end
	if(p_Type == "Vec4") then -- Vec3
		return Vec4(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z), tonumber(p_Val.w))
	end
	if(p_Type == "Enum") then -- Enum
		return tonumber(p_Val)  -- Value
	end
	if(p_Type == "String") then -- Enum
		return p_Val  -- Value
	end
end
return EBXManager()
