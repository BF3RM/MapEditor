class 'AABB'

local m_Logger = Logger("AABB", true)

function AABB:__init(arg)
    self.min = arg.min
    self.max = arg.max
    self.transform = arg.transform
end

function AABB:GetTable()
    return {
        min = self.min,
        max = self.max,
        transform = self.transform
    }
end
return AABB
