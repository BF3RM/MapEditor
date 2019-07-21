class 'GameObjectSaveData'

local m_Logger = Logger("GameObjectSaveData", true)

function GameObjectSaveData:__init(p_GameObjectTransferData)
    --if p_GameObjectTransferData.class ~= GameObjectTransferData then
    --    m_Logger:Error("Constructor expects a GameObjectTransferData object")
    --    return
    --end

    self.name = p_GameObjectTransferData.name
    self.typeName = p_GameObjectTransferData.typeName
    self.blueprintCtrRef = p_GameObjectTransferData.blueprintCtrRef
    self.parentData = p_GameObjectTransferData.parentData
    self.transform = p_GameObjectTransferData.transform
    self.variation = p_GameObjectTransferData.variation

    -- Only save if they aren't the default value
    if p_GameObjectTransferData.isDeleted then
        self.isDeleted = true
    end
    if not p_GameObjectTransferData.isEnabled then
        self.isEnabled = false
    end
end

function GameObjectSaveData:GetAsTable()
    return {
        name = self.name,
        typeName = self.typeName,
        blueprintCtrRef = self.blueprintCtrRef,
        parentData = self.parentData,
        transform = self.transform,
        variation = self.variation
    }
end

return GameObjectSaveData