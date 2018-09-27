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

function ClientEntityManager:SpawnBlueprint(p_Guid, p_PartitionGuid, p_InstanceGuid, p_LinearTransform, p_Variation)
	if p_PartitionGuid == nil or
		 p_InstanceGuid == nil or
		 p_LinearTransform == nil then
    print('One or more parameters are nil')
	end

	p_PartitionGuid = "F871344A-0D04-11E0-A043-B712E352AFFD"
	p_InstanceGuid = "A32FC125-C8C6-2552-5729-E0E7B670197C"

	if self.m_SpawnedEntities[p_Guid] ~= nil then
		print('Object with id ' .. p_Guid .. ' already existed as a spawned entity!')
		return
	end

	p_Variation = p_Variation or 0

	p_Variation = 0

	p_LinearTransform = LinearTransform(
		Vec3(1,0,0),
		Vec3(0,1,0),
		Vec3(0,0,1),
		Vec3(0,0,0)
		)

	local s_Blueprint = ResourceManager:FindInstanceByGUID(Guid(p_PartitionGuid), Guid(p_InstanceGuid))

	if s_Blueprint == nil then
		error('Couldn\'t find the specified instance')
		return
	end
	
	local s_ObjectBlueprint = _G[s_Blueprint.typeInfo.name](s_Blueprint)

	print('Blueprint type: ' .. s_Blueprint.typeInfo.name .. ", ID: " .. p_Guid .. ", Instance: " .. tostring(p_InstanceGuid))

	local s_Params = EntityCreationParams()
	s_Params.transform = p_LinearTransform
	s_Params.variationNameHash = p_Variation

	local s_ObjectEntities = EntityManager:CreateEntitiesFromBlueprint(s_Blueprint, s_Params)

	for i, entity in pairs(s_ObjectEntities) do
		entity:Init(Realm.Realm_Client, true)
		entity:FireEvent("Start")
	end
	
	-- self.m_SpawnedEntities[p_Guid] = s_ObjectEntities
end

return ClientEntityManager()