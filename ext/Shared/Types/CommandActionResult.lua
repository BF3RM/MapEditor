class 'CommandActionResult'

local m_Logger = Logger("CommandActionResult", true)


function CommandActionResult:__init(arg)
    if arg.type == nil then
        m_Logger:Error("type cant be nil")
        return nil
    end

    if arg.sender == nil then
        m_Logger:Error("sender cant be nil")
        return nil
    end

    if arg.gameObjectData == nil then
        m_Logger:Error("gameObjectData cant be nil")
        return nil
    end

    self.gameObjectData = arg.gameObjectData -- has to be set always
end

return CommandActionResult