class 'GameObjectSaveData'

local m_Logger = Logger("GameObjectSaveData", true)

function GameObjectSaveData:__init(p_GameObject)
    self.guid = p_GameObject.guid
    self.name = p_GameObject.name
    self.blueprintCtrRef = p_GameObject.blueprintCtrRef
    self.parentData = p_GameObject.parentData
    self.transform = p_GameObject.transform
    self.variation = p_GameObject.variation
	self.origin = p_GameObject.origin
	self.original = p_GameObject.original
	self.localTransform = p_GameObject.localTransform

	-- Only save if they aren't the default value
    if p_GameObject.isDeleted then
        self.isDeleted = true
    end
    if not p_GameObject.isEnabled then
        self.isEnabled = false
    end
	if(p_GameObject.originalRef) then
		self.originalRef = p_GameObject.originalRef
	end
	if(p_GameObject.overrides) then
		self.overrides = p_GameObject.overrides
	end
end

function GameObjectSaveData:GetAsTable()
    local out = {
        guid = tostring(self.guid),
        name = self.name,
        blueprintCtrRef = self.blueprintCtrRef:GetTable(),
        parentData = self.parentData:GetTable(),
        transform = self.transform,
        localTransform = self.localTransform,
        variation = self.variation,
        isDeleted = self.isDeleted,
        isEnabled = self.isEnabled,
		origin = self.origin,
	}
	if(self.originalRef) then
		out.originalRef = self.originalRef:GetTable()
	end
	if(self.overrides) then
		out.overrides = self.overrides
	end
	return out
end

return GameObjectSaveData
