class 'Backend'

local m_Logger = Logger("Backend", true)

local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10000


function Backend:__init(p_Realm)
	m_Logger:Write("Initializing Backend: " .. tostring(p_Realm))
	self.m_Realm = p_Realm;
	self.m_VanillaBlueprintNumber = 0
	self:RegisterVars()
end

function Backend:RegisterVars()
	self.m_Queue = {}
	self.m_VanillaObjects = {}
	self.m_VanillaUnresolved = {}
	m_Logger:Write("Initialized vars")
end



function Backend:OnLevelDestroy()
	self.m_VanillaBlueprintNumber = 0
	
	ObjectManager:Clear()
end


function Backend:SpawnBlueprint(p_Command)
	if(IsVanillaGuid(p_Command.guid)) then
		return Backend:EnableBlueprint(p_Command)
	end
	local s_UserData = p_Command.userData
	local s_SpawnResult = ObjectManager:SpawnBlueprint(p_Command.guid, s_UserData.reference.partitionGuid, s_UserData.reference.instanceGuid, s_UserData.transform, s_UserData.variation)

	if(s_SpawnResult == false) then
		-- Send error to webui
		m_Logger:Write("Failed to spawn blueprint. ")

		return false
	end

	local s_Children = {}

    --local l_Entity = s_SpawnResult[1]
	for k,l_Entity in ipairs(s_SpawnResult) do
		local s_Entity = SpatialEntity(l_Entity)
		s_Children[#s_Children + 1 ] = {
			guid = s_Entity.uniqueID,
			type = l_Entity.typeInfo.name,
			transform = ToLocal(s_Entity.transform, s_UserData.transform),
			instanceId = s_Entity.instanceID,
			aabb = {
				min = tostring(s_Entity.aabb.min),
				max = tostring(s_Entity.aabb.max),
				transform = ToLocal(s_Entity.aabbTransform, s_UserData.transform)
			},
		}
	end

	local s_Response = {
		guid = p_Command.guid,
		sender = p_Command.sender,
		name = s_UserData.name,
		isVanilla = false,
		['type'] = 'SpawnedBlueprint',
		userData = s_UserData,
		children = s_Children
	}
	return s_Response
end

function Backend:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent, p_PartitionGuid, p_ParentGuid, p_ParentPrimaryInstance, p_ParentType)
    self.m_VanillaBlueprintNumber = self.m_VanillaBlueprintNumber + 1

    local s_Guid = GenerateStaticGuid(self.m_VanillaBlueprintNumber)
    local s_SpawnResult = ObjectManager:BlueprintSpawned(p_Hook, tostring(s_Guid), p_Transform, p_Blueprint, p_Parent)

    local s_Entities = {}
	if(p_Blueprint:Is("PrefabBlueprint") == false and type(s_SpawnResult) == "table" )then
		--local l_Entity = s_SpawnResult[1]
		for i, l_Entity in ipairs(s_SpawnResult) do
			local s_Entity = SpatialEntity(l_Entity)
			local s_EntityID = tostring(s_Entity.uniqueID)

			-- Some client entities' ids are 0, we create a custom one
			if s_EntityID == 0 then
				s_EntityID = self.m_VanillaBlueprintNumber.."-"..i
			end
			s_Entities[#s_Entities + 1 ] = {
				guid = s_EntityID,
				type = l_Entity.typeInfo.name,
				transform = ToLocal(s_Entity.transform, p_Transform),
				instanceId = s_Entity.instanceID,
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
    local s_ParentGuid = nil
    if(p_Parent ~= nil) then
        s_ParentGuid = tostring(p_Parent.instanceGuid)
    end

    local s_Response = {
        guid = tostring(s_Guid),
        sender = "Server",
        name = s_Blueprint.name,
        isVanilla = true,
        ['type'] = 'SpawnedBlueprint',
		referenceGuid = s_ParentGuid,
		parentPartition = p_ParentGuid,
		parentPrimaryInstance = p_ParentPrimaryInstance,
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
		children = {}
    }
	-- Resolve
	local s_ParentPartition = nil
	local s_ParentPrimaryInstance = nil

	if(p_Parent ~= nil) then
		s_ParentPartition = InstanceParser:GetPartition(p_Parent.instanceGuid)
		s_ParentPrimaryInstance = InstanceParser:GetPrimaryInstance(s_ParentPartition)

		local s_Parent = ResourceManager:FindInstanceByGUID(Guid(s_ParentPartition), p_Parent.instanceGuid)
		s_Parent = _G[p_Parent.typeInfo.name](p_Parent)
	else
		print(p_Blueprint.instanceGuid)
		s_ParentPartition = "dynamic"
		s_ParentPrimaryInstance = "dynamic"
	end

	local s_Resolved = false
	-- Check if the current blueprint is referenced from a leveldata
	if(InstanceParser:GetLevelData(s_ParentPrimaryInstance) ~= nil) then
		s_Response.parentGuid = s_ParentPrimaryInstance
		s_Response.resolveType = "Level"
		s_Resolved = true
	end

	-- Check if the current blueprint is referenced by earlier blueprints
	if(self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] ~= nil) then
		-- Loop through all the children that are referencing this blueprint and assign this as their parent.
		for k,v in pairs(self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)]) do
			v.parentGuid = s_Response.guid
			v.resolveType = "Unresolved"
			table.insert(s_Response.children, v.guid)
			table.insert(self.m_VanillaObjects, v)
		end
		self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] = nil
	end
	-- We failed to get the parentGuid for this entry. Add it to the unresolved list and wait for the parent.
	if(s_Resolved == true) then
		table.insert(self.m_VanillaObjects, s_Response)
	end
	if(s_Response.parentGuid == nil) then
		-- Add the current blueprint to the unresolved list.
		if(self.m_VanillaUnresolved[s_ParentPrimaryInstance] == nil) then
			self.m_VanillaUnresolved[s_ParentPrimaryInstance] = {}
		end
		table.insert(self.m_VanillaUnresolved[s_ParentPrimaryInstance],s_Response)
	end


    return s_Response
