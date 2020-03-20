class 'ClientTransactionManager'

local m_Logger = Logger("ClientTransactionManager", true)

function ClientTransactionManager:__init()
    m_Logger:Write("Initializing ClientTransactionManager")

    self:RegisterVars()
    self:RegisterEvents()
end

function ClientTransactionManager:RegisterVars()
    self.m_Queue = {
        commands = {},
        messages = {}
    };

    self.m_TransactionId = 0
    --self.m_GameObjectTransferDatas = {}
    self.m_CommandActionResults = {}
    self.m_ExecutedCommandActions = {}
end

function ClientTransactionManager:RegisterEvents()
    Events:Subscribe('GameObjectManager:GameObjectReady', self, self.OnGameObjectReady)

    NetEvents:Subscribe('ServerTransactionManager:UpdateTransactionId', self, self.OnUpdateTransactionId)
    NetEvents:Subscribe('ServerTransactionManager:CommandsInvoked', self, self.OnServerCommandsInvoked)
    NetEvents:Subscribe('ServerTransactionManager:SyncClientContext', self, self.OnSyncClientContext)
end

function ClientTransactionManager:OnEngineMessage(p_Message)
    if p_Message.type == MessageType.ClientCharacterLocalPlayerSetMessage then
        local s_LocalPlayer = PlayerManager:GetLocalPlayer()

        if s_LocalPlayer == nil then
            m_Logger:Error("Local player is nil")
            return
        end

        --- Client requests all updates that the server has.
        NetEvents:SendLocal("ClientTransactionManager:RequestSync", self.m_TransactionId)
    end
end

-- We're recreating commands that lead to the current state of the server, so the client's GameObjects and UI gets updated properly
-- Not a pretty solution, but the only way to avoid having a complicated command storing and updating logic on the server (which would probably still be better)
function ClientTransactionManager:OnSyncClientContext(p_UpdatedGameObjectTransferDatas)
    local s_Commands = {}

    for s_Guid, s_GameObjectTransferData in pairs(p_UpdatedGameObjectTransferDatas) do
        local s_Command
        local s_GameObject = ClientGameObjectManager:GetGameObject(s_Guid)

        if (s_GameObject == nil) then
            if (s_GameObjectTransferData ~= nil and s_GameObjectTransferData.isDeleted == false) then
                s_Command = {
                    type = "SpawnBlueprintCommand",
                    gameObjectTransferData = s_GameObjectTransferData
                }

                table.insert(s_Commands, s_Command)
            else
                m_Logger:Error("Object desynced: " .. tostring(s_Guid))
            end
        else
            if (s_GameObjectTransferData == nil or s_GameObjectTransferData.isDeleted == true) then
                s_Command = {
                    type = "DeleteBlueprintCommand",
                    gameObjectTransferData = {
                        guid = s_Guid
                    }
                }

                table.insert(s_Commands, s_Command)
            elseif (s_GameObject.isDeleted == true and s_GameObjectTransferData.isDeleted == false) then
                s_Command = {
                    type = "UndeleteBlueprintCommand",
                    gameObjectTransferData = s_GameObjectTransferData
                }

                table.insert(s_Commands, s_Command)
            else
                local s_ComparisonGameObjectTransferData = s_GameObject:GetGameObjectTransferData()
                local s_Changes = GetChanges(s_ComparisonGameObjectTransferData, s_GameObjectTransferData)

                for _, change in ipairs(s_Changes) do
                    local s_Command

                    if change == "transform" then
                        s_Command = {
                            type = "SetTransformCommand",
                            gameObjectTransferData = s_GameObjectTransferData
                        }
                    elseif change == "isEnabled" then
                        if (s_GameObjectTransferData.isEnabled) then
                            s_Command = {
                                type = "EnableBlueprintCommand",
                                gameObjectTransferData = {
                                    guid = s_Guid
                                }
                            }
                        else
                            s_Command = {
                                type = "DisableBlueprintCommand",
                                gameObjectTransferData = {
                                    guid = s_Guid
                                }
                            }
                        end
                    elseif change == "variation" then
                        s_Command = {
                            type = "SetVariationCommand",
                            gameObjectTransferData = {
                                guid = s_Guid,
                                variation = s_GameObjectTransferData.variation
                            }
                        }
                    elseif change == "name" then
                        s_Command = {
                            type = "SetObjectNameCommand",
                            gameObjectTransferData = {
                                guid = s_Guid,
                                name = s_GameObjectTransferData.name
                            }
                        }
                    elseif change == "gameEntities" then
                        m_Logger:Write("Before: ")
                        m_Logger:WriteTable(s_ComparisonGameObjectTransferData.gameEntities)
                        m_Logger:Write("--------------")

                        m_Logger:Write("Updated Game Entities: ")
                        m_Logger:WriteTable(s_GameObjectTransferData.gameEntities)
                        m_Logger:Write("--------------")

                    elseif change == "parentData" then
                        -- TODO: add this when changing parent data is implemented
                    elseif change == "name" then
                        -- TODO: add this when changing name is implemented on lua
                    else
                        m_Logger:Error("Found an unhandled change: "..change)
                    end

                    table.insert(s_Commands, s_Command)
                end
            end
        end
    end

    self:ExecuteCommands(s_Commands, nil)
