class 'EditorServer'

function EditorServer:__init()
    print("Initializing EditorServer")
    self:RegisterVars()
end

function EditorServer:RegisterVars()
    self.m_PendingRaycast = false

    self.m_Commands = {
        SpawnBlueprintCommand = Backend.SpawnBlueprint,
        DestroyBlueprintCommand = Backend.DestroyBlueprint,
        SetTransformCommand = Backend.SetTransform,
        SelectGameObjectCommand = Backend.SelectGameObject,
        CreateGroupCommand = Backend.CreateGroup
    }

    self.m_Queue = {};

    self.m_Transactions = {}
    self.m_GameObjects = {}
end

function EditorServer:OnRequestUpdate(p_Player, p_TransactionId)

    local s_TransactionId = p_TransactionId
    local s_UpdatedGameObjects = {}
    print("Backend:")
    print(self.m_GameObjects)
    while(s_TransactionId <= #self.m_Transactions) do
        local s_Guid = self.m_Transactions[s_TransactionId]
        if(s_Guid ~= nil) then
            s_UpdatedGameObjects[s_Guid] = self.m_GameObjects[s_Guid]
            s_TransactionId = s_TransactionId + 1
        else
            print("shit's nil")
        end
    end
    NetEvents:SendToLocal("MapEditorClient:ReceiveUpdate", p_Player, s_UpdatedGameObjects)
end


function EditorServer:OnReceiveCommand(p_Player, p_Command)
    local s_Command = self:DecodeParams(json.decode(p_Command))
    local s_Function = self.m_Commands[s_Command.type]
    if(s_Function == nil) then
        print("Attempted to call a nil function: " .. s_Command.type)
        return false
    end
    local s_Response = s_Function(self, s_Command)
    if(s_Response == false) then
        -- TODO: Handle errors
        print("error")
        return
    end
    if(s_Response == "queue") then
        print("Queued command")
        table.insert(self.m_Queue, s_Command)
        return
    end
    if(s_Response.userData == nil) then
        print("MISSING USERDATA!")
    end
    self.m_GameObjects[s_Command.guid] = MergeUserdata(self.m_GameObjects[s_Command.guid], s_Response.userData)
    table.insert(self.m_Transactions, tostring(s_Command.guid)) -- Store that this transaction has happened.

    NetEvents:BroadcastLocal("MapEditor:ReceiveCommand", p_Command)
    print("Sent!")

end

function EditorServer:OnUpdatePass(p_Delta, p_Pass)
    if(p_Pass ~= UpdatePass.UpdatePass_PreSim or #self.m_Queue == 0) then
        return
    end

    for k,l_Command in ipairs(self.m_Queue) do
        l_Command.queued = true
        print("Executing command delayed: " .. l_Command.type)
        self:OnReceiveCommand(json.encode(self:EncodeParams(l_Command)))
    end
    if(#self.m_Queue > 0) then
        self.m_Queue = {}
    end
end

function MergeUserdata(p_Old, p_New)
    if(p_Old == nil) then
        return p_New
    end
    for k,v in pairs(p_New) do
        p_Old[k] = v
    end
    return p_Old
end

function EditorServer:DecodeParams(p_Table)
    for s_Key, s_Value in pairs(p_Table) do
        if s_Key == 'transform' then
            local s_LinearTransform = LinearTransform(
                    Vec3(s_Value.left.x, s_Value.left.y, s_Value.left.z),
                    Vec3(s_Value.up.x, s_Value.up.y, s_Value.up.z),
                    Vec3(s_Value.forward.x, s_Value.forward.y, s_Value.forward.z),
                    Vec3(s_Value.trans.x, s_Value.trans.y, s_Value.trans.z))

            p_Table[s_Key] = s_LinearTransform

        elseif type(s_Value) == "table" then
            self:DecodeParams(s_Value)
        end

    end

    return p_Table
end

function EditorServer:EncodeParams(p_Table)
    if(p_Table == nil) then
        error("Passed a nil table?!")
    end
    for s_Key, s_Value in pairs(p_Table) do
        if s_Key == 'transform' then
            p_Table[s_Key] = tostring(s_Value)

        elseif type(s_Value) == "table" then
            self:EncodeParams(s_Value)
        end

    end

    return p_Table
end

return EditorServer()