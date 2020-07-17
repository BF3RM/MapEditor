class 'GameObjectTransferData'

local m_Logger = Logger("GameObjectTransferData", true)

function GameObjectTransferData:__init(arg)
    self.guid = arg.guid
    self.name = arg.name
    self.blueprintCtrRef = arg.blueprintCtrRef
    self.parentData = arg.parentData
    self.transform = arg.transform
    self.variation = arg.variation
    self.gameEntities = arg.gameEntities
    self.isDeleted = arg.isDeleted
    self.isEnabled = arg.isEnabled
    self.realm = arg.realm
    self.creatorName = arg.creatorName
    self.isVanilla = arg.isVanilla
    self.isUserModified = arg.isUserModified
end

function GameObjectTransferData:GetGameObject()
    local s_GameObject = GameObject{
        guid = self.guid,
        name = self.name,
        blueprintCtrRef = CtrRef(self.blueprintCtrRef),
        parentData = GameObjectParentData(self.parentData),
        transform = self.transform,
        variation = self.variation,
        isEnabled = self.isEnabled,
        isDeleted = self.isDeleted,
        creatorName = self.creatorName,
        isVanilla = self.isVanilla,
        realm = self.realm,
        isUserModified = self.isUserModified,
    }

    return s_GameObject
end

return GameObjectTransferData
