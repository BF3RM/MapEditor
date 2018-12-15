class 'ObjectManager'

function ObjectManager:__init(p_Realm)
    print("Initializing ObjectManager")
    self.m_Realm = p_Realm
    self:RegisterVars()
    self:RegisterEvents()
end

function ObjectManager:RegisterVars()
    self.m_SpawnedEntities = {}
    self.m_SpawnedOffsets = {}
end

function ObjectManager:RegisterEvents()

end
function ObjectManager:GetEntityByGuid(p_Guid)
    if(self.m_SpawnedEntities[p_Guid] ~= nil) then
        return self.m_SpawnedEntities[p_Guid]

    else
        return false
    end
end
function ObjectManager:Clear()
    self.m_SpawnedEntities = {}
end



function ObjectManager:SpawnBlueprint(p_Guid, p_PartitionGuid, p_InstanceGuid, p_LinearTransform, p_Variation)
    if p_PartitionGuid == nil or
            p_InstanceGuid == nil or
            p_LinearTransform == nil then
        print('One or more userData are nil')
        return false
    end

    if self.m_SpawnedEntities[p_Guid] ~= nil then
        print('Object with id ' .. p_Guid .. ' already existed as a spawned entity!')
        return false
    end

    p_Variation = p_Variation or 0

    local s_Blueprint = ResourceManager:FindInstanceByGUID(Guid(p_PartitionGuid), Guid(p_InstanceGuid))

    if s_Blueprint == nil then
        error('Couldn\'t find the specified instance')
        return false
    end

    local s_ObjectBlueprint = _G[s_Blueprint.typeInfo.name](s_Blueprint)

    print('Blueprint type: ' .. s_Blueprint.typeInfo.name .. ", ID: " .. p_Guid .. ", Instance: " .. tostring(p_InstanceGuid) .. ", Variation: " .. p_Variation)

    local s_Params = EntityCreationParams()
    s_Params.transform = p_LinearTransform
    s_Params.variationNameHash = p_Variation
    s_Params.networked = s_ObjectBlueprint.needNetworkId

    local s_ObjectEntities = EntityManager:CreateEntitiesFromBlueprint(s_Blueprint, s_Params)
    print("Successfully spawned.")
    if #s_ObjectEntities == 0 then
        print("Spawning failed")
        return false
    end
    local s_Spatial = {}
    local s_Offsets = {}

    for i, l_Entity in pairs(s_ObjectEntities) do
        l_Entity:Init(self.m_Realm, true)
        if(l_Entity:Is("SpatialEntity")) then
            s_Spatial[i] = SpatialEntity(l_Entity)
            s_Offsets[i] = ToLocal(SpatialEntity(l_Entity).transform, p_LinearTransform)
        end
    end


    self.m_SpawnedEntities[p_Guid] = s_Spatial
    self.m_SpawnedOffsets[p_Guid] = s_Offsets

    return s_Spatial
end

function ObjectManager:DestroyEntity(p_Guid)

    local s_Entities = self:GetEntityByGuid(p_Guid)

    if(s_Entities == false or #s_Entities == 0) then
        print("Failed to get entities")
        return false
    end

    self.m_SpawnedEntities[p_Guid] = nil;

    for i, entity in pairs(s_Entities) do
        if entity ~= nil then
            print(entity.typeInfo.name)
            print("destroying")
            entity:Destroy()
            print("destroyed")
        end
    end
    return true
end

function ObjectManager:SetTransform(p_Guid, p_LinearTransform, p_UpdateCollision)

    if self.m_SpawnedEntities[p_Guid] == nil then
        print('Object with id ' .. p_Guid .. ' does not exist')
        return false
    end
    for i, l_Entity in pairs( self.m_SpawnedEntities[p_Guid]) do
        print(l_Entity.typeInfo.name)
        if(l_Entity == nil) then
            print("Entity is nil?")
            return false
        end

        if(not l_Entity:Is("SpatialEntity"))then
            print("not spatial")
            goto continue
        end

        local s_Entity = SpatialEntity(l_Entity)

        if s_Entity ~= nil then
            if(s_Entity.typeInfo.name == "ServerVehicleEntity") then
                s_Entity.transform = LinearTransform(p_LinearTransform)
            else
                local s_LocalTransform = self.m_SpawnedOffsets[p_Guid][i]
                s_Entity.transform = ToWorld(LinearTransform(p_LinearTransform), s_LocalTransform)

                if(p_UpdateCollision) then
                    s_Entity:FireEvent("Disable")
                    s_Entity:FireEvent("Enable")
                end
            end
        else
            print("entity is nil??")
        end
        ::continue::
    end
    return true
end


function ToWorld(parentWorld, s_local)
    local LT = LinearTransform()


    LT.left = Vec3( parentWorld.left.x    * s_local.left.x,  parentWorld.left.y    * s_local.left.x,  parentWorld.left.z    * s_local.left.x )
            + Vec3( parentWorld.up.x      * s_local.left.y,  parentWorld.up.y      * s_local.left.y,  parentWorld.up.z      * s_local.left.y )
            + Vec3( parentWorld.forward.x * s_local.left.z,  parentWorld.forward.y * s_local.left.z,  parentWorld.forward.z * s_local.left.z )

    LT.up = Vec3( parentWorld.left.x    * s_local.up.x,  parentWorld.left.y    * s_local.up.x,  parentWorld.left.z    * s_local.up.x )
            + Vec3( parentWorld.up.x      * s_local.up.y,  parentWorld.up.y      * s_local.up.y,  parentWorld.up.z      * s_local.up.y )
            + Vec3( parentWorld.forward.x * s_local.up.z,  parentWorld.forward.y * s_local.up.z,  parentWorld.forward.z * s_local.up.z )

    LT.forward = Vec3( parentWorld.left.x    * s_local.forward.x,  parentWorld.left.y    * s_local.forward.x,  parentWorld.left.z    * s_local.forward.x )
            + Vec3( parentWorld.up.x      * s_local.forward.y,  parentWorld.up.y      * s_local.forward.y,  parentWorld.up.z      * s_local.forward.y )
            + Vec3( parentWorld.forward.x * s_local.forward.z,  parentWorld.forward.y * s_local.forward.z,  parentWorld.forward.z * s_local.forward.z )

    LT.trans = Vec3( parentWorld.left.x    * s_local.trans.x,  parentWorld.left.y    * s_local.trans.x,  parentWorld.left.z    * s_local.trans.x )
            + Vec3( parentWorld.up.x      * s_local.trans.y,  parentWorld.up.y      * s_local.trans.y,  parentWorld.up.z      * s_local.trans.y )
            + Vec3( parentWorld.forward.x * s_local.trans.z,  parentWorld.forward.y * s_local.trans.z,  parentWorld.forward.z * s_local.trans.z )

    LT.trans = LT.trans + parentWorld.trans
    return LT
end


return ObjectManager