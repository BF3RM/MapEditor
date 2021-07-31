class 'MessageActions'

local m_Logger = Logger("MessageActions", true)

function MessageActions:__init()
	m_Logger:Write("Initializing MessageActions")
	self:RegisterVars()
end

function MessageActions:RegisterVars()
	m_Logger:Write("Initialized vars")

	self.MoveObjectMessage = self.MoveObject
	self.SetViewModeMessage = self.SetViewMode
	self.SetScreenToWorldPositionMessage = self.SetScreenToWorldPosition
	self.PreviewSpawnMessage = self.PreviewSpawn
	self.PreviewDestroyMessage = self.PreviewDestroy
	self.GetProjectsMessage = self.GetProjects
	self.TeleportMouseMessage = self.TeleportMouse
	self.RequestSaveProjectMessage = self.RequestSaveProject
	self.RequestLoadProjectMessage = self.RequestLoadProject
	self.RequestDeleteProjectMessage = self.RequestDeleteProject
	self.RequestProjectDataMessage = self.RequestProjectData
	self.RequestImportProjectMessage = self.RequestImportProject
end

function MessageActions:GetProjects(p_Message)
	NetEvents:SendLocal('GetProjectHeaders')
	return CARResponseType.Success
end

function MessageActions:RequestLoadProject(p_Message)
	m_Logger:Write("Load requested: " .. p_Message.projectId)
	NetEvents:SendLocal("ProjectManager:RequestProjectLoad", p_Message.projectId)
	return CARResponseType.Success
end

function MessageActions:RequestImportProject(p_Message)
	m_Logger:Write("Importing requested")
	NetEvents:SendLocal("ProjectManager:RequestProjectImport", p_Message.projectDataJSON)
	return CARResponseType.Success
end

function MessageActions:RequestDeleteProject(p_Message)
	m_Logger:Write("Delete requested: " .. p_Message.projectId)
	NetEvents:SendLocal("ProjectManager:RequestProjectDelete", p_Message.projectId)
	return CARResponseType.Success
end

function MessageActions:RequestProjectData(p_Message)
	m_Logger:Write("Project Data requested: " .. p_Message.projectId)
	NetEvents:SendLocal("ProjectManager:RequestProjectData", p_Message.projectId)
	return CARResponseType.Success
end

function MessageActions:MoveObject(p_Message)
	local s_GameObjectTransferData = p_Message.gameObjectTransferData

	if s_GameObjectTransferData == nil then
		m_Logger:Error("gameObjectTransferData has to be set on MoveObject.")
		return
	end

	local s_Result = GameObjectManager:SetTransform(s_GameObjectTransferData.guid, s_GameObjectTransferData.transform, false)

	if s_Result == true then
		return CARResponseType.Success
	else
		return CARResponseType.Failure
	end
end

function MessageActions:RequestSaveProject(p_Message)
	local s_ProjectHeaderData = DecodeParams(json.decode(p_Message.projectHeaderJSON))

	if s_ProjectHeaderData then
		NetEvents:SendLocal("ProjectManager:RequestProjectSave", s_ProjectHeaderData)
		return CARResponseType.Success
	else
		return CARResponseType.Failure
	end
end

function MessageActions:SetViewMode(p_Message)
	local s_WorldRenderSettings = ResourceManager:GetSettings("WorldRenderSettings")

	if s_WorldRenderSettings ~= nil then
		s_WorldRenderSettings = WorldRenderSettings(s_WorldRenderSettings)
		s_WorldRenderSettings.viewMode = p_Message.viewMode
		return CARResponseType.Success
	else
		m_Logger:Error("Failed to get WorldRenderSettings")
		return CARResponseType.Failure
	end
end

function MessageActions:SetScreenToWorldPosition(p_Message)
	Editor:SetPendingRaycast(RaycastType.Mouse, p_Message.direction)
	return CARResponseType.Success
end

function MessageActions:PreviewSpawn(p_Message, p_Arguments)
	local s_GameObjectTransferData = p_Message.gameObjectTransferData

	if s_GameObjectTransferData == nil then
		m_Logger:Error("gameObjectTransferData must be set on PreviewSpawn")
	end

	local s_Result = GameObjectManager:InvokeBlueprintSpawn(s_GameObjectTransferData.guid,
															"previewSpawn",
															s_GameObjectTransferData.blueprintCtrRef.partitionGuid,
															s_GameObjectTransferData.blueprintCtrRef.instanceGuid,
															nil,
															s_GameObjectTransferData.transform,
															s_GameObjectTransferData.variation,
															true, s_GameObjectTransferData.overrides
	)

	if s_Result == false then
		return CARResponseType.Failure
	else
		return CARResponseType.Success
	end
end

function MessageActions:PreviewDestroy(p_Message, p_UpdatePass)
	if p_UpdatePass ~= UpdatePass.UpdatePass_PreSim then
		return CARResponseType.Queue
	end

	local s_GameObjectTransferData = p_Message.gameObjectTransferData

	if s_GameObjectTransferData == nil then
		m_Logger:Error("gameObjectTransferData must be set on PreviewDestroy")
	end

	local s_Result = GameObjectManager:DeleteGameObject(s_GameObjectTransferData.guid)

	if s_Result == false then
		return CARResponseType.Failure
	else
		return CARResponseType.Success
	end
end

function MessageActions:TeleportMouse(p_Message)
	m_Logger:Write(p_Message)
	local s_NewCoords = p_Message.coordinates

	if p_Message.direction == "right" then
		s_NewCoords.x = ClientUtils:GetWindowSize().x - 5;
	end

	if p_Message.direction == "left" then
		s_NewCoords.x = 5;
	end

	InputManager:SetCursorPosition(s_NewCoords.x, s_NewCoords.y)
	return CARResponseType.Success
end

return MessageActions()
