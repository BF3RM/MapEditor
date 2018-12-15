class 'Backend'



local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10000

function Backend:__init(p_Realm)
    print("Initializing Backend")
    self:RegisterVars()
end

function Backend:RegisterVars()
    self.m_Queue = {};
end



function Backend:OnLevelDestroy()
    ObjectManager:Clear()

end


function Backend:SpawnBlueprint(p_Command)
    local s_UserData = p_Command.userData
    local s_SpawnResult = ObjectManager:SpawnBlueprint(s_UserData.guid, s_UserData.reference.partitionGuid, s_UserData.reference.instanceGuid, s_UserData.transform, s_UserData.variation)

    if(s_SpawnResult == false) then
        -- Send error to webui
        print("Failed to spawn blueprint. ")

        return false
    end

    local s_Children = {}
    for k,l_Entity in ipairs(s_SpawnResult) do
        local s_Data = l_Entity.data
        local s_Entity = SpatialEntity(l_Entity)

        s_Children[#s_Children + 1 ] = {
            guid = s_Entity.uniqueID,
            type = l_Entity.typeInfo.name,
            transform = tostring(ToLocal(s_Entity.aabbTransform, s_UserData.transform)),
            aabb = {
                min = tostring(s_Entity.aabb.min),
                max = tostring(s_Entity.aabb.max),
                trans = tostring(ToLocal(s_Entity.aabbTransform, s_UserData.transform))
            },
            reference = {

                instanceGuid = tostring(s_Data.instanceGuid),
                --partitionGuid = tostring(s_Data.instanceGuid),
                type = s_Data.typeInfo.name
                -- transform?
            }
        }
    end

    local s_Response = {
        guid = s_UserData.guid,
        sender = p_Command.sender,
        name = s_UserData.name,
        ['type'] = 'SpawnedBlueprint',
        userData = s_UserData,
        children = s_Children
    }

    return s_Response
end


function Backend:DestroyBlueprint(p_Command)

    --TODO: not hack this
    if(p_Command.queued == nil) then
        return "queue";
    end

    local s_Result = ObjectManager:DestroyEntity(p_Command.guid)

    if(s_Result == false) then
        print("Failed to destroy entity: " .. p_Command.guid)
    end
    local s_Response = {
        type = "DestroyedBlueprint",
        guid =  p_Command.guid
    }

    return s_Response
end


function Backend:SelectGameObject(p_Command)

    if ( ObjectManager:GetEntityByGuid(p_Command.guid) == nil) then
        return false
    end
    local s_Response = {
        guid = p_Command.guid,
        ['type'] = 'SelectedGameObject'
    }
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
    local s_Result = ObjectManager:SetTransform(p_Command.guid, p_Command.userData.transform)

    if(s_Result == false) then
        -- Notify WebUI of failed
        print("failed")
        return false
    end

    local s_Response = {
        type = "SetTransform",
        guid = p_Command.guid,
        transform = p_Command.userData.transform
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

function ToLocal(a,b)
    local LT = LinearTransform()
    LT.left = a.left
    LT.up = a.up
    LT.forward = a.forward
    LT.trans.x = a.trans.x - b.trans.x -- attempt to index a nil value (field 'trans')
    LT.trans.y = a.trans.y - b.trans.y
    LT.trans.z = a.trans.z - b.trans.z
    return LT
end

function Backend:DecodeParams(p_Table)
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

function Backend:EncodeParams(p_Table)
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
return Backend()