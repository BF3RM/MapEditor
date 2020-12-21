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

    if arg.gameObjectTransferData == nil then
        m_Logger:Error("gameObjectTransferData cant be nil")
        return nil
    end

    self.type = arg.type
    self.sender = arg.sender
	self.gameObjectTransferData = arg.gameObjectTransferData
	self.ebxFieldData = arg.ebxFieldData
end

return CommandActionResult
