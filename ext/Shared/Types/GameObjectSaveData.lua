class 'GameObjectSaveData'

local m_Logger = Logger("GameObjectSaveData", true)

function GameObjectSaveData:__init(p_GameObject)
    self.name = p_GameObject.name
    self.typeName = p_GameObject.typeName
    self.blueprintCtrRef = p_GameObject.blueprintCtrRef
    self.parentData = p_GameObject.parentData
    self.transform = p_GameObject.transform
    self.variation = p_GameObject.variation

    -- Only save if they aren't the default value
    if p_GameObject.isDeleted then
        self.isDeleted = true
    end
    if not p_GameObject.isEnabled then
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
        variation = self.variation,
        isDeleted = self.isDeleted,
        isEnabled = self.isEnabled,
    }
end

return GameObjectSaveData