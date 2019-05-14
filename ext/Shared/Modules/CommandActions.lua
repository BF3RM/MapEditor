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
	self.EnableBlueprintCommand = self.EnableBlueprint
	self.DisableBlueprintCommand = self.DisableBlueprint
end

function CommandActions:SpawnBlueprint(p_CommandActionResult, p_UpdatePass)
	if(IsVanilla(p_CommandActionResult.gameObjectTransferData.guid)) then
		return self:EnableBlueprint(p_Command)
	end

	local s_GameObjectTransferData = p_CommandActionResult.gameObjectTransferData
	local s_SpawnResult = ObjectManager:SpawnBlueprint(p_CommandActionResult.gameObjectTransferData.guid,
														s_GameObjectTransferData.reference.partitionGuid,
														s_GameObjectTransferData.reference.instanceGuid,
														s_GameObjectTransferData.transform,
														s_GameObjectTransferData.variation)

	if(s_SpawnResult == false) then
		-- Send error to webui
		m_Logger:Write("Failed to spawn blueprint. ")

		return nil, CommandActionResultType.Failure
	end

	local s_Entities = {}

    --local l_Entity = s_SpawnResult[1]
	for _, l_Entity in ipairs(s_SpawnResult) do
		local s_Entity = SpatialEntity(l_Entity)

-- ENTITYDATA

		s_Entities[#s_Entities + 1] = {
			guid = s_Entity.uniqueId,
			type = l_Entity.typeInfo.name,
			transform = ToLocal(s_Entity.transform, s_GameObjectTransferData.transform),
			instanceId = s_Entity.instanceId,
			aabb = {
				min = tostring(s_Entity.aabb.min),
				max = tostring(s_Entity.aabb.max),
				transform = ToLocal(s_Entity.aabbTransform, s_GameObjectTransferData.transform)
			},
		}
	end

	-- TODO: Change to CommandActionResult

	local s_CommandActionResult = { -- export to own class. discuss structure. pack everything into 'data' property?
		guid = p_CommandActionResult.gameObjectTransferData.guid,
		sender = p_CommandActionResult.sender,
		-- name = s_UserData.name, -- name field is obsolete
		type = 'SpawnedBlueprint',
		gameObjectTransferData = s_GameObjectTransferData,
		entities = s_Entities -- rename to entities because theres no recursive hierarchy implied
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:DestroyBlueprint(p_CommandActionResult, p_UpdatePass)
	if(IsVanilla(p_CommandActionResult.gameObjectTransferData.guid)) then
		return CommandActions:DisableBlueprint(p_Command)
	end

	if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return nil, CommandActionResultType.Queue
    end

	local s_Result = ObjectManager:DestroyEntity(p_CommandActionResult.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to destroy entity: " .. p_CommandActionResult.gameObjectTransferData.guid)
	end

	-- TODO: Change to CommandActionResult

	local s_CommandActionResult = {
		type = "DestroyedBlueprint",
		gameObjectTransferData = nil,
		guid =  p_CommandActionResult.gameObjectTransferData.guid,
		isDeleted = true
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:EnableBlueprint(p_CommandActionResult, p_UpdatePass)
	local s_Result = ObjectManager:EnableEntity(p_CommandActionResult.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to enable blueprint: " .. p_CommandActionResult.gameObjectTransferData.guid)
	end

	-- TODO: Change to CommandActionResult

	local s_CommandActionResult = {
		type = "EnabledBlueprint",
		guid =  p_CommandActionResult.gameObjectTransferData.guid,
		isDeleted = false
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:DisableBlueprint(p_CommandActionResult, p_UpdatePass)
	local s_Result = ObjectManager:DisableEntity(p_CommandActionResult.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to disable blueprint: " .. p_CommandActionResult.gameObjectTransferData.guid)
	end

	-- TODO: Change to CommandActionResult

	local s_CommandActionResult = {
		type = "DisabledBlueprint",
		guid =  p_CommandActionResult.gameObjectTransferData.guid,
		isDeleted = true
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:SelectGameObject(p_CommandActionResult, p_UpdatePass)

	if (ObjectManager:GetEntityByGuid(p_CommandActionResult.gameObjectTransferData.guid) == nil) then
		m_Logger:Write("Failed to select that gameobject")
		return nil, CommandActionResultType.Failure
	end

	-- TODO: Change to CommandActionResult

	local s_CommandActionResult = {
		guid = p_CommandActionResult.gameObjectTransferData.guid,
		type = 'SelectedGameObject'
	}

	m_Logger:Write("Selected!")

	return s_CommandActionResult, CommandActionResultType.Success
end

function CommandActions:SetTransform(p_CommandActionResult, p_UpdatePass)
	local s_Result = ObjectManager:SetTransform(p_CommandActionResult.gameObjectTransferData.guid, p_CommandActionResult.gameObjectTransferData.transform, true)
	if (s_Result == false) then
		-- Notify WebUI of failed
		m_Logger:Write("failed")
		return nil, CommandActionResultType.Failure
	end

	-- TODO: Change to CommandActionResult

	local s_CommandActionResult = {
		type = "SetTransform",
		guid = p_CommandActionResult.gameObjectTransferData.guid,
		gameObjectTransferData = {
			transform = p_CommandActionResult.userData.transform
		}
	}

	return s_CommandActionResult, CommandActionResultType.Success
end

return CommandActions