end

function ClientTransactionManager:OnUpdatePass(p_Delta, p_Pass)
    if(p_Pass ~= UpdatePass.UpdatePass_PreSim or (#self.m_Queue.commands == 0 and #self.m_Queue.messages == 0)) then
        return
    end

    local s_Commands = {}

    for _,l_Command in ipairs(self.m_Queue.commands) do
        m_Logger:Write("Executing command in the correct UpdatePass: " .. l_Command.type)
        table.insert(s_Commands, l_Command)
    end

    self:ExecuteCommands(s_Commands, p_Pass)

    local s_Messages = {}

    for _,l_Message in ipairs(self.m_Queue.messages) do
        m_Logger:Write("Executing message in the correct UpdatePass: " .. l_Message.type)
        table.insert(s_Messages, l_Message)
    end

    self:ExecuteMessages(s_Messages, true, p_Pass)

    if(#self.m_Queue.commands > 0) then
        self.m_Queue.commands = {}
    end

    if(#self.m_Queue.messages > 0) then
        self.m_Queue.messages = {}
    end
end

function ClientTransactionManager:OnServerCommandsInvoked(p_CommandsJson)
    local s_Commands = DecodeParams(json.decode(p_CommandsJson))

    self:ExecuteCommands(s_Commands, nil)
end

function ClientTransactionManager:ExecuteCommands(p_Commands, p_UpdatePass)
    local s_CommandActionResults = {}
    for _, l_Command in ipairs(p_Commands) do
        local s_CommandAction = CommandActions[l_Command.type]
        if(s_CommandAction == nil) then
            m_Logger:Error("Attempted to call a nil command action: " .. l_Command.type)
            return false
        end

        local s_CommandActionResult, s_ActionResultType = s_CommandAction(self, l_Command, p_UpdatePass)

        if (s_ActionResultType == ActionResultType.Success) then
            if (s_CommandActionResult.gameObjectTransferData == nil) then
                m_Logger:Error("There must be a gameObjectTransferData defined for sending back the CommandActionResult.")
            end

            local s_GameObjectTransferData = s_CommandActionResult.gameObjectTransferData

            -- Spawned objects are sent when they are ready on OnGameObjectReady
            if l_Command.type ~= "SpawnBlueprintCommand" then
                table.insert(s_CommandActionResults, s_CommandActionResult)
            end

            local s_Guid = s_GameObjectTransferData.guid
            -- TODO: Dont store all gameobjecttransferdatas, we have the gameobjectmanager.gameobjects for that.
            --self.m_GameObjectTransferDatas[s_Guid] = MergeGameObjectTransferData(self.m_GameObjectTransferDatas[s_Guid], s_GameObjectTransferData) -- overwrite our table with gameObjectTransferDatas so we have the current most version

        elseif (s_ActionResultType == ActionResultType.Queue) then
            m_Logger:Write("Queued command: " .. l_Command.type)
            table.insert(self.m_Queue.commands, l_Command)
        elseif (s_ActionResultType == ActionResultType.Failure) then
            -- TODO: Handle errors
            m_Logger:Warning("Failed to execute command: " .. l_Command.type)
        else
            m_Logger:Error("Unknown ActionResultType for command: " .. l_Command.type)
        end
    end

    if(#s_CommandActionResults > 0) then
        --WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(s_CommandActionResults)))
        WebUpdater:AddUpdate('HandleResponse', s_CommandActionResults)
        table.insert(self.m_ExecutedCommandActions, json.encode(s_CommandActionResults))
    end
end
function ClientTransactionManager:GetExecutedCommandActions()
	return self.m_ExecutedCommandActions
end
function ClientTransactionManager:OnReceiveMessages(p_Messages)
    self:ExecuteMessages(p_Messages, nil, nil)
end

function ClientTransactionManager:ExecuteMessages(p_Messages, p_Raw, p_UpdatePass)
    local s_Messages = p_Messages
    if p_Raw == nil then
        s_Messages = DecodeParams(json.decode(p_Messages))
    end

    for _, l_Message in ipairs(s_Messages) do

        local s_MessageAction = MessageActions[l_Message.type]
        if(s_MessageAction == nil) then
            m_Logger:Error("Attempted to call a nil function: " .. l_Message.type)
            return false
        end

        local s_ActionResultType = s_MessageAction(self, l_Message, p_UpdatePass)

        if (s_ActionResultType == ActionResultType.Success) then
            return

        elseif (s_ActionResultType == ActionResultType.Queue) then
            table.insert(self.m_Queue.messages, l_Message)

        elseif (s_ActionResultType == ActionResultType.Failure) then
            m_Logger:Error("Failed to get a valid return for executing message: " .. tostring(l_Message.type))

        else
            m_Logger:Error("Unknown ActionResultType for message: " .. l_Message.type)
        end
    end
end

function ClientTransactionManager:OnUpdateTransactionId(p_TransactionId)
    if p_TransactionId < self.m_TransactionId then
        m_Logger:Error("Client's transaction id is greater than the server's. This should never happen.")
        return
    end

    --- Desync should only happen when a player first loads in (transactionId is 0), otherwise we fucked up.
    if p_TransactionId ~= self.m_TransactionId and self.m_TransactionId ~= 0 then
        m_Logger:Warning("Client is desynced, syncing it. This should rarely happen, did the client hung up? network problem? Please report it on the repo.")
    end

    self.m_TransactionId = p_TransactionId
end

function ClientTransactionManager:CreateCommandActionResultsRecursively(p_GameObject)
    local s_GameObjectTransferData = p_GameObject:GetGameObjectTransferData()

    local s_CommandActionResult = {
        sender = p_GameObject.creatorName,
        type = 'SpawnedBlueprint',
        gameObjectTransferData = s_GameObjectTransferData,
    }

    for _, s_ChildGameObject in pairs(p_GameObject.children) do
        self:CreateCommandActionResultsRecursively(s_ChildGameObject)
    end

    table.insert(self.m_CommandActionResults, s_CommandActionResult)
end

function ClientTransactionManager:OnGameObjectReady(p_GameObject)
    --m_Logger:Write("ClientTransactionManager:OnGameObjectReady(p_GameObject)")
    self:CreateCommandActionResultsRecursively(p_GameObject)

    if(#self.m_CommandActionResults > 0) then
        --m_Logger:Write("Sending stuff to JS")
        --WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(self.m_CommandActionResults)))
        WebUpdater:AddUpdate('HandleResponse', self.m_CommandActionResults)
		table.insert(self.m_ExecutedCommandActions, json.encode(self.m_CommandActionResults))
    else
        m_Logger:Error("OnGameObjectReady: No results were yielded for some reason")
    end

    self.m_CommandActionResults = { }
end

function ClientTransactionManager:OnSendCommandsToServer(p_Commands)
    NetEvents:SendLocal('ClientTransactionManager:InvokeCommands', p_Commands)
end

return ClientTransactionManager()
