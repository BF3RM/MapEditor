class 'GameObjectData'

local m_Logger = Logger("GameObjectData", true)

function GameObjectData:__init(arg)
    self.guid = arg.guid
    self.name = arg.name
    self.typeName = arg.typeName
end

return GameObjectData