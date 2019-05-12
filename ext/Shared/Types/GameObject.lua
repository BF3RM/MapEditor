class 'GameObject'

local m_Logger = Logger("GameObject", true)


function GameObject:__init()
    self.guid = nil
    self.name = nil
    self.type = nil
    self.parent = nil
    self.userData = nil
    self.children = {}
    self.entities = {}
end




return GameObject