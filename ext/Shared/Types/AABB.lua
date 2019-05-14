class 'AABB'

local m_Logger = Logger("AABB", true)

function AABB:__init(arg)
    self.min = arg.min
    self.max = arg.max
    self.transform = arg.transform
end

return AABB