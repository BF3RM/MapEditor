class 'GameObjectTransferData'

local m_Logger = Logger("GameObjectTransferData", true)

function GameObjectTransferData:__init(arg)
    self.guid = arg.guid
    self.name = arg.name
    self.typeName = arg.typeName
    self.blueprintCtrRef = arg.blueprintCtrRef
    self.parentData = arg.parentData
    self.transform = arg.transform
    self.variation = arg.variation
    self.gameEntities = arg.gameEntities
    self.isDeleted = arg.isDeleted
    self.isEnabled = arg.isEnabled
end

return GameObjectTransferData