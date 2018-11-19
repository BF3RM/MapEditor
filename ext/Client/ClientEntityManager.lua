class 'ClientEntityManager'

function ClientEntityManager:__init()
	print("Initializing ClientEntityManager")
	self:RegisterVars()
	self:RegisterEvents()
end

function ClientEntityManager:RegisterVars()
	self.m_SpawnedEntities = {}
end

function ClientEntityManager:RegisterEvents()

end
function ClientEntityManager:GetEntityByGuid(p_Guid)
	if(self.m_SpawnedEntities[p_Guid] ~= nil) then
		return self.m_SpawnedEntities[p_Guid]

	else
	   return false
	end
end
function ClientEntityManager:Clear()
	self.m_SpawnedEntities = {}
end



function ClientEntityManager:SpawnBlueprint(p_Guid, p_PartitionGuid, p_InstanceGuid, p_LinearTransform, p_Variation)
	if p_PartitionGuid == nil or
		 p_InstanceGuid == nil or
		 p_LinearTransform == nil then
		print('One or more parameters are nil')
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

	print('Blueprint type: ' .. s_Blueprint.typeInfo.name .. ", ID: " .. p_Guid .. ", Instance: " .. tostring(p_InstanceGuid))

	local s_Params = EntityCreationParams()
	s_Params.transform = p_LinearTransform
	s_Params.variationNameHash = p_Variation

	local s_ObjectEntities = EntityManager:CreateEntitiesFromBlueprint(s_Blueprint, s_Params)

	if #s_ObjectEntities == 0 then
		print("Spawning failed")
		return false
	end
	local s_Spatial = {}

	for i, l_Entity in pairs(s_ObjectEntities) do
		l_Entity:Init(Realm.Realm_Client, true)
		l_Entity:FireEvent("Start")
		if(l_Entity:Is("SpatialEntity")) then
			table.insert(s_Spatial, SpatialEntity(l_Entity))
		end
	end

	
	self.m_SpawnedEntities[p_Guid] = s_Spatial

	return s_Spatial
end

function ClientEntityManager:DestroyEntity(p_Guid)

	local s_Entities = self:GetEntityByGuid(p_Guid)

	if(s_Entities == false or #s_Entities == 0) then
		print("Failed to get entities")
		return false
	end

	self.m_SpawnedEntities[p_Guid] = nil;

	for i, entity in pairs(s_Entities) do
		if entity ~= nil then
			print(entity.typeInfo.name)
			print("destroying")
			entity:Destroy()
			print("destroyed")
		end
	end
	return true
end

function ClientEntityManager:SetTransform(p_Guid, p_LinearTransform)

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
			s_Entity.transform = LinearTransform(p_LinearTransform)
		else
			print("entity is nil??")
		end
		::continue::
	end
	return true
end

return ClientEntityManager()