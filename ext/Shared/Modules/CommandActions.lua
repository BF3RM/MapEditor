class 'CommandActions'

local m_Logger = Logger("CommandActions", true)

function CommandActions:__init(p_Realm)
	m_Logger:Write("Initializing CommandActions: " .. tostring(p_Realm))
	self.m_Realm = p_Realm;
	self:RegisterVars()
end

function CommandActions:RegisterVars()
	m_Logger:Write("Initialized vars")

	self.SpawnBlueprintCommand = self.SpawnBlueprint
	self.DestroyBlueprintCommand = self.DestroyBlueprint
	self.SetTransformCommand = self.SetTransform
	self.SelectGameObjectCommand = self.SelectGameObject
	self.EnableBlueprintCommand = self.EnableBlueprint
	self.DisableBlueprintCommand = self.DisableBlueprint
end

function CommandActions:SpawnBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The SpawnBlueprintCommand needs to have a valid gameObjectTransferData set.")
		return nil, ActionResultType.Failure
	end

	if(IsVanilla(p_Command.gameObjectTransferData.guid)) then
		return self:EnableBlueprint(p_Command, p_UpdatePass)
	end

	local s_GameObjectTransferData = p_Command.gameObjectTransferData
	local s_SpawnResult = ObjectManager:SpawnBlueprint(s_GameObjectTransferData.guid,
														s_GameObjectTransferData.blueprintCtrRef.partitionGuid,
														s_GameObjectTransferData.blueprintCtrRef.instanceGuid,
														s_GameObjectTransferData.transform,
														s_GameObjectTransferData.variation)

	if(s_SpawnResult == false) then
		-- Send error to webui
		m_Logger:Write("Failed to spawn blueprint. ")

		return nil, ActionResultType.Failure
	end

	local s_Entities = {}

    --local l_Entity = s_SpawnResult[1]
	for _, l_Entity in ipairs(s_SpawnResult) do
		local s_Entity = SpatialEntity(l_Entity)

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

	-- we can use the gameObjectTransferData that we received, fill in the entities and send it back
	s_GameObjectTransferData.gameEntities = s_Entities

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = 'SpawnedBlueprint',
		gameObjectTransferData = s_GameObjectTransferData,
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:DestroyBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The DestroyBlueprint needs to have a valid gameObjectTransferData set.")
		return
	end

	if(IsVanilla(p_Command.gameObjectTransferData.guid)) then
		return CommandActions:DisableBlueprint(p_Command, p_UpdatePass)
	end

	if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return nil, ActionResultType.Queue
    end

	local s_Result = ObjectManager:DestroyEntity(p_Command.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to destroy entity: " .. p_Command.gameObjectTransferData.guid)
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		isDeleted = true
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = "DestroyedBlueprint",
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:EnableBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The EnableBlueprint needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = ObjectManager:EnableEntity(p_Command.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to enable blueprint: " .. p_Command.gameObjectTransferData.guid)
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		isEnabled = true
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = "EnabledBlueprint",
		gameObjectTransferData =  s_GameObjectTransferData,
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:DisableBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The DisableBlueprint needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = ObjectManager:DisableEntity(p_Command.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to disable blueprint: " .. p_Command.gameObjectTransferData.guid)
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		isEnabled = false
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = "DisabledBlueprint",
		gameObjectTransferData = s_GameObjectTransferData,
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:SelectGameObject(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The SelectGameObject needs to have a valid gameObjectTransferData set.")
		return
	end

	if (ObjectManager:GetEntityByGuid(p_Command.gameObjectTransferData.guid) == nil) then
		m_Logger:Write("Failed to select that gameobject")
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = 'SelectedGameObject',
		gameObjectTransferData = s_GameObjectTransferData,
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:SetTransform(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The SetTransform needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = ObjectManager:SetTransform(p_Command.gameObjectTransferData.guid, p_Command.gameObjectTransferData.transform, true)
	if (s_Result == false) then
		m_Logger:Write("Failed to set transform for object " .. p_Command.gameObjectTransferData.guid)
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		transform = p_Command.gameObjectTransferData.transform
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = "SetTransform",
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, ActionResultType.Success
end

return CommandActions