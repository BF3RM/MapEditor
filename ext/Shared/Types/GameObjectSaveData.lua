class 'GameObjectSaveData'

local m_Logger = Logger("GameObjectSaveData", true)

function GameObjectSaveData:__init(p_GameObject)
    self.guid = p_GameObject.guid
    self.name = p_GameObject.name
    self.typeName = p_GameObject.typeName
    self.blueprintCtrRef = p_GameObject.blueprintCtrRef
    self.parentData = p_GameObject.parentData
    self.transform = p_GameObject.transform
    self.variation = p_GameObject.variation
	self.isVanilla = p_GameObject.isVanilla
	self.original = p_GameObject.original
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
        guid = self.guid,
        name = self.name,
        typeName = self.typeName,
        blueprintCtrRef = self.blueprintCtrRef:GetTable(),
        parentData = self.parentData:GetTable(),
        transform = self.transform,
        variation = self.variation,
        isDeleted = self.isDeleted,
        isEnabled = self.isEnabled,
        isVanilla = self.isVanilla,
        original = self.original:GetTable(),
	}
end

return GameObjectSaveData
