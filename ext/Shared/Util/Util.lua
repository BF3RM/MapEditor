local matrix = require "__shared/Util/matrix"

local TEMP_GUID_PREFIX = "ED170120"
local CUSTOMOBJ_GUID_PREFIX = "ED170121"
local VANILLA_GUID_PREFIX = "ED170122"

function MergeTables(p_Old, p_New)
	if(p_New == nil) then
		return p_Old
	end

	if(p_Old == nil) then
		return p_New
	end

	for k,v in pairs(p_New) do
		p_Old[k] = v
	end

	return p_Old
end

--function MergeTransferData(p_Old, p_New)
--	if(p_Old == nil) then
--		return p_New
--	end
--	if(p_New == nil) then
--		return nil
--	end
--	for k,v in pairs(p_New) do
--		p_Old[k] = v
--	end
--	return p_Old
--end

function GetChanges(p_Old, p_New)
	local s_Changes = {}
	for k,_ in pairs(p_New) do
		if(tostring(p_Old[k]) ~= tostring(p_New[k])) then
			if type(p_Old[k]) == "table" then
				for k1,_ in pairs(p_Old[k]) do
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
        m_Logger:Write("No table received")
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
			s_Value = DecodeParams(s_Value)
		end
	end

	return p_Table
end


function ToWorld(p_Local, p_ParentWorld)
	p_Local = SanitizeLT(p_Local)
	p_ParentWorld = SanitizeLT(p_ParentWorld)

	local s_LinearTransform = LinearTransform()

	local s_MatrixParent = matrix{
		{p_ParentWorld.left.x,p_ParentWorld.left.y,p_ParentWorld.left.z,0},
		{p_ParentWorld.up.x,p_ParentWorld.up.y,p_ParentWorld.up.z,0},
		{p_ParentWorld.forward.x,p_ParentWorld.forward.y,p_ParentWorld.forward.z,0},
		{p_ParentWorld.trans.x,p_ParentWorld.trans.y,p_ParentWorld.trans.z,1}
	}

	local s_MatrixLocal = matrix{
		{p_Local.left.x,p_Local.left.y,p_Local.left.z,0},
		{p_Local.up.x,p_Local.up.y,p_Local.up.z,0},
		{p_Local.forward.x,p_Local.forward.y,p_Local.forward.z,0},
		{p_Local.trans.x,p_Local.trans.y,p_Local.trans.z,1}
	}

	local s_MatrixWorld = s_MatrixLocal * s_MatrixParent

	s_LinearTransform.left = Vec3(s_MatrixWorld[1][1],s_MatrixWorld[1][2],s_MatrixWorld[1][3])
	s_LinearTransform.up = Vec3(s_MatrixWorld[2][1],s_MatrixWorld[2][2],s_MatrixWorld[2][3])
	s_LinearTransform.forward = Vec3(s_MatrixWorld[3][1],s_MatrixWorld[3][2],s_MatrixWorld[3][3])
	s_LinearTransform.trans = Vec3(s_MatrixWorld[4][1],s_MatrixWorld[4][2],s_MatrixWorld[4][3])

	return SanitizeLT(s_LinearTransform)
end


function ToLocal(world, p_ParentWorld)
	world = SanitizeLT(world)
	p_ParentWorld = SanitizeLT(p_ParentWorld)

	local s_LinearTransform = LinearTransform()

	local s_MatrixParent = matrix{
		{p_ParentWorld.left.x,p_ParentWorld.left.y,p_ParentWorld.left.z,0},
		{p_ParentWorld.up.x,p_ParentWorld.up.y,p_ParentWorld.up.z,0},
		{p_ParentWorld.forward.x,p_ParentWorld.forward.y,p_ParentWorld.forward.z,0},
		{p_ParentWorld.trans.x,p_ParentWorld.trans.y,p_ParentWorld.trans.z,1}
	}

	local s_MatrixWorld = matrix{
		{world.left.x,world.left.y,world.left.z,0},
		{world.up.x,world.up.y,world.up.z,0},
		{world.forward.x,world.forward.y,world.forward.z,0},
		{world.trans.x,world.trans.y,world.trans.z,1}
	}

	local s_MatrixParent_Inv = matrix.invert(s_MatrixParent)
	local s_MatrixLocal = s_MatrixWorld * s_MatrixParent_Inv


	s_LinearTransform.left = Vec3(s_MatrixLocal[1][1],s_MatrixLocal[1][2],s_MatrixLocal[1][3])
	s_LinearTransform.up = Vec3(s_MatrixLocal[2][1],s_MatrixLocal[2][2],s_MatrixLocal[2][3])
	s_LinearTransform.forward = Vec3(s_MatrixLocal[3][1],s_MatrixLocal[3][2],s_MatrixLocal[3][3])
	s_LinearTransform.trans = Vec3(s_MatrixLocal[4][1],s_MatrixLocal[4][2],s_MatrixLocal[4][3])

	return SanitizeLT(s_LinearTransform)
