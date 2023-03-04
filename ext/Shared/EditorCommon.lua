---@class EditorCommon
EditorCommon = class 'EditorCommon'

local m_Logger = Logger("EditorCommon", false)

function EditorCommon:__init()
	m_Logger:Write("Initializing EditorCommon")
end

EditorCommon = EditorCommon()

return EditorCommon
