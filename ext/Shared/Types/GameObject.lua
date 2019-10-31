class 'GameObject'

local m_Logger = Logger("GameObject", true)

function GameObject:__init(arg)
    self.guid = arg.guid
    self.creatorName = arg.creatorName -- never gets sent to js
    self.name = arg.name
    self.typeName = arg.typeName
    self.blueprintCtrRef = arg.blueprintCtrRef
    self.parentData = arg.parentData
    self.transform = arg.transform  -- world transform
    self.variation = arg.variation
    --self.gameEntities = arg.gameEntities -- we only store the Ids of the entities here
    self.isVanilla = arg.isVanilla -- never gets sent to js
    self.isDeleted = arg.isDeleted --> only vanilla objects, dont appear in the browser anymore. entities get disabled, because we cannot destroy them
    self.isEnabled = arg.isEnabled
    self.gameEntities = arg.gameEntities
    self.children = arg.children -- never gets sent to js
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

    self.isEnabled = false
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

    self.isEnabled = true
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

    self.isDeleted = true
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

    self.isDeleted = false
end

function GameObject:Destroy()
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

    self.transform = LinearTransform(p_LinearTransform)

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