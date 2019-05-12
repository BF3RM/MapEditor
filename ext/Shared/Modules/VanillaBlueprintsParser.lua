class 'VanillaBlueprintsParser'

local m_Logger = Logger("VanillaBlueprintsParser", true)

function VanillaBlueprintsParser:__init(p_Realm)
	m_Logger:Write("Initializing VanillaBlueprintsParser: " .. tostring(p_Realm))
	self.m_Realm = p_Realm;
	self:RegisterVars()
end

function VanillaBlueprintsParser:RegisterVars()
	self.m_VanillaBlueprintNumber = 0
	self.m_VanillaObjects = {}
	self.m_VanillaUnresolved = {}

	self.m_WorldParts = {}
	self.m_WorldPartChildren = {}
	self.m_SubWorlds = {}

	self.m_VanillaSpawnindex = 0
end

function VanillaBlueprintsParser:OnLevelDestroy()
	self.m_VanillaBlueprintNumber = 0
end

function VanillaBlueprintsParser:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent, p_PartitionGuid)
    self.m_VanillaBlueprintNumber = self.m_VanillaBlueprintNumber + 1

    local s_Guid = GenerateStaticGuid(self.m_VanillaBlueprintNumber)
    local s_SpawnResult = ObjectManager:BlueprintSpawned(p_Hook, tostring(s_Guid), p_Transform, p_Blueprint, p_Parent)

    local s_Entities = {}
	if(p_Blueprint:Is("PrefabBlueprint") == false and type(s_SpawnResult) == "table" )then
		--local l_Entity = s_SpawnResult[1]
		for i, l_Entity in ipairs(s_SpawnResult) do
			local s_Entity = SpatialEntity(l_Entity)
			local s_EntityID = tostring(s_Entity.uniqueId)

			-- Some client entities' ids are 0, we create a custom one
			if s_EntityID == 0 then
				s_EntityID = self.m_VanillaBlueprintNumber.."-"..i
			end

-- ENTITYINFO

			s_Entities[#s_Entities + 1 ] = {
				guid = s_EntityID,
				type = l_Entity.typeInfo.name,
				transform = ToLocal(s_Entity.transform, p_Transform),
				instanceId = s_Entity.instanceId,
				transforms = {worldTrans = p_Transform, localTrans = s_Entity.transform},
				aabb = {
					min = tostring(s_Entity.aabb.min),
					max = tostring(s_Entity.aabb.max),
					transform = ToLocal(s_Entity.aabbTransform, p_Transform)
				},
			}
		end
	end

    local s_Blueprint = _G[p_Blueprint.typeInfo.name](p_Blueprint)


    local s_ParentGuid
	if(p_Parent ~= nil) then
        s_ParentGuid = tostring(p_Parent.instanceGuid)
    end

-- RESPONSE

    local s_Response = {
        guid = tostring(s_Guid),
        sender = "Server",
        name = s_Blueprint.name, -- name field is obsolete
        type = 'SpawnedBlueprint',
        isVanilla = true,
		referenceGuid = s_ParentGuid,
        userData = {
            name = s_Blueprint.name,
            reference = {
                instanceGuid = tostring(p_Blueprint.instanceGuid),
                partitionGuid = p_PartitionGuid,
                typeName = p_Blueprint.typeInfo.name,
                name = s_Blueprint.name,
            },
            transform = p_Transform,
            variation = p_Variation
        },
        entities = s_Entities,
		children = {},
		spawnIndex = self.m_VanillaSpawnindex
    }

	if(p_Blueprint.typeInfo.name == "SubWorldData") then
		self.m_SubWorlds[tostring(p_Blueprint.instanceGuid)] = s_Response.guid
    end

	if(p_Blueprint.typeInfo.name == "WorldPartData") then
		self.m_WorldParts[tostring(p_Blueprint.instanceGuid)] = s_Response.guid
		if(p_Blueprint.instanceGuid == nil) then
			m_Logger:Write("No guid")
		end
	end

	self.m_VanillaSpawnindex = self.m_VanillaSpawnindex + 1

	-- Resolve
	local s_ParentPartition
	local s_ParentPrimaryInstance

	if(p_Parent ~= nil) then
		s_ParentPartition = InstanceParser:GetPartition(p_Parent.instanceGuid)
		s_ParentPrimaryInstance = InstanceParser:GetPrimaryInstance(s_ParentPartition)

		--NoHavok
		if(s_ParentPartition == nil) then
			if(p_Blueprint.typeInfo ~= WorldPartData.typeInfo) then
				s_Response.parentGuid = ""
				s_Response.resolveType = "NoHavokChild"
			else
				s_Response.parentGuid = "root"
				s_Response.resolveType = "NoHavok"
			end
		else
			local s_Parent = ResourceManager:FindInstanceByGUID(Guid(s_ParentPartition), p_Parent.instanceGuid)
			s_Parent = _G[p_Parent.typeInfo.name](s_Parent)

			s_Response.parentPrimaryInstance = s_ParentPrimaryInstance
			s_Response.parentPartition = s_ParentPartition
			s_Response.parentType = s_Parent.typeInfo.name
		end
	else
		-- m_Logger:Write(p_Blueprint.instanceGuid)
		s_ParentPartition = "dynamic"
		s_ParentPrimaryInstance = "dynamic"
	end

	-- Check if the current blueprint is referenced by earlier blueprints
	if(self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] ~= nil) then
		-- Loop through all the children that are referencing this blueprint and assign this as their parent.
		for _, v in pairs(self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)]) do
			v.parentGuid = s_Response.guid
			v.resolveType = "Unresolved"
			table.insert(s_Response.children, v.guid)
			self.m_VanillaObjects[v.guid] = v
        end
        
		self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] = nil
	end

	-- Check if the current blueprint is referenced from a leveldata
	if(InstanceParser:GetLevelData(s_ParentPrimaryInstance) ~= nil) then
		s_Response.parentGuid = s_ParentPrimaryInstance
		s_Response.resolveType = "Level"
	end

	-- Check if the current blueprint is a child of a WorldPartData
	if(self.m_WorldParts[s_ParentPrimaryInstance]) then
		print(self.m_WorldParts[s_ParentPrimaryInstance])
		local s_Parent = self.m_VanillaObjects[self.m_WorldParts[s_ParentPrimaryInstance]]
		s_Response.parentGuid = s_Parent.guid
		s_Response.resolveType = "WorldPart"
		table.insert(s_Parent.children, s_Response.guid)
	end

	-- Check if the current blueprint is a child of a WorldPartData
	if(self.m_SubWorlds[s_ParentPrimaryInstance]) then
		print(self.m_SubWorlds[s_ParentPrimaryInstance])
		local s_Parent = self.m_VanillaObjects[self.m_SubWorlds[s_ParentPrimaryInstance]]
		s_Response.parentGuid = s_Parent.guid
		s_Response.resolveType = "SubWorld"
		table.insert(s_Parent.children, s_Response.guid)
	end

	if(s_Response.parentGuid == nil) then
		-- Add the current blueprint to the unresolved list.
		if(self.m_VanillaUnresolved[s_ParentPrimaryInstance] == nil) then
			self.m_VanillaUnresolved[s_ParentPrimaryInstance] = {}
		end
		table.insert(self.m_VanillaUnresolved[s_ParentPrimaryInstance],s_Response)
	end

	if(s_Response.parentGuid ~= nil) then
		self.m_VanillaObjects[s_Response.guid] = s_Response
	end

    return s_Response
end

return VanillaBlueprintsParser