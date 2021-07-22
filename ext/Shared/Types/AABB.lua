class 'AABB'

local m_Logger = Logger("AABB", true)

function AABB:__init(p_Arg)
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
