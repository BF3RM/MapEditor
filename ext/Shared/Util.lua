function MergeUserdata(p_Old, p_New)
	if(p_Old == nil) then
		return p_New
	end
	if(p_New == nil) then
		return nil
	end
	for k,v in pairs(p_New) do
		p_Old[k] = v
	end
	return p_Old
end

function GetChanges(p_Old, p_New)
	local s_Changes = {}
	for k,v in pairs(p_New) do
		if(tostring(p_Old[k]) ~= tostring(p_New[k])) then
			if type(p_Old[k]) == "table" then
				for k1,v1 in pairs(p_Old[k]) do
					if(p_Old[k][k1] ~= p_New[k][k1]) then
						table.insert(s_Changes, k)
					end
				end
			else
				table.insert(s_Changes, k)
			end
		end
	end
	return s_Changes
end


function DecodeParams(p_Table)
    if(p_Table == nil) then
        print("No table received")
        return false
    end
	for s_Key, s_Value in pairs(p_Table) do
		if s_Key == 'transform' then
			local s_LinearTransform = LinearTransform(
					Vec3(s_Value.left.x, s_Value.left.y, s_Value.left.z),
					Vec3(s_Value.up.x, s_Value.up.y, s_Value.up.z),
					Vec3(s_Value.forward.x, s_Value.forward.y, s_Value.forward.z),
					Vec3(s_Value.trans.x, s_Value.trans.y, s_Value.trans.z))

			p_Table[s_Key] = s_LinearTransform

		elseif type(s_Value) == "table" then
			DecodeParams(s_Value)
		end

	end

	return p_Table
end


function ToWorld(parentWorld, s_local)
	local LT = LinearTransform()


	LT.left = Vec3( parentWorld.left.x  * s_local.left.x,  parentWorld.left.y   * s_local.left.x,  parentWorld.left.z   * s_local.left.x )
			+ Vec3( parentWorld.up.x      * s_local.left.y,  parentWorld.up.y     * s_local.left.y,  parentWorld.up.z     * s_local.left.y )
			+ Vec3( parentWorld.forward.x * s_local.left.z,  parentWorld.forward.y * s_local.left.z,  parentWorld.forward.z * s_local.left.z )

	LT.up = Vec3( parentWorld.left.x    * s_local.up.x,  parentWorld.left.y * s_local.up.x,  parentWorld.left.z * s_local.up.x )
			+ Vec3( parentWorld.up.x      * s_local.up.y,  parentWorld.up.y   * s_local.up.y,  parentWorld.up.z   * s_local.up.y )
			+ Vec3( parentWorld.forward.x * s_local.up.z,  parentWorld.forward.y * s_local.up.z,  parentWorld.forward.z * s_local.up.z )

	LT.forward = Vec3( parentWorld.left.x   * s_local.forward.x,  parentWorld.left.y    * s_local.forward.x,  parentWorld.left.z    * s_local.forward.x )
			+ Vec3( parentWorld.up.x      * s_local.forward.y,  parentWorld.up.y      * s_local.forward.y,  parentWorld.up.z      * s_local.forward.y )
			+ Vec3( parentWorld.forward.x * s_local.forward.z,  parentWorld.forward.y * s_local.forward.z,  parentWorld.forward.z * s_local.forward.z )

	LT.trans = Vec3( parentWorld.left.x * s_local.trans.x,  parentWorld.left.y  * s_local.trans.x,  parentWorld.left.z  * s_local.trans.x )
			+ Vec3( parentWorld.up.x      * s_local.trans.y,  parentWorld.up.y    * s_local.trans.y,  parentWorld.up.z    * s_local.trans.y )
			+ Vec3( parentWorld.forward.x * s_local.trans.z,  parentWorld.forward.y * s_local.trans.z,  parentWorld.forward.z * s_local.trans.z )

	LT.trans = LT.trans + parentWorld.trans
	return LT
end

-- This isn't correct at all, but it's good enough for what we're trying to do
function ToLocal(a,b)
    --a = world
    --b = parentWorld

    local LT = LinearTransform()
    left = InverseVec3(b.left)
    up = InverseVec3(b.up)
    forward = InverseVec3(b.forward)

    LT = a * LT

    LT.trans.x = a.trans.x - b.trans.x
    LT.trans.y = a.trans.y - b.trans.y
    LT.trans.z = a.trans.z - b.trans.z

    return LT
end

function InverseSafe (f)
    if (f > 0.00000000000001) then
        return 1.0 / f
    else
        return 0.0
    end
end

function InverseVec3 (v)
    return Vec3 (InverseSafe (v.x), InverseSafe (v.y), InverseSafe (v.z));
end

function InverseQuat (v)
    return Quat (InverseSafe (v.x), InverseSafe (v.y), InverseSafe (v.z), InverseSafe (v.w));
end

function dump(o)
	if(o == nil) then
		print("tried to load jack shit")
	end
	if type(o) == 'table' then
		local s = '{ '
		for k,v in pairs(o) do
			if type(k) ~= 'number' then k = '"'..k..'"' end
			s = s .. '['..k..'] = ' .. dump(v) .. ','
		end
		return s .. '} '
	else
		return tostring(o)
	end
end

function Set (list)
	local set = {}
	for _, l in ipairs(list) do set[l] = true end
	return set
end

function h()
    local vars = {"A","B","C","D","E","F","0","1","2","3","4","5","6","7","8","9"}
    return vars[math.floor(MathUtils:GetRandomInt(1,16))]..vars[math.floor(MathUtils:GetRandomInt(1,16))]
end

function GenerateGuid()
    return Guid(h()..h()..h()..h().."-"..h()..h().."-"..h()..h().."-"..h()..h().."-"..h()..h()..h()..h()..h()..h(), "D")
end