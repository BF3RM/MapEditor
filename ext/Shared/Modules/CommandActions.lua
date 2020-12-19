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
	self.DeleteBlueprintCommand = self.DeleteBlueprint
	self.UndeleteBlueprintCommand = self.UndeleteBlueprint
	self.SetTransformCommand = self.SetTransform
	self.SelectGameObjectCommand = self.SelectGameObject
	self.EnableBlueprintCommand = self.EnableBlueprint
	self.DisableBlueprintCommand = self.DisableBlueprint
	self.SetVariationCommand = self.SetVariation
	self.SetEBXFieldCommand = self.SetEBXField
end

function CommandActions:SpawnBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The SpawnBlueprintCommand needs to have a valid gameObjectTransferData set.")
		return nil, ActionResultType.Failure
	end

	if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
		return nil, ActionResultType.Queue
	end

	local s_GameObjectTransferData = p_Command.gameObjectTransferData

	local s_SpawnResult = GameObjectManager:InvokeBlueprintSpawn(s_GameObjectTransferData.guid,
																p_Command.sender,
																s_GameObjectTransferData.blueprintCtrRef.partitionGuid,
																s_GameObjectTransferData.blueprintCtrRef.instanceGuid,
																s_GameObjectTransferData.parentData,
																s_GameObjectTransferData.transform,
																s_GameObjectTransferData.variation,
												false)

	if(s_SpawnResult == false) then
		-- Send error to webui
		m_Logger:Write("Failed to spawn blueprint.")
		return nil, ActionResultType.Failure
	end

	local s_ResultGameObjectTransferData = {
		guid = s_GameObjectTransferData.guid,
		name = s_GameObjectTransferData.name,
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = 'SpawnedBlueprint',
		gameObjectTransferData = s_ResultGameObjectTransferData,
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:DeleteBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The DestroyBlueprint needs to have a valid gameObjectTransferData set.")
		return nil, ActionResultType.Failure
	end

	if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
		return nil, ActionResultType.Queue
	end

	local s_Result = GameObjectManager:DeleteGameObject(p_Command.gameObjectTransferData.guid)

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
		type = "DeletedBlueprint", -- TODO: powback rename DestroyBlueprint -> DeletedBlueprint / DeletedBlueprint -> DeletedBlueprint
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:UndeleteBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The UndeleteBlueprint needs to have a valid gameObjectTransferData set.")
		return
	end

	if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
		return nil, ActionResultType.Queue
	end
	print("UndeleteBlueprint with guid " .. p_Command.gameObjectTransferData.guid)
	if not IsVanilla(p_Command.gameObjectTransferData.guid) then
		return CommandActions:SpawnBlueprint(p_Command, p_UpdatePass)
	end

	local s_Result = GameObjectManager:UndeleteBlueprint(p_Command.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Write("Failed to undelete blueprint: " .. p_Command.gameObjectTransferData.guid)
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = GameObjectManager.m_GameObjects[p_Command.gameObjectTransferData.guid]:GetGameObjectTransferData()

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = "SpawnedBlueprint",
		gameObjectTransferData =  s_GameObjectTransferData,
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:EnableBlueprint(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The EnableBlueprint needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = GameObjectManager:EnableGameObject(p_Command.gameObjectTransferData.guid)

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

	local s_Result = GameObjectManager:DisableGameObject(p_Command.gameObjectTransferData.guid)

	if(s_Result == false) then
		m_Logger:Error("Failed to disable blueprint: " .. p_Command.gameObjectTransferData.guid)
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

	if (GameObjectManager:GetEntityByGuid(p_Command.gameObjectTransferData.guid) == nil) then
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

	local s_Result = GameObjectManager:SetTransform(p_Command.gameObjectTransferData.guid, p_Command.gameObjectTransferData.transform, true)
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


function CommandActions:SetVariation(p_Command, p_UpdatePass)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The SetTransform needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = GameObjectManager:SetVariation(p_Command.gameObjectTransferData.guid, p_Command.gameObjectTransferData.variation)
	if (s_Result == false) then
		m_Logger:Error("Failed to set variation for object " .. p_Command.gameObjectTransferData.guid)
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		variation = p_Command.gameObjectTransferData.variation
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = "SetVariation",
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, ActionResultType.Success
end

function CommandActions:SetEBXField(p_Command)
	if (p_Command.gameObjectTransferData == nil) then
		m_Logger:Error("The SetEBXFieldCommand needs to have a valid gameObjectTransferData set.")
		return
	end
	local s_Result = nil

	if(p_Command.gameObjectTransferData.guid) then -- Override only this instance
		local s_GameObject = GameObjectManager:GetGameObject(p_Command.gameObjectTransferData.guid)
		if(not s_GameObject) then
			m_Logger:Warning('Could not find GameObject: ' .. p_GameObjectGuid)
			return nil, ActionResultType.Failure
		end
		s_Result = GameObject:SetOverrides(p_Command.gameObjectTransferData.overrides)
	else
		--s_Result = EBXManager:SetFields(nil, p_Command.gameObjectTransferData.overrides)
	end

	if (s_Result == false) then
		m_Logger:Error("Failed to set field: " .. p_Command.gameObjectTransferData.overrides.type .. p_Command.gameObjectTransferData.overrides.field)
		return nil, ActionResultType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		overrides = p_Command.gameObjectTransferData.overrides
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = "SetField",
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, ActionResultType.Success
end
return CommandActions
