class 'Backend'



local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10000

function Backend:__init(p_Realm)
    print("Initializing Backend: " .. tostring(p_Realm))
    self.m_Realm = p_Realm;
    self:RegisterVars()
end

function Backend:RegisterVars()
    self.m_Queue = {}
    print("Initialized vars")
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
        print(s_Entity.transform)
        s_Children[#s_Children + 1 ] = {
            guid = s_Entity.uniqueID,
            type = l_Entity.typeInfo.name,
            transform = tostring(ToLocal(s_Entity.transform, s_UserData.transform)),
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
    print(s_Response)
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
        userData = nil,
        guid =  p_Command.guid
    }
    return s_Response

end


function Backend:SelectGameObject(p_Command)

    if ( ObjectManager:GetEntityByGuid(p_Command.guid) == nil) then
        print("Failed to select that gameobject")
        return false
    end
    local s_Response = {
        guid = p_Command.guid,
        ['type'] = 'SelectedGameObject'
    }
    print("Selected!")

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
    local s_Result = ObjectManager:SetTransform(p_Command.guid, p_Command.userData.transform, true)

    if(s_Result == false) then
        -- Notify WebUI of failed
        print("failed")
        return false
    end

    local s_Response = {
        type = "SetTransform",
        guid = p_Command.guid,
        userData = {
            transform = p_Command.userData.transform
        }
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

function ToLocal(parentWorld, s_local)
    local LT = LinearTransform()


    LT.left = Vec3( parentWorld.left.x    / s_local.left.x,  parentWorld.left.y    / s_local.left.x,  parentWorld.left.z    / s_local.left.x )
            + Vec3( parentWorld.up.x      / s_local.left.y,  parentWorld.up.y      / s_local.left.y,  parentWorld.up.z      / s_local.left.y )
            + Vec3( parentWorld.forward.x / s_local.left.z,  parentWorld.forward.y / s_local.left.z,  parentWorld.forward.z / s_local.left.z )

    LT.up = Vec3( parentWorld.left.x    / s_local.up.x,  parentWorld.left.y    / s_local.up.x,  parentWorld.left.z    / s_local.up.x )
            + Vec3( parentWorld.up.x      / s_local.up.y,  parentWorld.up.y      / s_local.up.y,  parentWorld.up.z      / s_local.up.y )
            + Vec3( parentWorld.forward.x / s_local.up.z,  parentWorld.forward.y / s_local.up.z,  parentWorld.forward.z / s_local.up.z )

    LT.forward = Vec3( parentWorld.left.x    / s_local.forward.x,  parentWorld.left.y    / s_local.forward.x,  parentWorld.left.z    / s_local.forward.x )
            + Vec3( parentWorld.up.x      / s_local.forward.y,  parentWorld.up.y      / s_local.forward.y,  parentWorld.up.z      / s_local.forward.y )
            + Vec3( parentWorld.forward.x / s_local.forward.z,  parentWorld.forward.y / s_local.forward.z,  parentWorld.forward.z / s_local.forward.z )

    LT.trans = Vec3( parentWorld.left.x    / s_local.trans.x,  parentWorld.left.y    / s_local.trans.x,  parentWorld.left.z    / s_local.trans.x )
            + Vec3( parentWorld.up.x      / s_local.trans.y,  parentWorld.up.y      / s_local.trans.y,  parentWorld.up.z      / s_local.trans.y )
            + Vec3( parentWorld.forward.x / s_local.trans.z,  parentWorld.forward.y / s_local.trans.z,  parentWorld.forward.z / s_local.trans.z )

    LT.trans = LT.trans - parentWorld.trans
    print(LT.trans)
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
return Backend