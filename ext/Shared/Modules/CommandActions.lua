---@class CommandActions
CommandActions = class 'CommandActions'

---@type Logger
local m_Logger = Logger("CommandActions", false)

---@param p_Realm Realm|integer
function CommandActions:__init(p_Realm)
	m_Logger:Write("Initializing CommandActions: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
	self:RegisterVars()
end

function CommandActions:RegisterVars()
	m_Logger:Write("Initialized vars")

	self.SpawnGameObjectCommand = self.SpawnGameObject
	self.DeleteGameObjectCommand = self.DeleteGameObject
	self.UndeleteGameObjectCommand = self.UndeleteGameObject
	self.SetTransformCommand = self.SetTransform
	self.SelectGameObjectCommand = self.SelectGameObject
	self.EnableGameObjectCommand = self.EnableGameObject
	self.DisableGameObjectCommand = self.DisableGameObject
	self.SetVariationCommand = self.SetVariation
	self.SetEBXFieldCommand = self.SetEBXField
end

function CommandActions:SpawnGameObject(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The SpawnGameObjectCommand needs to have a valid gameObjectTransferData set.")
		return nil, CARResponseType.Failure
	end

	if p_UpdatePass ~= UpdatePass.UpdatePass_PreSim then
		return nil, CARResponseType.Queue
	end

	local s_GameObjectTransferData = p_Command.gameObjectTransferData

	-- Set parentData to root if parentData is vanilla
	local s_VanillaGameObjectGuids = GameObjectManager:GetVanillaGameObjectsGuids()

	if s_VanillaGameObjectGuids[tostring(s_GameObjectTransferData.parentData.guid)] then
		s_GameObjectTransferData.parentData = GameObjectParentData:GetRootParentData()
	end

	local s_SpawnResult = GameObjectManager:InvokeBlueprintSpawn(s_GameObjectTransferData.guid,
																p_Command.sender,
																s_GameObjectTransferData.blueprintCtrRef.partitionGuid,
																s_GameObjectTransferData.blueprintCtrRef.instanceGuid,
																s_GameObjectTransferData.parentData,
																s_GameObjectTransferData.transform,
																s_GameObjectTransferData.variation,
																false,
																s_GameObjectTransferData.overrides
	)

	if s_SpawnResult == false then
		-- Send error to webui
		m_Logger:Write("Failed to spawn blueprint.")
		return nil, CARResponseType.Failure
	end

	local s_ResultGameObjectTransferData = {
		guid = s_GameObjectTransferData.guid,
		name = s_GameObjectTransferData.name,
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.SpawnedGameObject,
		gameObjectTransferData = s_ResultGameObjectTransferData,
	}

	return s_CommandActionResult, CARResponseType.Success
end

function CommandActions:DeleteGameObject(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The DestroyBlueprint needs to have a valid gameObjectTransferData set.")
		return nil, CARResponseType.Failure
	end

	if p_UpdatePass ~= UpdatePass.UpdatePass_PreSim then
		return nil, CARResponseType.Queue
	end

	local s_Result = GameObjectManager:DeleteGameObject(p_Command.gameObjectTransferData.guid)

	if s_Result == false then
		m_Logger:Write("Failed to destroy entity: " .. p_Command.gameObjectTransferData.guid)
		return nil, CARResponseType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		isDeleted = true
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.DeletedGameObject,
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, CARResponseType.Success
end

function CommandActions:UndeleteGameObject(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The UndeleteGameObject needs to have a valid gameObjectTransferData set.")
		return
	end

	if p_UpdatePass ~= UpdatePass.UpdatePass_PreSim then
		return nil, CARResponseType.Queue
	end

	m_Logger:Write("UndeleteGameObject with guid " .. p_Command.gameObjectTransferData.guid)

	if SanitizeEnum(p_Command.gameObjectTransferData.origin) ~= GameObjectOriginType.Vanilla then
		return CommandActions:SpawnGameObject(p_Command, p_UpdatePass)
	end

	local s_Result = GameObjectManager:UndeleteGameObject(p_Command.gameObjectTransferData.guid)

	local s_GameObjectTransferData = GameObjectManager.m_GameObjects[p_Command.gameObjectTransferData.guid]:GetGameObjectTransferData()

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.UndeletedGameObject,
		gameObjectTransferData = s_GameObjectTransferData,
	}

	if s_Result == false then
		m_Logger:Write("Failed to undelete blueprint: " .. p_Command.gameObjectTransferData.guid)
		return nil, CARResponseType.Failure
	end

	return s_CommandActionResult, CARResponseType.Success
end

function CommandActions:EnableGameObject(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The EnableGameObject needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = GameObjectManager:EnableGameObject(p_Command.gameObjectTransferData.guid)

	if s_Result == false then
		m_Logger:Write("Failed to enable blueprint: " .. p_Command.gameObjectTransferData.guid)
		return nil, CARResponseType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		isEnabled = true
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.EnabledGameObject,
		gameObjectTransferData = s_GameObjectTransferData,
	}

	return s_CommandActionResult, CARResponseType.Success
end

function CommandActions:DisableGameObject(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The DisableGameObject needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = GameObjectManager:DisableGameObject(p_Command.gameObjectTransferData.guid)

	if s_Result == false then
		m_Logger:Error("Failed to disable blueprint: " .. p_Command.gameObjectTransferData.guid)
		return nil, CARResponseType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		isEnabled = false
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.DisabledGameObject,
		gameObjectTransferData = s_GameObjectTransferData,
	}

	return s_CommandActionResult, CARResponseType.Success
end

function CommandActions:SelectGameObject(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The SelectGameObject needs to have a valid gameObjectTransferData set.")
		return
	end

	if GameObjectManager:GetGameObject(p_Command.gameObjectTransferData.guid) == nil then
		m_Logger:Write("Failed to select that gameobject")
		return nil, CARResponseType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.SelectedGameObject,
		gameObjectTransferData = s_GameObjectTransferData,
	}

	return s_CommandActionResult, CARResponseType.Success
end

function CommandActions:SetTransform(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The SetTransform needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = GameObjectManager:SetTransform(p_Command.gameObjectTransferData.guid, p_Command.gameObjectTransferData.transform, true)

	if s_Result == false then
		m_Logger:Write("Failed to set transform for object " .. p_Command.gameObjectTransferData.guid)
		return nil, CARResponseType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		transform = p_Command.gameObjectTransferData.transform
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.SetTransform,
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, CARResponseType.Success
end


function CommandActions:SetVariation(p_Command, p_UpdatePass)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The SetTransform needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result = GameObjectManager:SetVariation(p_Command.gameObjectTransferData.guid, p_Command.gameObjectTransferData.variation)

	if s_Result == false then
		m_Logger:Error("Failed to set variation for object " .. p_Command.gameObjectTransferData.guid)
		return nil, CARResponseType.Failure
	end

	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		variation = p_Command.gameObjectTransferData.variation
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.SetVariation,
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, CARResponseType.Success
end

function CommandActions:SetEBXField(p_Command)
	if p_Command.gameObjectTransferData == nil then
		m_Logger:Error("The SetEBXFieldCommand needs to have a valid gameObjectTransferData set.")
		return
	end

	local s_Result, s_Path = nil, nil

	if p_Command.gameObjectTransferData.guid then -- Override only this instance
		local s_GameObject = GameObjectManager:GetGameObject(p_Command.gameObjectTransferData.guid)

		if not s_GameObject then
			m_Logger:Warning('Could not find GameObject: ' .. p_Command.gameObjectTransferData.guid)
			return nil, CARResponseType.Failure
		end

		s_Result, s_Path = s_GameObject:SetOverrides(p_Command.gameObjectTransferData.overrides)
	else
		--s_Result = EBXManager:SetFields(nil, p_Command.gameObjectTransferData.overrides)
	end

	if s_Result == false then
		m_Logger:Error("Failed to set field: " .. p_Command.gameObjectTransferData.overrides.type .. p_Command.gameObjectTransferData.overrides.field)
		return nil, CARResponseType.Failure
	end

	p_Command.gameObjectTransferData.overrides.path = s_Path
	local s_GameObjectTransferData = {
		guid = p_Command.gameObjectTransferData.guid,
		overrides = p_Command.gameObjectTransferData.overrides
	}

	local s_CommandActionResult = {
		sender = p_Command.sender,
		type = CARType.SetField,
		gameObjectTransferData = s_GameObjectTransferData
	}

	return s_CommandActionResult, CARResponseType.Success
end

if SharedUtils:IsClientModule() then
	CommandActions = CommandActions(Realm.Realm_Client)
else
	CommandActions = CommandActions(Realm.Realm_ClientAndServer)
end

return CommandActions
