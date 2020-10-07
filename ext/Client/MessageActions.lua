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
    self.PreviewMoveMessage = self.PreviewMove
	self.GetProjectsMessage = self.GetProjects
	self.TeleportMouseMessage = self.TeleportMouse
end
function MessageActions:GetProjects(p_Message)
	NetEvents:SendLocal('GetProjectHeaders')
end
function MessageActions:MoveObject(p_Message)
    local gameObjectTransferData = p_Message.gameObjectTransferData

    if (gameObjectTransferData == nil) then
        m_Logger:Error("gameObjectTransferData has to be set on MoveObject.")
        return
    end

    local s_Result = GameObjectManager:SetTransform(gameObjectTransferData.guid, gameObjectTransferData.transform, false)

    if s_Result == true then
        return ActionResultType.Success
    else
        return ActionResultType.Failure
    end
end

function MessageActions:SetViewMode(p_Message)
    local p_WorldRenderSettings = ResourceManager:GetSettings("WorldRenderSettings")

    if p_WorldRenderSettings ~= nil then
        local s_WorldRenderSettings = WorldRenderSettings(p_WorldRenderSettings)
        s_WorldRenderSettings.viewMode = p_Message.viewMode
        return ActionResultType.Success
    else
        m_Logger:Error("Failed to get WorldRenderSettings")
        return ActionResultType.Failure
    end
end

function MessageActions:SetScreenToWorldPosition(p_Message)
    Editor:SetPendingRaycast(RaycastType.Mouse, p_Message.direction)
    return ActionResultType.Success
end

function MessageActions:PreviewSpawn(p_Message, p_Arguments)
    local s_GameObjectTransferData = p_Message.gameObjectTransferData

    if (s_GameObjectTransferData == nil) then
        m_Logger:Error("gameObjectTransferData must be set on PreviewSpawn")
    end

    local s_Result = GameObjectManager:InvokeBlueprintSpawn(s_GameObjectTransferData.guid,
                                                               "previewSpawn",
                                                               s_GameObjectTransferData.blueprintCtrRef.partitionGuid,
                                                               s_GameObjectTransferData.blueprintCtrRef.instanceGuid,
                                                               nil,
                                                               s_GameObjectTransferData.transform,
                                                               s_GameObjectTransferData.variation,
                                                                true)

    if s_Result == false then
        return ActionResultType.Failure
    else
        return ActionResultType.Success
    end
end

function MessageActions:PreviewDestroy(p_Message, p_UpdatePass)
    if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return ActionResultType.Queue
    end

    local s_gameObjectTransferData = p_Message.gameObjectTransferData

    if (s_gameObjectTransferData == nil) then
        m_Logger:Error("gameObjectTransferData must be set on PreviewDestroy")
    end

    local s_Result = GameObjectManager:DeleteGameObject(s_gameObjectTransferData.guid)

    if s_Result == false then
        return ActionResultType.Failure
    else
        return ActionResultType.Success
    end
end

function MessageActions:PreviewMove(p_Message)
    local s_gameObjectTransferData = p_Message.gameObjectTransferData

    if (s_gameObjectTransferData == nil) then
        m_Logger:Error("gameObjectTransferData must be set on PreviewMove")
    end

    local s_Result = GameObjectManager:SetTransform(gameObjectTransferData.guid, s_gameObjectTransferData.transform, false)

    if s_Result == false then
        return ActionResultType.Failure
    else
        return ActionResultType.Success
    end
end
function MessageActions:TeleportMouse(p_Message)
	print(p_Message)
	local newCoords = p_Message.coordinates
	if(p_Message.direction == "right") then
		newCoords.x = ClientUtils:GetWindowSize().x - 5;
	end
	if(p_Message.direction == "left") then
		newCoords.x = 5;
	end
	InputManager:SetCursorPosition(newCoords.x, newCoords.y)
	return ActionResultType.Success
end
return MessageActions()
