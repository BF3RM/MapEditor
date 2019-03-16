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


function ToWorld(s_local, parentWorld)
	local LT = LinearTransform()


	LT = parentWorld * s_local

	LT.trans = parentWorld.trans + s_local.trans
	-- local parentWorld_inverted = parentWorld:Inverse()

print("---")
-- print(parentWorld.trans + s_local.trans)
-- print(parentWorld.typeInfo.name)
-- print(parentWorld.trans.typeInfo.name)
-- print(type(parentWorld.trans.x))
print(parentWorld)
print(parentWorld:Inverse())
	-- local t = Vec3()
	-- t.x = parentWorld_inverted.left.x * s_local.trans.x +
	--     	parentWorld_inverted.left.y * s_local.trans.x +
	--     	parentWorld_inverted.left.z * s_local.trans.x
	-- t.y = parentWorld_inverted.up.x * s_local.trans.y +
	--     	parentWorld_inverted.up.y * s_local.trans.y +
	--     	parentWorld_inverted.up.z * s_local.trans.y
	-- t.z = parentWorld_inverted.forward.x * s_local.trans.z +
	--     	parentWorld_inverted.forward.y * s_local.trans.z +
	--     	parentWorld_inverted.forward.z * s_local.trans.z
-- print(parentWorld.trans + t)

	-- LT.trans = parentWorld.trans + t
	return LT
end


function ToLocal(world, parentWorld)

    local finalLT = LinearTransform()

    local parentWorld_inverted = parentWorld:Inverse()

    finalLT = world * parentWorld_inverted

		local t = world.trans - parentWorld.trans


		finalLT.trans.x = world.left.x * t.x +
		    	world.left.y * t.x +
		    	world.left.z * t.x
		finalLT.trans.y = world.up.x * t.y +
		    	world.up.y * t.y +
		    	world.up.z * t.y
		finalLT.trans.z = world.forward.x * t.z +
		    	world.forward.y * t.z +
		    	world.forward.z * t.z

    -- finalLT.trans.x = world.trans.x - parentWorld.trans.x
    -- finalLT.trans.y = world.trans.y - parentWorld.trans.y
    -- finalLT.trans.z = world.trans.z - parentWorld.trans.z
		-- print(finalLT.trans) --(15.818466, -0.016708, -24.546097)
    return finalLT
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