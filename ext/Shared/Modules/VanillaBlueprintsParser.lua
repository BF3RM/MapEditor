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
end

function VanillaBlueprintsParser:OnLevelDestroy()
	self.m_VanillaBlueprintNumber = 0
end

function VanillaBlueprintsParser:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent, p_PartitionGuid)
    self.m_VanillaBlueprintNumber = self.m_VanillaBlueprintNumber + 1

    local s_Guid = tostring(GenerateStaticGuid(self.m_VanillaBlueprintNumber))
    local s_SpawnResult = ObjectManager:BlueprintSpawned(p_Hook, s_Guid, p_Transform, p_Blueprint, p_Parent)

    local s_GameEntities = {}
	if (p_Blueprint:Is("PrefabBlueprint") == false and type(s_SpawnResult) == "table")then
		--local l_Entity = s_SpawnResult[1]
		for i, l_Entity in ipairs(s_SpawnResult) do
			local s_Entity = SpatialEntity(l_Entity)

			local s_IndexInBlueprint = #s_GameEntities + 1

			s_GameEntities[s_IndexInBlueprint] = {
				instanceId = s_Entity.instanceId,
				indexInBlueprint = s_IndexInBlueprint,
				typeName = l_Entity.typeInfo.name,
				transform = ToLocal(s_Entity.transform, p_Transform),
				aabb = {
					min = tostring(s_Entity.aabb.min),
					max = tostring(s_Entity.aabb.max),
					transform = ToLocal(s_Entity.aabbTransform, p_Transform)
				},
			}
		end
	end

    local s_Blueprint = _G[p_Blueprint.typeInfo.name](p_Blueprint)

	if (p_Blueprint.typeInfo.name == "SubWorldData") then
		self.m_SubWorlds[tostring(p_Blueprint.instanceGuid)] = s_Guid
	end

	if (p_Blueprint.typeInfo.name == "WorldPartData") then
		self.m_WorldParts[tostring(p_Blueprint.instanceGuid)] = s_Guid
		if(p_Blueprint.instanceGuid == nil) then
			m_Logger:Write("No guid")
		end
	end

	local s_CommandActionResult = {
		type = 'SpawnedBlueprint',
		sender = 'Server',
		gameObjectTransferData = {
			guid = s_Guid,
			name = s_Blueprint.name,
			typeName = s_Blueprint.typeInfo.name,
			blueprintCtrRef = {
				typeName = s_Blueprint.typeInfo.name,
				name = s_Blueprint.name,
				partitionGuid = InstanceParser:GetPartition(s_Blueprint.instanceGuid),
				instanceGuid = tostring(s_Blueprint.instanceGuid)
			},
			parentData = {
				guid = nil,
				typeName = nil,
				primaryInstanceGuid = nil,
				partitionGuid = nil,
				resolveType = nil
			},
			transform = p_Transform,
			variation = p_Variation,
			gameEntities = s_GameEntities
		}
	}

	-- Resolve
	local s_ParentData = s_CommandActionResult.gameObjectTransferData.parentData
	local s_ParentPartitionGuid
	local s_ParentPrimaryInstanceGuid

	if (p_Parent ~= nil) then
		s_ParentPartitionGuid = InstanceParser:GetPartition(p_Parent.instanceGuid)
		s_ParentPrimaryInstanceGuid = InstanceParser:GetPrimaryInstance(s_ParentPartitionGuid)

		--NoHavok
		if (s_ParentPartitionGuid == nil) then
			if(p_Blueprint.typeInfo ~= WorldPartData.typeInfo) then
				s_ParentData.guid = "whatever"
				s_ParentData.resolveType = "NoHavokChild"
			else
				s_ParentData.guid = "root"
				s_ParentData.resolveType = "NoHavok"
			end

			s_ParentData.typeName = p_Parent.typeInfo.name
		else
			local s_Parent = ResourceManager:FindInstanceByGUID(Guid(s_ParentPartitionGuid), p_Parent.instanceGuid)
			s_Parent = _G[p_Parent.typeInfo.name](s_Parent)

			s_ParentData.partitionGuid = s_ParentPartitionGuid
			s_ParentData.primaryInstanceGuid = s_ParentPrimaryInstanceGuid
			s_ParentData.typeName = s_Parent.typeInfo.name
		end
	else
		s_ParentPartitionGuid = "dynamic"
		s_ParentPrimaryInstanceGuid = "dynamic"
	end

	-- Check if the current blueprint is referenced by earlier blueprints
	if (self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] ~= nil) then
		-- Loop through all the children that are referencing this blueprint and assign this as their parent.
		for _, childResult in pairs(self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)]) do

			childResult.gameObjectTransferData.parentData.guid = s_CommandActionResult.gameObjectTransferData.guid -- set the parent guid to the current one
			childResult.gameObjectTransferData.parentData.resolveType = "Unresolved"

			--table.insert(s_CommandActionResult.children, childGameObjectTransferData.guid)
			self.m_VanillaObjects[childResult.gameObjectTransferData.guid] = childResult
		end

		self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] = nil
	end

	-- Check if the current blueprint is referenced from a leveldata
	if (InstanceParser:GetLevelData(s_ParentPrimaryInstanceGuid) ~= nil) then
		s_ParentData.guid = s_ParentPrimaryInstanceGuid
		s_ParentData.resolveType = "Level"
	end

	-- Check if the current blueprint is a child of a WorldPartData
	if (self.m_WorldParts[s_ParentPrimaryInstanceGuid]) then
		print("Found child of WorldPart:")
		print(self.m_WorldParts[s_ParentPrimaryInstanceGuid])
		local s_ParentCommandActionResult = self.m_VanillaObjects[self.m_WorldParts[s_ParentPrimaryInstanceGuid]]
		s_ParentData.guid = s_ParentCommandActionResult.gameObjectTransferData.guid
		s_ParentData.resolveType = "WorldPart"
		--table.insert(s_Parent.children, s_CommandActionResult.gameObjectTransferData.guid)
	end

	-- Check if the current blueprint is a child of a WorldPartData
	if (self.m_SubWorlds[s_ParentPrimaryInstanceGuid]) then
		print("Found child of SubWorld:")
		print(self.m_SubWorlds[s_ParentPrimaryInstanceGuid])
		local s_ParentCommandActionResult = self.m_VanillaObjects[self.m_SubWorlds[s_ParentPrimaryInstanceGuid]]
		s_ParentData.guid = s_ParentCommandActionResult.gameObjectTransferData.guid
		s_ParentData.resolveType = "SubWorld"
		--table.insert(s_Parent.children, s_CommandActionResult.gameObjectTransferData.guid)
	end

	if(s_ParentData.guid == nil) then
		-- Add the current blueprint to the unresolved list.
		if(self.m_VanillaUnresolved[s_ParentPrimaryInstanceGuid] == nil) then
			self.m_VanillaUnresolved[s_ParentPrimaryInstanceGuid] = {}
		end

		table.insert(self.m_VanillaUnresolved[s_ParentPrimaryInstanceGuid], s_CommandActionResult)
	end

	if (s_ParentData.guid ~= nil) then
		self.m_VanillaObjects[s_CommandActionResult.gameObjectTransferData.guid] = s_CommandActionResult
	end

	return s_CommandActionResult
end

return VanillaBlueprintsParser