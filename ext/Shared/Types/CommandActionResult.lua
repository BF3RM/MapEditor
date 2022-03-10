---@class CommandActionResult
CommandActionResult = class 'CommandActionResult'

local m_Logger = Logger("CommandActionResult", false)

function CommandActionResult:__init(p_Arg)
	if p_Arg.type == nil then
		m_Logger:Error("type cant be nil")
		return nil
	end

	if p_Arg.sender == nil then
		m_Logger:Error("sender cant be nil")
		return nil
	end

	if p_Arg.gameObjectTransferData == nil then
		m_Logger:Error("gameObjectTransferData cant be nil")
		return nil
	end

	self.type = p_Arg.type
	self.sender = p_Arg.sender
	self.gameObjectTransferData = p_Arg.gameObjectTransferData
	self.ebxFieldData = p_Arg.ebxFieldData
end

return CommandActionResult
