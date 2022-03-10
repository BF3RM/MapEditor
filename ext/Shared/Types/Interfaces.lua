---@class IMessage
---@field type string
---@field gameObjectTransferData IGameObjectTransferData
---@field projectId number
---@field projectHeaderJSON string
---@field projectDataJSON string
---@field viewMode any
---@field direction any
---@field coordinates any
IMessage = {}

---@class IGameObjectTransferData
---@field guid string
---@field name string
---@field transform LinearTransform
---@field blueprintCtrRef table
---@field parentData table
---@field variation number
---@field gameEntities table
---@field isDeleted boolean
---@field isEnabled boolean
---@field realm Realm
---@field creatorName string
---@field origin GameObjectOriginType
---@field isUserModified boolean
---@field overrides table
IGameObjectTransferData = {}
