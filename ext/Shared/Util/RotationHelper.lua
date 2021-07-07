class 'RotationHelper'


local m_Logger = Logger("RotationHelper", false)
--YPR: yaw, pitch, roll
--LUF: left, up, forward
--LT: LinearTransform

function RotationHelper:GetYawfromForward(forward)
    return math.atan(forward.x, forward.z) + math.pi
end

function RotationHelper:GetYPRfromLUF(left, up, forward)
    -- Reference: http://www.jldoty.com/code/DirectX/YPRfromUF/YPRfromUF.html

    -- Special case, forward is (0,1,0) or (0,-1,0)
    if forward.x == 0 and forward.z == 0 then
        local yaw = 0
        local pitch = forward.y * math.pi/2
        local roll = math.asin(-up.x)

        return yaw, pitch, roll
    end

    -- Ranges: (0, 2*PI)
    local pitch = math.asin(-forward.y) + math.pi
    local yaw = math.atan(forward.x,forward.z) + math.pi
    local roll = math.pi

    local y = Vec3(0,1,0)

    -- r0 is the right vector before pitch rotation
    local r0 = Vec3(0,0,0)
    local r1 = y:Cross(forward)

    -- Normalizing r0
    local mod_r1 = math.sqrt(r1.x^2 + r1.y^2 + r1.z^2)

    r0.x = r1.x / mod_r1
    r0.y = r1.y / mod_r1
    r0.z = r1.z / mod_r1

    -- u0 is the up vector before pitch rotation
    local u0 = forward:Cross(r0)

    local cosPitch = u0:Dot(up)

    if r0.x > r0.y and r0.x > r0.z and r0.x ~= 0 then
        roll = roll + math.asin( (u0.x * cosPitch - up.x) / r0.x)
    elseif r0.y > r0.x and r0.y > r0.z and r0.y ~= 0 then
        roll = roll + math.asin( (u0.y * cosPitch - up.y) / r0.y)
    elseif r0.z > r0.x and r0.z > r0.y and r0.z ~= 0 then
        roll = roll + math.asin( (u0.z * cosPitch - up.z) / r0.z)
    else
        if r0.x ~= 0 then
            roll = roll + math.asin( (u0.x * cosPitch - up.x) / r0.x)
        elseif r0.y ~= 0 then
            roll = roll + math.asin( (u0.y * cosPitch - up.y) / r0.y)
        elseif r0.z ~= 0 then
            roll = roll + math.asin( (u0.z * cosPitch - up.z) / r0.z)
        else
            m_Logger:Write("All denominators are 0, something went wrong")
        end
    end

    return self:AdjustRangeRad(yaw), self:AdjustRangeRad(pitch), self:AdjustRangeRad(roll)
end

function RotationHelper:GetLUFfromYPR(yaw, pitch, roll)
    -- Reference: http://planning.cs.uiuc.edu/node102.html

    local fx = math.sin(yaw)*math.cos(pitch)
    local fy = math.sin(pitch)
    local fz = math.cos(yaw)*math.cos(pitch)

    local forward = Vec3(fx, fy, fz)

    local ux = -(math.sin(yaw)*math.sin(pitch)*math.cos(roll) + math.cos(yaw)*math.sin(roll))
    local uy = math.cos(pitch)*math.cos(roll)
    local uz = -(math.cos(yaw)*math.sin(pitch)*math.cos(roll) - math.sin(yaw)*math.sin(roll))

    local up = Vec3(ux, uy, uz)

    local left = forward:Cross(Vec3(up.x * -1, up.y * -1, up.z * -1))

    return left, up, forward
end

--------------Linear Transform variants-------
function RotationHelper:GetYPRfromLT(linearTransform)
    if linearTransform.typeInfo.name == nil or linearTransform.typeInfo.name ~= "LinearTransform" then
        m_Logger:Write("Wrong argument, expected LinearTransform")

        return
    end

    local yaw, pitch, roll = self:GetYPRfromRUF(
            linearTransform.left,
            linearTransform.up,
            linearTransform.forward
    )

    return self:AdjustRangeRad(yaw), self:AdjustRangeRad(pitch), self:AdjustRangeRad(roll)
end

function RotationHelper:GetLTfromYPR(yaw, pitch, roll)
    local left, up, forward = self:GetLUFfromYPR(yaw, pitch, roll)

    return LinearTransform(left, up, forward, Vec3(0,0,0) )
end

function RotationHelper:AdjustRangeRad(angle)
    if angle > 2 * math.pi then
        return angle - 2 * math.pi
    elseif angle < 0 then
        return angle + 2 * math.pi
    end
    return angle
end

return RotationHelper
