class 'ObjectManager'

function ObjectManager:__init(p_Realm)
	print("Initializing ObjectManager")
	self.m_Realm = p_Realm
	self:RegisterVars()
	self:RegisterEvents()
end

function ObjectManager:RegisterVars()
	self.m_SpawnedEntities = {}
	self.m_SpawnedOffsets = {}
	self.m_EntityInstanceIds = {}

    self.m_LastIndex = 1;
end

function ObjectManager:RegisterEvents()

end
function ObjectManager:GetEntityByGuid(p_Guid)
	if(self.m_SpawnedEntities[p_Guid] ~= nil) then
		return self.m_SpawnedEntities[p_Guid]
	else
		return false
	end
end
function ObjectManager:GetGuidFromInstanceID(p_InstanceID)
	return self.m_EntityInstanceIds[p_InstanceID]
end

function ObjectManager:Clear()
	self:RegisterVars()
end



function ObjectManager:SpawnBlueprint(p_Guid, p_PartitionGuid, p_InstanceGuid, p_LinearTransform, p_Variation)
	if p_PartitionGuid == nil or
			p_InstanceGuid == nil or
			p_LinearTransform == nil then
		print('One or more userData are nil')
		return false
	end

	if self.m_SpawnedEntities[p_Guid] ~= nil then
		print('Object with id ' .. p_Guid .. ' already existed as a spawned entity!')
		return false
	end

	p_Variation = p_Variation or 0

	local s_Blueprint = ResourceManager:FindInstanceByGUID(Guid(p_PartitionGuid), Guid(p_InstanceGuid))

	if s_Blueprint == nil then
		error('Couldn\'t find the specified instance')
		return false
	end

	local s_ObjectBlueprint = _G[s_Blueprint.typeInfo.name](s_Blueprint)

	print('Spawning blueprint: '.. s_ObjectBlueprint.name .. " | ".. s_Blueprint.typeInfo.name .. ", ID: " .. p_Guid .. ", Instance: " .. tostring(p_InstanceGuid) .. ", Variation: " .. p_Variation)

	local s_Params = EntityCreationParams()
	s_Params.transform = p_LinearTransform
	s_Params.variationNameHash = p_Variation
	s_Params.networked = s_ObjectBlueprint.needNetworkId

	local s_ObjectEntities = EntityManager:CreateEntitiesFromBlueprint(s_Blueprint, s_Params)
	if #s_ObjectEntities == 0 then
		print("Spawning failed")
		return false
	end
	local s_Spatial = {}
	local s_Offsets = {}

	for i, l_Entity in pairs(s_ObjectEntities) do
		l_Entity:Init(self.m_Realm, true)
		if(l_Entity:Is("SpatialEntity")) then
			s_Spatial[i] = SpatialEntity(l_Entity)
			s_Offsets[i] = ToLocal(SpatialEntity(l_Entity).transform, p_LinearTransform)
			-- Allows us to connect the entity to the GUID
			self.m_EntityInstanceIds[l_Entity.instanceID] = p_Guid
		end
	end


	self.m_SpawnedEntities[p_Guid] = s_Spatial
	self.m_SpawnedOffsets[p_Guid] = s_Offsets

	return s_Spatial
end

function ObjectManager:BlueprintSpawned(p_Hook, p_Guid, p_LinearTransform, p_Blueprint, p_Parent)
    if(p_LinearTransform == nil) then
        p_LinearTransform = LinearTransform()
    end
    if(self.m_SpawnedEntities[p_Guid] ~= nil) then
        print("Blueprint already spawned??")
        return false
    end
    local s_Spatial = {}
    local s_Offsets = {}

    local s_ObjectEntities = p_Hook:Call()
    print(#s_ObjectEntities)
    local s_ObjectCount = #s_ObjectEntities
    local index = 1;
    for i = self.m_LastIndex, s_ObjectCount do
        local l_Entity = s_ObjectEntities[i]
        print(i .. " | " .. l_Entity.typeInfo.name)
        if(l_Entity:Is("SpatialEntity") and
                l_Entity.typeInfo.name ~= "ClientWaterEntity" and
                l_Entity.typeInfo.name ~= "ServerWaterEntity" and
                l_Entity.typeInfo.name ~= "MeshProxyEntity") then
            --print(i .. " | " .. l_Entity.typeInfo.name .. " | " .. l_Entity.instanceID .. " | " ..tostring(p_Blueprint.instanceGuid) .. " | " .. tostring(p_Parent.instanceGuid))
            s_Spatial[#s_Spatial + 1] = SpatialEntity(l_Entity)
            s_Offsets[#s_Offsets + 1] = ToLocal(SpatialEntity(l_Entity).transform, p_LinearTransform)
            -- Allows us to connect the entity to the GUID
            self.m_EntityInstanceIds[l_Entity.instanceID] = p_Guid
        end
    end
    self.m_LastIndex = #s_ObjectEntities + 1
    self.m_SpawnedEntities[p_Guid] = s_Spatial
    self.m_SpawnedOffsets[p_Guid] = s_Offsets

    return s_Spatial
end

function ObjectManager:DestroyEntity(p_Guid)

	local s_Entities = self:GetEntityByGuid(p_Guid)

	if(s_Entities == false or #s_Entities == 0) then
		print(s_Entities)
		print("Failed to get entities")
		return false
	end

	self.m_SpawnedEntities[p_Guid] = nil;

	for i, entity in pairs(s_Entities) do
		if entity ~= nil then
			print(entity.typeInfo.name)
			entity:Destroy()
		end
	end
	return true
end

function ObjectManager:SetTransform(p_Guid, p_LinearTransform, p_UpdateCollision)
	if self.m_SpawnedEntities[p_Guid] == nil then
		print('Object with id ' .. p_Guid .. ' does not exist')
		return false
	end
	for i, l_Entity in pairs( self.m_SpawnedEntities[p_Guid]) do
		if(l_Entity == nil) then
			print("Entity is nil?")
			return false
		end

		if(not l_Entity:Is("SpatialEntity"))then
			print("not spatial")
			goto continue
		end

		local s_Entity = SpatialEntity(l_Entity)

		if s_Entity ~= nil then
			if(s_Entity.typeInfo.name == "ServerVehicleEntity") then
				s_Entity.transform = LinearTransform(p_LinearTransform)
			else
				local s_LocalTransform = self.m_SpawnedOffsets[p_Guid][i]
				s_Entity.transform = ToWorld(LinearTransform(p_LinearTransform), s_LocalTransform)

				if(p_UpdateCollision) then
					s_Entity:FireEvent("Disable")
					s_Entity:FireEvent("Enable")
				end
			end
		else
			print("entity is nil??")
		end
		::continue::
	end
	return true
end




return ObjectManager