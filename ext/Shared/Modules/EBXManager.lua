---@class EBXManager
EBXManager = class 'EBXManager'

local m_Logger = Logger("EBXManager", false)

function EBXManager:__init(p_Realm)
	m_Logger:Write("Initializing EBXManager: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
end

function EBXManager:OnLevelDestroy()
end

function EBXManager:SetFields(p_Overrides)
	for _, v in pairs(p_Overrides) do
		m_Logger:Write(_)
		m_Logger:Write(v)
		self:SetField(v.field, v.reference, v.type)
	end
end

--- Collect the DataContainers an override chain passes THROUGH, root first.
---
--- Mirrors SetField's descent without writing anything. Used to clone only the path an edit
--- touches instead of the whole blueprint: DataContainerExt:DeepCopy takes a
--- {originalGuid -> newGuid} map and copies a child ONLY if it is listed, so every container from
--- the root down to the edited one has to be in that map or the copy is unreachable — an unlisted
--- child is neither copied nor descended into.
---@param p_Instance DataContainer
---@param p_Field table override chain node
---@param p_Out table accumulator, guid string -> true
function EBXManager:CollectPathContainers(p_Instance, p_Field, p_Out)
	if p_Instance == nil or p_Field == nil then
		return
	end

	local s_Guid = nil
	pcall(function() s_Guid = tostring(p_Instance.instanceGuid) end)

	if s_Guid ~= nil and s_Guid ~= "nil" then
		p_Out[s_Guid] = true
	end

	-- A reference assignment terminates here just like a printable leaf: its `value` is a
	-- {partitionGuid, instanceGuid} descriptor, not another node to descend into.
	if isPrintable(p_Field.type) or p_Field.ref == true then
		return
	end

	local s_Casted = p_Instance
	pcall(function() s_Casted = _G[p_Instance.typeInfo.name](p_Instance) end)

	local s_Next = nil
	pcall(function() s_Next = s_Casted[p_Field.field] end)

	if s_Next == nil then
		return
	end

	self:CollectPathContainers(s_Next, p_Field.value, p_Out)
end

function EBXManager:SetField(p_Instance, p_Field, p_Path)
	-- Guard a malformed override chain: a non-printable node whose nested `.value` is nil (e.g.
	-- the edited path runs through a null/unresolved reference, as in some VisualEnvironment
	-- sub-objects). Recursing into it would index a nil field and throw an UNHANDLED error that
	-- aborts the command AND spams — the server must never die on a bad edit. Skip the field.
	if p_Field == nil then
		m_Logger:Error("SetField: nil field at path '" .. tostring(p_Path) ..
			"' — malformed override chain (edited path runs through a nil value); skipping.")
		return p_Path or ''
	end

	m_Logger:Write(tostring(p_Path) .. "/" .. tostring(p_Field.field))

	if p_Instance ~= nil then
		if p_Instance.instanceGuid ~= nil then
			p_Instance:MakeWritable()
			p_Instance = _G[p_Instance.typeInfo.name](p_Instance)
		end

		-- Reference assignment -------------------------------------------------------------
		--
		-- A terminal, exactly like a printable leaf. The edit grammar otherwise has no verb but
		-- "assign a scalar": every descriptor recurses on the field name until isPrintable() is
		-- true, so there was no shape that could say "point this field at that instance" and the
		-- inspector could browse a reference but never change one.
		--
		-- `value` is { partitionGuid, instanceGuid }; a nil/absent value clears the reference.
		-- Resolution mirrors PartitionSerializer's fallback: try partition+instance first, then a
		-- global search by instance guid, because Frostbite leaves partitionGuid ZERO for imported
		-- references and resolves those globally at load.
		if p_Field.ref == true then
			local s_Target = nil
			local s_Val = p_Field.value

			if type(s_Val) == 'table' and s_Val.instanceGuid ~= nil then
				local s_Part = s_Val.partitionGuid

				if s_Part ~= nil and tostring(s_Part) ~= '00000000-0000-0000-0000-000000000000' then
					pcall(function()
						s_Target = ResourceManager:FindInstanceByGuid(Guid(tostring(s_Part)), Guid(tostring(s_Val.instanceGuid)))
					end)
				end

				if s_Target == nil then
					pcall(function()
						s_Target = ResourceManager:SearchForInstanceByGuid(Guid(tostring(s_Val.instanceGuid)))
					end)
				end

				-- Refuse a target whose type the field cannot hold.
				--
				-- This is a HARD requirement, not validation politeness: assigning a
				-- type-mismatched DataContainer kills the client process outright — no Lua error,
				-- nothing catchable, the same native failure mode as GH #202's parentRepresentative.
				-- pcall does not help. Verified by driving the reference picker with an
				-- ObjectBlueprint into a field that wanted something else.
				--
				-- p_Field.type is the field's DECLARED type as the inspector knows it. Walk the
				-- target's inheritance chain so a subclass is still accepted; if the declared type
				-- is unknown (older callers omit it) the assignment is refused rather than
				-- attempted, because the failure is unrecoverable.
				if s_Target ~= nil then
					local s_Want = p_Field.type

					if s_Want == nil or s_Want == '' then
						m_Logger:Error("SetField: refusing reference assignment to '" ..
							tostring(p_Field.field) .. "': no declared field type to check against, " ..
							"and a mismatched reference takes the client down.")
						-- nil, NOT a path: GameObject:SetOverride records an override for any path it gets back,
						-- which would persist an edit that was refused and never applied.
						return nil
					end

					-- Walk the inheritance chain, BOUNDED.
					--
					-- typeInfo.super does not reliably terminate: at the root it keeps returning a
					-- non-nil typeInfo rather than nil, so an unbounded `while s_Info ~= nil` loop
					-- never ends for a type that does NOT match. That hangs the game — no crash, no
					-- dump, the editor simply disappears — and it only ever terminated before
					-- because a MATCHING type breaks out early. Every mismatched reference hung,
					-- which is precisely the case this guard exists to handle.
					--
					-- Bounded by depth and by self-reference; on exhaustion the type is treated as
					-- NOT matching, so the refusal path runs rather than a blind assignment.
					local s_Ok = false
					local s_Info = nil
					pcall(function() s_Info = s_Target.typeInfo end)

					local s_Depth = 0

					while s_Info ~= nil and s_Depth < 32 do
						local s_Name = nil
						pcall(function() s_Name = s_Info.name end)

						if s_Name == s_Want then
							s_Ok = true
							break
						end

						local s_Super = nil
						pcall(function() s_Super = s_Info.super end)

						-- The chain is done when super stops moving, not only when it is nil.
						if s_Super == nil or s_Super == s_Info then
							break
						end

						s_Info = s_Super
						s_Depth = s_Depth + 1
					end

					if not s_Ok then
						local s_Got = 'unknown'
						pcall(function() s_Got = tostring(s_Target.typeInfo.name) end)
						m_Logger:Error("SetField: refusing to point '" .. tostring(p_Field.field) ..
							"' at a " .. s_Got .. "; the field takes a " .. tostring(s_Want) ..
							" and a mismatched reference crashes the client.")
						-- nil, NOT a path: GameObject:SetOverride records an override for any path it gets back,
						-- which would persist an edit that was refused and never applied.
						return nil
					end
				end

				-- Refuse to write a reference we could not resolve: assigning nil here would
				-- silently NULL the field instead of reporting that the target is unavailable.
				if s_Target == nil then
					m_Logger:Error("SetField: could not resolve reference target " ..
						tostring(s_Val.partitionGuid) .. "/" .. tostring(s_Val.instanceGuid) ..
						" for '" .. tostring(p_Field.field) .. "'; leaving the field unchanged.")
					-- nil, NOT a path: GameObject:SetOverride records an override for any path it gets back,
					-- which would persist an edit that was refused and never applied.
					return nil
				end
			end

			-- Assign the TYPED wrapper, not the raw DataContainer. A raw container is silently
			-- rejected — the field reads back nil afterwards with no error — the same way every
			-- other write in this file casts via _G[typeInfo.name] before touching a field.
			local s_Assign = s_Target

			if s_Target ~= nil then
				pcall(function() s_Assign = _G[s_Target.typeInfo.name](s_Target) end)
			end

			p_Instance[p_Field.field] = s_Assign

			return p_Path .. '.' .. p_Field.field
		end

		if isPrintable(p_Field.type) then -- Set value directly
			p_Instance[p_Field.field] = ParseType(p_Field.type, p_Field.value)
			return p_Path .. '.' .. p_Field.field
		else
			local s_TypeInfo = p_Instance.typeInfo

			if s_TypeInfo then
				if s_TypeInfo.array then -- Go to the array index
					return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field)
				elseif s_TypeInfo.enum then
					p_Instance[p_Field.field] = tonumber(p_Field.value)
					return p_Path .. '.' .. p_Field.field
				else
					return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field)
				end
			else-- It's not a primitive value and it's not an array, so it's either an instance or a struct. Either way, process that bitch.
				return self:SetField(p_Instance[p_Field.field], p_Field.value, p_Path .. '.' .. p_Field.field)
			end
		end
	else
		m_Logger:Error("No instance passed: " .. p_Field.field)
	end
