class 'CommandActions'

local m_Logger = Logger("CommandActions", true)


function CommandActions:__init(p_Realm)
	m_Logger:Write("Initializing CommandActions: " .. tostring(p_Realm))
	self.m_Realm = p_Realm;
	self:RegisterVars()
end

function CommandActions:RegisterVars()
	self.m_Queue = {}

	m_Logger:Write("Initialized vars")

	self.SpawnBlueprintCommand = self.SpawnBlueprint
	self.DestroyBlueprintCommand = self.DestroyBlueprint
	self.SetTransformCommand = self.SetTransform
	self.SelectGameObjectCommand = self.SelectGameObject
	self.CreateGroupCommand = self.CreateGroup
	self.EnableBlueprintCommand = self.EnableBlueprint
	self.DisableBlueprintCommand = self.DisableBlueprint
end

function CommandActions:SpawnBlueprint(p_Command, p_UpdatePass)
	if(IsVanilla(p_Command.guid)) then
		return self:EnableBlueprint(p_Command)
	end

	local s_UserData = p_Command.userData
	local s_SpawnResult = ObjectManager:SpawnBlueprint(p_Command.guid, s_UserData.reference.partitionGuid, s_UserData.reference.instanceGuid, s_UserData.transform, s_UserData.variation)

	if(s_SpawnResult == false) then
		-- Send error to webui
		m_Logger:Write("Failed to spawn blueprint. ")

		return nil, CommandActionResultType.Failure
	end

	local s_Children = {}

    --local l_Entity = s_SpawnResult[1]
	for _, l_Entity in ipairs(s_SpawnResult) do
		local s_Entity = SpatialEntity(l_Entity)

-- ENTITYDATA

		s_Children[#s_Children + 1] = {
			guid = s_Entity.uniqueId,
			type = l_Entity.typeInfo.name,
			transform = ToLocal(s_Entity.transform, s_UserData.transform),
			instanceId = s_Entity.instanceId,
			aabb = {
				min = tostring(s_Entity.aabb.min),
				max = tostring(s_Entity.aabb.max),
				transform = ToLocal(s_Entity.aabbTransform, s_UserData.transform)
			},
		}
	end

	local s_CommandActionResult = { -- export to own class. discuss structure. pack everything into 'data' property?
		guid = p_Command.guid,
		sender = p_Command.sender,
		name = s_UserData.name, -- name field is obsolete
		isVanilla = false,
		type = 'SpawnedBlueprint',
		userData = s_UserData,
		children = s_Children -- rename to entities because theres no recursive hierarchy implied
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:DestroyBlueprint(p_Command, p_UpdatePass)
	if(IsVanilla(p_Command.guid)) then
		return CommandActions:DisableBlueprint(p_Command)
	end

	if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return nil, CommandActionResultType.Queue
    end

	local s_Result = ObjectManager:DestroyEntity(p_Command.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to destroy entity: " .. p_Command.guid)
	end

	local s_CommandActionResult = {
		type = "DestroyedBlueprint",
		userData = nil,
		guid =  p_Command.guid,
		isDeleted = true
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:EnableBlueprint(p_Command, p_UpdatePass)
	local s_Result = ObjectManager:EnableEntity(p_Command.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to enable blueprint: " .. p_Command.guid)
	end

	local s_CommandActionResult = {
		type = "EnabledBlueprint",
		guid =  p_Command.guid,
		isDeleted = false
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:DisableBlueprint(p_Command, p_UpdatePass)
	local s_Result = ObjectManager:DisableEntity(p_Command.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to disable blueprint: " .. p_Command.guid)
	end

	local s_CommandActionResult = {
		type = "DisabledBlueprint",
		guid =  p_Command.guid,
		isDeleted = true
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:SelectGameObject(p_Command, p_UpdatePass)

	if (ObjectManager:GetEntityByGuid(p_Command.guid) == nil) then
		m_Logger:Write("Failed to select that gameobject")
		return nil, CommandActionResultType.Failure
	end

	local s_CommandActionResult = {
		guid = p_Command.guid,
		type = 'SelectedGameObject'
	}

	m_Logger:Write("Selected!")

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:CreateGroup(p_Command, p_UpdatePass)
	-- TODO: save the new group

	local s_CommandActionResult = {
		guid = p_Command.guid,
		type = 'CreatedGroup',
		transform = p_Command.userData.transform,
		name = p_Command.userData.name, -- name field is obsolete
		sender = p_Command.sender,
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:SetTransform(p_Command, p_UpdatePass)
	local s_Result = ObjectManager:SetTransform(p_Command.guid, p_Command.userData.transform, true)
	if (s_Result == false) then
		-- Notify WebUI of failed
		m_Logger:Write("failed")
		return nil, CommandActionResultType.Failure
	end

	local s_CommandActionResult = {
		type = "SetTransform",
		guid = p_Command.guid,
		userData = {
			transform = p_Command.userData.transform
		}
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

return CommandActions