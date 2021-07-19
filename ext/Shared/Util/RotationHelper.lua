class 'RotationHelper'


local m_Logger = Logger("RotationHelper", false)
--YPR: yaw, pitch, roll
--LUF: left, up, forward
--LT: LinearTransform

function RotationHelper:GetYawfromForward(forward)
	return math.atan(forward.x, forward.z) + math.pi
end

function RotationHelper:GetYPRfromLUF(p_Left, p_Up, p_Forward)
	-- Reference: http://www.jldoty.com/code/DirectX/YPRfromUF/YPRfromUF.html

	-- Special case, forward is (0,1,0) or (0,-1,0)
	if p_Forward.x == 0 and p_Forward.z == 0 then
		local s_Yaw = 0
		local s_Pitch = p_Forward.y * math.pi/2
		local s_Roll = math.asin(-p_Up.x)

		return s_Yaw, s_Pitch, s_Roll
	end

	-- Ranges: (0, 2*PI)
	local s_Pitch = math.asin(-p_Forward.y) + math.pi
	local s_Yaw = math.atan(p_Forward.x,p_Forward.z) + math.pi
	local s_Roll = math.pi

	local y = Vec3(0, 1, 0)

	-- r0 is the right vector before pitch rotation
	local r0 = Vec3(0, 0, 0)
	local r1 = y:Cross(p_Forward)

	-- Normalizing r0
	local mod_r1 = math.sqrt(r1.x^2 + r1.y^2 + r1.z^2)

	r0.x = r1.x / mod_r1
	r0.y = r1.y / mod_r1
	r0.z = r1.z / mod_r1

	-- u0 is the up vector before pitch rotation
	local u0 = p_Forward:Cross(r0)

	local cosPitch = u0:Dot(p_Up)

	if r0.x > r0.y and r0.x > r0.z and r0.x ~= 0 then
		s_Roll = s_Roll + math.asin( (u0.x * cosPitch - p_Up.x) / r0.x)
	elseif r0.y > r0.x and r0.y > r0.z and r0.y ~= 0 then
		s_Roll = s_Roll + math.asin( (u0.y * cosPitch - p_Up.y) / r0.y)
	elseif r0.z > r0.x and r0.z > r0.y and r0.z ~= 0 then
		s_Roll = s_Roll + math.asin( (u0.z * cosPitch - p_Up.z) / r0.z)
	else
		if r0.x ~= 0 then
			s_Roll = s_Roll + math.asin( (u0.x * cosPitch - p_Up.x) / r0.x)
		elseif r0.y ~= 0 then
			s_Roll = s_Roll + math.asin( (u0.y * cosPitch - p_Up.y) / r0.y)
		elseif r0.z ~= 0 then
			s_Roll = s_Roll + math.asin( (u0.z * cosPitch - p_Up.z) / r0.z)
		else
			m_Logger:Write("All denominators are 0, something went wrong")
		end
	end

	return self:AdjustRangeRad(s_Yaw), self:AdjustRangeRad(s_Pitch), self:AdjustRangeRad(s_Roll)
end

function RotationHelper:GetLUFfromYPR(p_Yaw, p_Pitch, p_Roll)
	-- Reference: http://planning.cs.uiuc.edu/node102.html

	local fx = math.sin(p_Yaw)*math.cos(p_Pitch)
	local fy = math.sin(p_Pitch)
	local fz = math.cos(p_Yaw)*math.cos(p_Pitch)

	local s_Forward = Vec3(fx, fy, fz)

	local ux = -(math.sin(p_Yaw)*math.sin(p_Pitch)*math.cos(p_Roll) + math.cos(p_Yaw)*math.sin(p_Roll))
	local uy = math.cos(p_Pitch)*math.cos(p_Roll)
	local uz = -(math.cos(p_Yaw)*math.sin(p_Pitch)*math.cos(p_Roll) - math.sin(p_Yaw)*math.sin(p_Roll))

	local s_Up = Vec3(ux, uy, uz)

	local s_Left = s_Forward:Cross(Vec3(s_Up.x * -1, s_Up.y * -1, s_Up.z * -1))

	return s_Left, s_Up, s_Forward
end

--------------Linear Transform variants-------
function RotationHelper:GetYPRfromLT(p_LinearTransform)
	if p_LinearTransform.typeInfo.name == nil or p_LinearTransform.typeInfo.name ~= "LinearTransform" then
		m_Logger:Write("Wrong argument, expected LinearTransform")
		return
	end

	local s_Yaw, s_Pitch, s_Roll = self:GetYPRfromRUF(
			p_LinearTransform.left,
			p_LinearTransform.up,
			p_LinearTransform.forward
	)

	return self:AdjustRangeRad(s_Yaw), self:AdjustRangeRad(s_Pitch), self:AdjustRangeRad(s_Roll)
end

function RotationHelper:GetLTfromYPR(yaw, pitch, roll)
	local s_Left, s_Up, s_Forward = self:GetLUFfromYPR(yaw, pitch, roll)

	return LinearTransform(s_Left, s_Up, s_Forward, Vec3(0, 0, 0) )
end

function RotationHelper:AdjustRangeRad(p_Angle)
	if p_Angle > 2 * math.pi then
		return p_Angle - 2 * math.pi
	elseif p_Angle < 0 then
		return p_Angle + 2 * math.pi
	end

	return p_Angle
end

return RotationHelper