end

-- The LIVE serializer emits VEXT engine type-names (Float32/Uint32/Int64/CString/…)
-- while the old webx JSON used pipeline names (Single/Int32/UInt32/String). Handle BOTH:
-- otherwise ParseType returns nil for a modern type-name, and assigning nil to a typed
-- engine field throws ("expected number, received nil") — which aborted the whole edit
-- in GameObject:SetOverride before Disable/Enable, so nothing ever applied.
local s_NumericTypes = {
	Single = true, Double = true,
	Float8 = true, Float16 = true, Float32 = true, Float64 = true,
	Int8 = true, Int16 = true, Int32 = true, Int64 = true,
	Uint8 = true, Uint16 = true, Uint32 = true, Uint64 = true,
	UInt16 = true, UInt32 = true, UInt64 = true,
	SByte = true, Byte = true, Enum = true,
}
local s_StringTypes = { String = true, CString = true }

function ParseType(p_Type, p_Val)
	if p_Type == "Boolean" then
		return p_Val == true or p_Val == "true"
	end

	if s_NumericTypes[p_Type] then
		return tonumber(p_Val)
	end

	if s_StringTypes[p_Type] then
		return tostring(p_Val)
	end

	if p_Type == "Vec2" then
		return Vec2(tonumber(p_Val.x), tonumber(p_Val.y))
	end

	if p_Type == "Vec3" then
		return Vec3(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z))
	end

	if p_Type == "Vec4" then
		return Vec4(tonumber(p_Val.x), tonumber(p_Val.y), tonumber(p_Val.z), tonumber(p_Val.w))
	end

	if p_Type == "Guid" then
		return Guid(tostring(p_Val))
	end

	-- Fallback: an unlisted enum/number spelling -> number; otherwise the raw value.
	-- NEVER return nil — assigning nil to a typed engine field throws and aborts the edit.
	local s_Number = tonumber(p_Val)
	if s_Number ~= nil then
		return s_Number
	end

	return p_Val
end

EBXManager = EBXManager()

return EBXManager
