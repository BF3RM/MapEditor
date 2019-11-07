class 'GameObject'

local m_Logger = Logger("GameObject", true)
local m_TraceableField_Suffix = "_original_value"

function GameObject:__init(arg)
    self.guid = arg.guid
    self.creatorName = arg.creatorName -- never gets sent to js
    self.typeName = arg.typeName
    self.blueprintCtrRef = arg.blueprintCtrRef
    self.isVanilla = arg.isVanilla -- never gets sent to js
    self.gameEntities = arg.gameEntities
    self.children = arg.children -- never gets sent to js

    self.isUserModified = true
    self.userModifiedFields = {}
    --self.name = arg.name
    --self.parentData = arg.parentData
    --self.transform = arg.transform  -- world transform
    --self.variation = arg.variation
    --self.isDeleted = arg.isDeleted --> only vanilla objects, dont appear in the browser anymore. entities get disabled, because we cannot destroy them
    --self.isEnabled = arg.isEnabled
    self:RegisterUserModifiableField("name", arg.name)
    self:RegisterUserModifiableField("parentData", arg.parentData)
    self:RegisterUserModifiableField("transform", arg.transform)
    self:RegisterUserModifiableField("variation", arg.variation)
    self:RegisterUserModifiableField("isDeleted", arg.isDeleted)
    self:RegisterUserModifiableField("isEnabled", arg.isEnabled)
end

function GameObject:RegisterUserModifiableField(p_FieldName, p_DefaultValue)
    self[p_FieldName] = p_DefaultValue
    self[p_FieldName .. m_TraceableField_Suffix] = p_DefaultValue
end

function GameObject:SetField(p_FieldName, p_NewValue)
    self[p_FieldName] = p_NewValue
    local originalValue = self[p_FieldName .. m_TraceableField_Suffix]
    local newValue = self[p_FieldName]

    self.userModifiedFields[p_FieldName] = newValue ~= originalValue
end

function GameObject:IsUserModified()
    if (self.isVanilla == false) then
        return true
    end

    for fieldName, isUserModified in pairs(self.userModifiedFields) do
        if isUserModified == true then
            m_Logger:Write("GameObject: " .. self.name .. " has modified field: " .. fieldName .. " - original value: " .. tostring(self[fieldName .. m_TraceableField_Suffix]) .. " | new value: " .. tostring(self[fieldName]))
            return true
        end
    end

    return false
end

function GameObject:Disable()
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:Disable()
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Disable()
            end
        end
    end

    self:SetField("isEnabled", false)
end

function GameObject:Enable()
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:Enable()
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Enable()
            end
        end
    end

    self:SetField("isEnabled", true)
end

function GameObject:MarkAsDeleted()
    if (self.isVanilla == false) then
        m_Logger:Error("Cant delete a non-vanilla object, use destroy instead")
        return
    end

    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:Delete()
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Disable()
            end
        end
    end

    self:SetField("isDeleted", true)
end

function GameObject:MarkAsUndeleted()
    if (self.isVanilla == false) then
        m_Logger:Error("Cant undelete a non-vanilla object, use spawn instead")
        return
    end

    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:MarkAsUndeleted()
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Enable()
            end
        end
    end

    self:SetField("isDeleted", false)
end

function GameObject:Destroy() -- this will effectively destroy all entities and childentities. the gameobject becomes useless and needs to be dereferenced
    if (self.isVanilla == true) then
        m_Logger:Error("Cant destroy vanilla object, use disable instead")
        return
    end

    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:Destroy()
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Destroy()
            end
        end
    end
end

function GameObject:SetTransform(p_LinearTransform, p_UpdateCollision)
    -- TODO: update self.transform

    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            if(l_ChildGameObject == nil) then
                m_Logger:Error("l_ChildGameObject is nil?")
                return false
            end

            -- We calculate the offset to get where the child gameobject should be
            local s_Offset = ToLocal(l_ChildGameObject.transform, self.transform)
            local s_LinearTransform = ToWorld(s_Offset, p_LinearTransform)

            local s_Response = l_ChildGameObject:SetTransform(s_LinearTransform, p_UpdateCollision)

            if not s_Response then
                return false
            end
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if(l_GameEntity == nil) then
                m_Logger:Error("GameEntity is nil?")
                return false
            end

            local response = l_GameEntity:SetTransform(p_LinearTransform, p_UpdateCollision)

            if not response then
                return false
            end
        end
    end

    self:SetField("transform", LinearTransform(p_LinearTransform))

    return true
end

function GameObject:GetGameObjectTransferData()
    local s_GameObjectTransferData = {
        guid = self.guid,
        name = self.name,
        typeName = self.typeName,
        blueprintCtrRef = self.blueprintCtrRef:GetTable(),
        parentData = self.parentData:GetTable(),
        transform = self.transform,
        variation = self.variation,
        isEnabled = self.isEnabled,
        isDeleted = self.isDeleted,
        -- entities have to be set externally
    }

    local s_GameEntityTransferDatas = { }
    for _, l_GameEntity in pairs(self.gameEntities) do
        table.insert(s_GameEntityTransferDatas, l_GameEntity:GetGameEntityTransferData())
    end

    s_GameObjectTransferData.gameEntities = s_GameEntityTransferDatas

    return s_GameObjectTransferData
end

function GameObject:GetEntities()
    local s_Entities = { }

    for _, l_GameEntity in pairs(self.gameEntities) do
        table.insert(s_Entities, l_GameEntity.entity)
    end

    return s_Entities
end


return GameObject