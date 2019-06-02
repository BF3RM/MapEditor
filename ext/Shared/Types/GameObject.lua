class 'GameObject'

local m_Logger = Logger("GameObject", true)

function GameObject:__init(arg)
    self.guid = arg.guid
    self.creatorName = arg.creatorName -- never gets sent to js
    self.name = arg.name
    self.typeName = arg.typeName
    self.blueprintCtrRef = arg.blueprintCtrRef
    self.parentData = arg.parentData
    self.transform = arg.transform
    self.variation = arg.variation
    --self.gameEntities = arg.gameEntities -- we only store the Ids of the entities here
    self.isVanilla = arg.isVanilla -- never gets sent to js
    self.isDeleted = arg.isDeleted
    self.isEnabled = arg.isEnabled
    self.gameEntities = arg.gameEntities
    self.children = arg.children -- never gets sent to js
end

function GameObject:SetTransform(p_LinearTransform, p_UpdateCollision)
    -- TODO: update self.transform

    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            if(l_ChildGameObject == nil) then
                m_Logger:Error("l_ChildGameObject is nil?")
                return false
            end

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