class 'Backend'



local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10000

function Backend:__init(p_Realm)
	print("Initializing Backend: " .. tostring(p_Realm))
	self.m_Realm = p_Realm;
	self:RegisterVars()
end

function Backend:RegisterVars()
	self.m_Queue = {}
	print("Initialized vars")
end



function Backend:OnLevelDestroy()
	ObjectManager:Clear()
end


function Backend:SpawnBlueprint(p_Command)
	local s_UserData = p_Command.userData
	local s_SpawnResult = ObjectManager:SpawnBlueprint(p_Command.guid, s_UserData.reference.partitionGuid, s_UserData.reference.instanceGuid, s_UserData.transform, s_UserData.variation)

	if(s_SpawnResult == false) then
		-- Send error to webui
		print("Failed to spawn blueprint. ")

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
		['type'] = 'SpawnedBlueprint',
		userData = s_UserData,
		children = s_Children
	}
	return s_Response
end

function Backend:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent)
    if(p_Transform == nil) then
        p_Transform = LinearTransform()
    end
    local s_Guid = GenerateGuid()
    local s_SpawnResult = ObjectManager:BlueprintSpawned(p_Hook, tostring(s_Guid), p_Transform, p_Blueprint, p_Parent)

    local s_Children = {}

    --local l_Entity = s_SpawnResult[1]
    for k,l_Entity in ipairs(s_SpawnResult) do
        local s_Entity = SpatialEntity(l_Entity)
        s_Children[#s_Children + 1 ] = {
            guid = s_Entity.uniqueID,
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
    local s_Blueprint = Blueprint(p_Blueprint)
    local s_ParentGuid = nil
    if(p_Parent ~= nil) then
        s_ParentGuid = tostring(p_Parent.instanceGuid)
    end
    local s_Response = {
        guid = tostring(s_Guid),
        sender = "Server",
        name = s_Blueprint.name,
        ['type'] = 'SpawnedBlueprint',
		parent = s_ParentGuid,
        userData = {
            name = s_Blueprint.name,
            reference = {
                instanceGuid = tostring(p_Blueprint.instanceGuid),
                partitionGuid = s_ParentGuid,
                typeName = p_Blueprint.typeInfo.name,
                name = s_Blueprint.name,
            },
            transform = p_Transform,
            variation = p_Variation
        },
        children = s_Children
    }
    return s_Response
end


function Backend:DestroyBlueprint(p_Command, p_UpdatePass)
    if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return "queue"
    end

	local s_Result = ObjectManager:DestroyEntity(p_Command.guid)

	if(s_Result == false) then
		print("Failed to destroy entity: " .. p_Command.guid)
	end
	local s_Response = {
		type = "DestroyedBlueprint",
		userData = nil,
		guid =  p_Command.guid
	}
	return s_Response
end


function Backend:SelectGameObject(p_Command)

	if ( ObjectManager:GetEntityByGuid(p_Command.guid) == nil) then
		print("Failed to select that gameobject")
		return false
	end
	local s_Response = {
		guid = p_Command.guid,
		['type'] = 'SelectedGameObject'
	}
	print("Selected!")

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

function Backend:SetTransform(p_Command)
	local s_Result = ObjectManager:SetTransform(p_Command.guid, p_Command.userData.transform, true)

	if(s_Result == false) then
		-- Notify WebUI of failed
		print("failed")
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