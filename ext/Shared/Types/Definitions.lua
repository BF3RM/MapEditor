---@class ProjectHeader
---@field projectName string
---@field gameModeName string
---@field mapName string
---@field requiredBundles table
---@field timeStamp number
---@field saveVersion string|nil
---@field id number

---@class ProjectDataEntry
---@field name string
---@field guid string
---@field blueprintCtrRef table|nil
---@field transform LinearTransform
---@field timeStamp number
---@field origin GameObjectOriginType
---@field original table|nil
---@field localTransform LinearTransform
---@field variation number|nil
---@field isEnabled boolean|nil
---@field isDeleted boolean|nil
---@field parentData table|nil
---@field originalRef table|nil
---@field overrides table|nil

---@class ProjectSave
---@field header ProjectHeader
---@field data ProjectDataEntry[]