end


function Backend:DestroyBlueprint(p_Command, p_UpdatePass)
	if(IsVanillaGuid(p_Command.guid)) then
		return Backend:DisableBlueprint(p_Command)
	end
	if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return "queue"
    end

	local s_Result = ObjectManager:DestroyEntity(p_Command.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to destroy entity: " .. p_Command.guid)
	end
	local s_Response = {
		type = "DestroyedBlueprint",
		userData = nil,
		guid =  p_Command.guid,
		isDeleted = true
	}
	return s_Response
end

function Backend:EnableBlueprint(p_Command)
	local s_Result = ObjectManager:EnableEntity(p_Command.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to enable blueprint: " .. p_Command.guid)
	end
	local s_Response = {
		type = "EnabledBlueprint",
		guid =  p_Command.guid,
		isDeleted = false
	}
	return s_Response
end


function Backend:DisableBlueprint(p_Command)
	local s_Result = ObjectManager:DisableEntity(p_Command.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to disable blueprint: " .. p_Command.guid)
	end
	local s_Response = {
		type = "DisabledBlueprint",
		guid =  p_Command.guid,
		isDeleted = true
	}
	return s_Response
end

function Backend:SelectGameObject(p_Command)

	if ( ObjectManager:GetEntityByGuid(p_Command.guid) == nil) then
		m_Logger:Write("Failed to select that gameobject")
		return false
	end
	local s_Response = {
		guid = p_Command.guid,
		['type'] = 'SelectedGameObject'
	}
	m_Logger:Write("Selected!")

	return s_Response
end

function Backend:CreateGroup(p_Command)
	-- TODO: save the new group

	local s_Response = {
		guid = p_Command.guid,
		['type'] = 'CreatedGroup',
		transform = p_Command.userData.transform,
		name = p_Command.userData.name,
		sender = p_Command.sender,
	}
	return s_Response
end

function Backend:SetTransform(p_Command, p_UpdatePass)
	local s_Result = ObjectManager:SetTransform(p_Command.guid, p_Command.userData.transform, true)
	if(s_Result == false) then
		-- Notify WebUI of failed
		m_Logger:Write("failed")
		return false
	end

	local s_Response = {
		type = "SetTransform",
		guid = p_Command.guid,
		userData = {
			transform = p_Command.userData.transform
		}
	}

	return s_Response
end

--[[

	Shit

--]]

function Backend:Error(p_Message, p_Command)
	local s_Response = {
		type = "Error",
		message = p_Message,
		command = p_Command
	}
	return s_Response
end

return Backend