class 'AABB'

local m_Logger = Logger("AABB", true)

function AABB:__init(p_Arg)
	if p_Arg.min.x > 1e38 or p_Arg.min.x < -1e38 then
		p_Arg.min = Vec3(-0.5,-0.5,-0.5)
		p_Arg.max = Vec3(0.5,0.5,0.5)
	end

	self.min = p_Arg.min
	self.max = p_Arg.max
	self.transform = p_Arg.transform
end

function AABB:GetTable()
	return {
		min = self.min,
		max = self.max,
		transform = self.transform
	}
end

return AABB
