---@class ProjectHeader
---@field projectName string
---@field gameModeName string
---@field requiredBundles table
---@field timeStamp number
---@field saveVersion string|nil
---@field id number

---@class ProjectDataEntry
---@field name string
---@field oritransformgin LinearTransform|nil
---@field blueprintCtrRef table|nil
---@field variation number|nil
---@field guid Guid|nil

---@class ProjectSave
---@field header ProjectHeader
---@field data ProjectDataEntry[]
