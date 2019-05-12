class 'CommandActionResult'

local m_Logger = Logger("CommandActionResult", true)

function CommandActionResult:__init(arg)
    if arg.x == nil then
        m_Logger:Error("Notification message cant be empty")
        return nil
    end

    self.message = arg.message -- has to be set always

end

return CommandActionResult