end

function SanitizeLT (lt)
	lt.left = SanitizeVec3(lt.left)
	lt.up = SanitizeVec3(lt.up)
	lt.forward = SanitizeVec3(lt.forward)
	lt.trans = SanitizeVec3(lt.trans)
	return lt
end
function SanitizeVec3( vec )
	vec.x = SanitizeFloat(vec.x)
	vec.y = SanitizeFloat(vec.y)
	vec.z = SanitizeFloat(vec.z)
	return vec
end

function SanitizeFloat( f )
	if( f < 0.000000001 and f > -0.000000001 ) then
		return 0
	end
	return f
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

function dus_MatrixParent(o)
	if(o == nil) then
		m_Logger:Write("tried to load jack shit")
	end
	if type(o) == 'table' then
		local s = '{ '
		for k,v in pairs(o) do
			if type(k) ~= 'number' then k = '"'..k..'"' end
			s = s .. '['..k..'] = ' .. dus_MatrixParent(v) .. ','
		end
		return s .. '} '
	else
		return tostring(o)
	end
end

function IsVanilla(guid)
	if guid == nil then
		return false
	end
	return guid:sub(1, 8):upper() == VANILLA_GUID_PREFIX
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

function GenerateTempGuid()
	return Guid(TEMP_GUID_PREFIX.."-"..h()..h().."-"..h()..h().."-"..h()..h().."-"..h()..h()..h()..h()..h()..h(), "D")
end

-- Generates a random guid.
function GenerateCustomGuid()
    return Guid(CUSTOMOBJ_GUID_PREFIX.."-"..h()..h().."-"..h()..h().."-"..h()..h().."-"..h()..h()..h()..h()..h()..h(), "D")
end

function GenerateChildGuid(p_ParentGuid, p_Offset)
	local s_ParentGuidParts = string.split(tostring(p_ParentGuid), '-')
	local a = s_ParentGuidParts[5]
	local b = tonumber(a,16)
	return Guid(s_ParentGuidParts[1] .. '-' .. s_ParentGuidParts[2] .. '-' .. s_ParentGuidParts[3] .. '-' .. s_ParentGuidParts[4] .. '-' .. string.format("%x", b+1):upper())
end

function GenerateVanillaGuid(p_Name, p_Transform, p_Increment)
	local intHash = MathUtils:FNVHash(p_Name .. tostring(p_Transform))

	intHash = intHash + p_Increment

	local hashAsString = tostring(intHash)
	hashAsString = hashAsString:gsub('-', '1')

	--m_Logger:Write("created hash" .. hashAsString)

	return PadAndCreateGuid(hashAsString)
end

function GetPaddedNumberAsString(n, stringLength)
	local n_string = tostring(n)
	local prefix = ""

	if string.len(n_string) < stringLength then
		for _=1,stringLength - string.len(n_string) do
			prefix = prefix .."0"
		end
	else
		local trimSize = ((string.len(n_string) - stringLength) + 1) * -1
		n_string = n_string:sub(1, trimSize)
	end

	return (prefix..n_string)
end
-- Generates a guid based on a given number. Used for vanilla objects.
function PadAndCreateGuid(p_Hash)
	return Guid(VANILLA_GUID_PREFIX .. "-0000-0000-0000-".. GetPaddedNumberAsString(p_Hash, 12), "D")
end
function GetLength(T)
	local count = 0
	for _ in pairs(T) do count = count + 1 end
	return count
end

function string:split(sep)
	local sep, fields = sep or ":", {}
	local pattern = string.format("([^%s]+)", sep)
	self:gsub(pattern, function(c) fields[#fields+1] = c end)
	return fields
end

function dump(o)
	if(o == nil) then
		m_Logger:Write("No table?")
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
