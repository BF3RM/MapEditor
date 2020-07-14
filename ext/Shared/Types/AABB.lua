class 'AABB'

local m_Logger = Logger("AABB", true)

function AABB:__init(arg)
    if(arg.min.x > 1e38 or arg.min.x < -1e38) then
        arg.min = Vec3(-0.5,-0.5,-0.5)
        arg.max = Vec3(0.5,0.5,0.5)
    end
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