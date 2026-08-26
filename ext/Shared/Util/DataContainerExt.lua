---@class DataContainerExt
---@overload fun():DataContainerExt
DataContainerExt = class "DataContainerExt"

local m_Logger = Logger("DataContainerExt", false)
require "__shared/Util/StringExtensions"

local m_PrintedObjects = nil
local m_CopiedObjects = nil

function DataContainerExt:MakeWritable(p_Instance)
	if p_Instance == nil then
		m_Logger:Error('Parameter p_Instance was nil.')
		return
	end

	local s_Instance = _G[p_Instance.typeInfo.name](p_Instance)

	if p_Instance.isReadOnly == nil then
		-- If .isReadOnly is nil it means that its not a DataContainer, it's a Structure. We return it casted
		m_Logger:Write('The instance '..p_Instance.typeInfo.name.." is not a DataContainer, it's a Structure")
		return s_Instance
	end

	if not p_Instance.isReadOnly then
		return s_Instance
	end

	s_Instance:MakeWritable()

	return s_Instance
end

function DataContainerExt:Cast(p_Instance)
	if p_Instance == nil then
		m_Logger:Error('Parameter p_Instance was nil.')
		return
	end

	if p_Instance.typeInfo == nil then
		m_Logger:Error('Parameter p_Instance is not a DataContainer or structure.')
		return
	end

	local s_Instance = _G[p_Instance.typeInfo.name](p_Instance)

	return s_Instance
end

function DataContainerExt:ShallowCopy(p_Instance, p_Guid)
	p_Guid = p_Guid or GenerateGuid()

	if p_Instance == nil then
		m_Logger:Error('Parameter p_Instance was nil.')
		return
	end

	if p_Instance.isLazyLoaded then
		m_Logger:Error('The instance is being lazy loaded, thus it can\'t be prepared for editing. Instance type: "' .. p_Instance.typeInfo.name)-- maybe add callstack
		return _G[p_Instance.typeInfo.name](p_Instance)
	end

	if p_Instance.isReadOnly == nil then
		-- If .isReadOnly is nil it means that its not a DataContainer, it's a Structure. We return it casted
		m_Logger:Write('The instance '..p_Instance.typeInfo.name.." is not a DataContainer, it's a Structure")
		return _G[p_Instance.typeInfo.name](p_Instance)
	end

	if p_Instance.instanceGuid == nil then
		m_Logger:Error('Instance.instanceGuid is nil. Instance type: ' .. p_Instance.typeInfo.name)
		return nil
	end

	local s_Clone = p_Instance:Clone(p_Guid)

	local s_CastedClone = _G[s_Clone.typeInfo.name](s_Clone)

	if s_CastedClone ~= nil and s_CastedClone.typeInfo.name ~= s_Clone.typeInfo.name then
		m_Logger:Error('PrepareInstanceForEdit() - Failed to prepare instance of type ' .. s_Clone.typeInfo.name)
		return nil
	end

	-- NOTE: if something is crashing this print can be useful to track it. Check if the latest output is this print and what instance it is
	-- m_Logger:Write('Cloned instance '..p_Instance.typeInfo.name..", instance guid: "..tostring(p_Instance.instanceGuid))

	return s_CastedClone
end

function DataContainerExt:FindLazyLoadedFields(p_Instance)
	p_Instance = _G[p_Instance.typeInfo.name](p_Instance)

	m_Logger:Write('Looking for lazy loaded fields...')

	local s_TypeInfo = p_Instance.typeInfo

	-- We copy all fields
	local s_Fields = getFields(s_TypeInfo)

	for _, l_Field in pairs(s_Fields) do
		if l_Field.typeInfo ~= nil then
			local s_Name = firstToLower(l_Field.name)

			if l_Field.typeInfo.array then
			elseif isPrintable(l_Field.typeInfo.name) or l_Field.typeInfo.enum then
			else
				if p_Instance[s_Name] ~= nil then
					if p_Instance[s_Name].instanceGuid ~= nil then
						if p_Instance[s_Name].isLazyLoaded then
							m_Logger:Write("Found lazy loaded field, name: "..s_Name..", intance: "..tostring(p_Instance[s_Name].instanceGuid)..", partition: "..tostring(p_Instance[s_Name].partitionGuid))
						end
					end
				end
			end
		else
			m_Logger:Write("typeInfo nil ?")
		end
	end

	m_Logger:Write('Finished looking for lazy loaded fields.')
end

function DataContainerExt:GetInstanceFromPath(p_Instance, p_Path)
	local s_PathArray = p_Path:split(".")

	if s_PathArray[1] == "" then
		table.remove(s_PathArray, 1)
	end

	local s_Instance = p_Instance

	for i, l_FieldName in pairs(s_PathArray) do
		-- m_Logger:Write(i .. " - "..l_FieldName)

		if s_Instance.typeInfo == nil then
			--array
		else
			s_Instance = _G[s_Instance.typeInfo.name](s_Instance)
		end

		local s_Child = s_Instance[l_FieldName]

		if s_Child == nil then
			m_Logger:Write('error in field '.. l_FieldName)
			return
		end

		s_Instance = s_Child
	end

	return _G[s_Instance.typeInfo.name](s_Instance)
end

--- Clones the passed instance, as well as all children and grandchildren that match the Guids in @p_DeepCopiedChildrenGuids
--- @p_DeepCopiedChildrenGuids: object. Keys are guid of original as string, value is custom guid as Guid
--- { instanceGuidString = customGuid, instanceGuidString2 = customGuid2, ...}
--- For it to work correctly you should pass all Guids that lead to the DataContainers that you want to modify
function DataContainerExt:DeepCopy(p_Instance, p_DeepCopiedChildrenGuids, p_CurrentDepth)
	p_DeepCopiedChildrenGuids = p_DeepCopiedChildrenGuids or {}
	p_CurrentDepth = p_CurrentDepth or 0

	if p_Instance == nil then
		m_Logger:Error("Instance is nil")
		return
	end

	if m_CopiedObjects == nil then
		m_CopiedObjects = {}
	end

	local s_Clone = _G[p_Instance.typeInfo.name](p_Instance)
	p_Instance = _G[p_Instance.typeInfo.name](p_Instance)

	-- Shallow copy p_Instance if it's a DataContainer, ignore if it's a structure
	if p_Instance.instanceGuid ~= nil then
		if p_Instance.isLazyLoaded then
			-- Report this at ERROR level: it is the exact point a clone silently degrades into
			-- "returned the original", which the caller then treats as a failed clone and answers
			-- by editing the SHARED blueprint instead. Naming the container that bailed is the
			-- difference between "a clone failed somewhere" and knowing what to preload.
			m_Logger:Error("LAZY-BAIL: " .. tostring(p_Instance.typeInfo.name) ..
				" guid=" .. tostring(p_Instance.instanceGuid) ..
				" is lazy-loaded; cloning returns the ORIGINAL from here down.")
			return p_Instance
		end

		if m_CopiedObjects[tostring(p_Instance.instanceGuid)] ~= nil then
			return m_CopiedObjects[tostring(p_Instance.instanceGuid)]
		end

		-- Use custom guid if available
		if p_DeepCopiedChildrenGuids[tostring(p_Instance.instanceGuid)] then
			m_Logger:Write('Found custom guid: '..tostring(p_DeepCopiedChildrenGuids[tostring(p_Instance.instanceGuid)])..", original instanceGuid "..tostring(p_Instance.instanceGuid))

			s_Clone = self:ShallowCopy(p_Instance, p_DeepCopiedChildrenGuids[tostring(p_Instance.instanceGuid)])

			if s_Clone == nil then
				m_Logger:Write('Cloning returned nil')
			end

			m_CopiedObjects[tostring(p_Instance.instanceGuid)] = s_Clone
		end
	end

	self:_deepCopyFields(s_Clone, p_DeepCopiedChildrenGuids, p_CurrentDepth)

	if p_CurrentDepth == 0 then
		m_CopiedObjects = nil
	end

	return s_Clone
end


function DataContainerExt:_deepCopyFields(p_Clone, p_DeepCopiedChildrenGuids, p_CurrentDepth)
	p_Clone = _G[p_Clone.typeInfo.name](p_Clone)
	local s_TypeInfo = p_Clone.typeInfo

	-- We look for fields that are DCs to clone them
	local s_Fields = getFields(s_TypeInfo)

	for _, l_Field in pairs(s_Fields) do
		if l_Field.typeInfo ~= nil then
			local s_Name = firstToLower(l_Field.name)

			if l_Field.typeInfo.array then
				local s_Array = p_Clone[s_Name]
				-- Same nil-elementType hazard as the DeepClone path below: indexing .name on a nil
				-- elementType throws and kills the whole copy, which the caller then answers by
				-- editing the SHARED blueprint. Leave such members shared instead.
				local s_ElementType = l_Field.typeInfo.elementType

				if s_Array ~= nil and s_ElementType ~= nil then
					for i = #s_Array, 1, -1 do
						local s_Member = s_Array[i]

						if s_Member ~= nil and not isPrintable(s_ElementType.name) and not s_ElementType.enum then
							self:_deepCopyStructOrDC(p_Clone, s_Name, i, p_DeepCopiedChildrenGuids, p_CurrentDepth)
						end
					end
				end
				-- It's an object or structure
			elseif not isPrintable(l_Field.typeInfo.name) and not l_Field.typeInfo.enum then
				self:_deepCopyStructOrDC(p_Clone, s_Name, nil, p_DeepCopiedChildrenGuids, p_CurrentDepth)
			end
		else
			m_Logger:Write("typeInfo nil ?")
		end
	end
end

function DataContainerExt:_deepCopyStructOrDC(p_Clone, p_FieldName, p_FieldIndex, p_DeepCopiedChildrenGuids, p_CurrentDepth)
	local s_FieldInstance = p_Clone[p_FieldName]

	-- For DCs that are in an array
	if p_FieldIndex then
		s_FieldInstance = s_FieldInstance[p_FieldIndex]
	end

	if s_FieldInstance == nil then
		return
	end

	if s_FieldInstance.instanceGuid == nil then -- Structure
		self:_deepCopyFields(s_FieldInstance, p_DeepCopiedChildrenGuids, p_CurrentDepth)
	else -- DataContainer
		self:_deepCopyDC(p_Clone, p_FieldName, p_FieldIndex, p_DeepCopiedChildrenGuids, p_CurrentDepth)
	end
end

function DataContainerExt:_deepCopyDC(p_Clone, p_FieldName, p_FieldIndex, p_DeepCopiedChildrenGuids, p_CurrentDepth)
	local s_FieldInstance = p_Clone[p_FieldName]

	-- For DCs that are in an array
	if p_FieldIndex then
		s_FieldInstance = s_FieldInstance[p_FieldIndex]
	end

	-- Filter DataContainer
	if s_FieldInstance.typeInfo.name ~= "DataContainer" then
		-- Only clone field if it was specified in the path array.
		if p_DeepCopiedChildrenGuids[tostring(s_FieldInstance.instanceGuid)] then
			if p_FieldIndex then
				p_Clone[p_FieldName][p_FieldIndex] = self:DeepCopy(s_FieldInstance, p_DeepCopiedChildrenGuids, p_CurrentDepth + 1)
			else
				p_Clone[p_FieldName] = self:DeepCopy(s_FieldInstance, p_DeepCopiedChildrenGuids, p_CurrentDepth + 1)
			end
		end
	end
end

--- Clones all DataContainers found in the passed instance.
function DataContainerExt:DeepClone(p_Instance, p_Guid, p_CurrentDepth)
	p_CurrentDepth = p_CurrentDepth or 0
	p_Guid = p_Guid or GenerateGuid()

	if p_Instance == nil then
		m_Logger:Error("Instance is nil")
		return
	end

	local s_Clone = _G[p_Instance.typeInfo.name](p_Instance)
	p_Instance = _G[p_Instance.typeInfo.name](p_Instance)

	-- Shallow copy p_Instance if it's a DataContainer, ignore if it's a structure
	if p_Instance.instanceGuid ~= nil then
		if p_Instance.isLazyLoaded then
			-- Report this at ERROR level: it is the exact point a clone silently degrades into
			-- "returned the original", which the caller then treats as a failed clone and answers
			-- by editing the SHARED blueprint instead. Naming the container that bailed is the
			-- difference between "a clone failed somewhere" and knowing what to preload.
			m_Logger:Error("LAZY-BAIL: " .. tostring(p_Instance.typeInfo.name) ..
				" guid=" .. tostring(p_Instance.instanceGuid) ..
				" is lazy-loaded; cloning returns the ORIGINAL from here down.")
			return p_Instance
		end

		if m_CopiedObjects[tostring(p_Instance.instanceGuid)] ~= nil then
			return m_CopiedObjects[tostring(p_Instance.instanceGuid)]
		end

		s_Clone = self:ShallowCopy(p_Instance, p_Guid)

		if s_Clone == nil then
			m_Logger:Write('Cloning returned nil')
		end

		m_CopiedObjects[tostring(p_Instance.instanceGuid)] = s_Clone
	end

	self:_deepCloneFields(s_Clone, p_CurrentDepth)

	if p_CurrentDepth == 0 then
		m_CopiedObjects = nil
	end

	return s_Clone
end

function DataContainerExt:_deepCloneFields(p_Clone, p_CurrentDepth)
	p_Clone = _G[p_Clone.typeInfo.name](p_Clone)
	local s_TypeInfo = p_Clone.typeInfo

	-- We look for fields that are DCs to clone them
	local s_Fields = getFields(s_TypeInfo)

	for _, l_Field in pairs(s_Fields) do
		if l_Field.typeInfo ~= nil then
			local s_Name = firstToLower(l_Field.name)

			if l_Field.typeInfo.array then
				local s_Array = p_Clone[s_Name]
				-- elementType can be NIL on an array field. Indexing .name on it threw
				--     DataContainerExt.lua:356: attempt to index a nil value (field 'elementType')
				-- which killed the ENTIRE clone. The caller reads a failed clone as "fall back to
				-- editing the SHARED blueprint", so one such array silently promoted a
				-- per-instance edit into a permanent blueprint-wide one -- after which every new
				-- spawn of that vehicle was built from the modified blueprint and crashed the game.
				-- Measured on Vehicles/BMP2/BMP2; the F18 has no such field, which is why it cloned
				-- fine and the BMP2 never did.
				--
				-- With no elementType we cannot tell whether the members are printable, so leave
				-- them SHARED rather than throw: unlisted members stay pointing at the stock
				-- blueprint, which is exactly what a path-only clone does everywhere else.
				local s_ElementType = l_Field.typeInfo.elementType

				if s_Array ~= nil and s_ElementType ~= nil then
					for i = #s_Array, 1, -1 do
						local s_Member = s_Array[i]
						if s_Member ~= nil and not isPrintable(s_ElementType.name) and not s_ElementType.enum then
							self:_deepCloneStructOrDC(p_Clone, s_Name, i, p_CurrentDepth)
						end
					end
				elseif s_Array ~= nil and s_ElementType == nil then
					-- No elementType, but the MEMBERS still know what they are. Ask them.
					--
					-- Leaving these shared is not a harmless degradation: a shared member still
					-- points at the STOCK blueprint, so writing anything beneath it edits the
					-- blueprint itself. Vehicles/BMP2/BMP2 has exactly this shape --
					-- `components` has no elementType, and gravityModifier lives at
					-- components.1.vehicleConfig.gravityModifier -- so a per-instance gravity edit
					-- silently became a blueprint-wide one and every vehicle spawned afterwards
					-- inherited it without anyone pressing "apply to blueprint".
					--
					-- Per-member inspection keeps the property that mattered when this fallback
					-- was written (never throw, never fail the whole clone) while cloning the ones
					-- that actually need it.
					local s_Cloned, s_Shared = 0, 0

					for i = #s_Array, 1, -1 do
						local s_Member = s_Array[i]
						local s_MemberType = nil

						if s_Member ~= nil then
							pcall(function() s_MemberType = s_Member.typeInfo end)
						end

						if s_MemberType ~= nil and not isPrintable(s_MemberType.name) and
							not s_MemberType.enum then
							local s_Ok = pcall(function()
								self:_deepCloneStructOrDC(p_Clone, s_Name, i, p_CurrentDepth)
							end)

							if s_Ok then
								s_Cloned = s_Cloned + 1
							else
								s_Shared = s_Shared + 1
							end
						else
							s_Shared = s_Shared + 1
						end
					end

					if s_Shared > 0 then
						-- Loud: anything still shared is a path where an edit can reach the stock
						-- blueprint, and that used to be discoverable only by its side effects.
						m_Logger:Error("Array '" .. tostring(s_Name) .. "' has no elementType: " ..
							tostring(s_Cloned) .. " member(s) cloned, " .. tostring(s_Shared) ..
							" left SHARED -- an edit under a shared member reaches the BLUEPRINT")
					end
				end
				-- It's an object or structure
			elseif not isPrintable(l_Field.typeInfo.name) and not l_Field.typeInfo.enum then
				self:_deepCloneStructOrDC(p_Clone, s_Name, nil, p_CurrentDepth)
			end
		else
			m_Logger:Write("typeInfo nil ?")
		end
	end
end

function DataContainerExt:_deepCloneStructOrDC(p_Clone, p_FieldName, p_FieldIndex, p_CurrentDepth)
	local s_FieldInstance = p_Clone[p_FieldName]

	-- For DCs that are in an array
	if p_FieldIndex then
		s_FieldInstance = s_FieldInstance[p_FieldIndex]
	end

	if s_FieldInstance == nil then
		return
	end

	if s_FieldInstance.instanceGuid == nil then -- Structure
		self:_deepCloneFields(s_FieldInstance, p_CurrentDepth)
	else -- DataContainer
		self:_deepCloneDC(p_Clone, p_FieldName, p_FieldIndex, p_CurrentDepth)
	end
end

function DataContainerExt:_deepCloneDC(p_Clone, p_FieldName, p_FieldIndex, p_CurrentDepth)
	local s_FieldInstance = p_Clone[p_FieldName]

	-- For DCs that are in an array
	if p_FieldIndex then
		s_FieldInstance = s_FieldInstance[p_FieldIndex]
	end

	-- Filter DataContainer
	if s_FieldInstance.typeInfo.name ~= "DataContainer" then
		if p_FieldIndex then
			p_Clone[p_FieldName][p_FieldIndex] = self:DeepClone(s_FieldInstance, nil, p_CurrentDepth + 1)
		else
			p_Clone[p_FieldName] = self:DeepClone(s_FieldInstance, nil, p_CurrentDepth + 1)
		end
	end
end

-- Prints all members and child members of a given instance. Useful for debugging.
function DataContainerExt:PrintFields(p_Instance, p_MaxDepth, p_Padding)
	if p_Instance == nil then
		m_Logger:Error("instance nil")
		return
	end

	local s_TypeInfo = p_Instance.typeInfo

	if s_TypeInfo == nil then
		m_Logger:Error("typeInfo nil")
		return
	end

	self:_printFieldsInternal(p_Instance, s_TypeInfo, p_Padding, 0, p_MaxDepth, nil)
end

function DataContainerExt:_printFieldsInternal(p_Instance, p_TypeInfo, p_Padding, p_CurrentDepth, p_MaxDepth, p_FieldName)
	if p_Instance == nil then
		m_Logger:Error("instance nil")
		return
	end

	p_TypeInfo = p_TypeInfo or p_Instance.typeInfo

	if p_TypeInfo == nil then
		m_Logger:Error("typeInfo nil")
		return
	end

	if m_PrintedObjects == nil then
		m_PrintedObjects = {}
	end

	if p_FieldName == nil then
		p_FieldName = ""
	elseif p_FieldName ~= "" then
		p_FieldName = tostring(p_FieldName) .. " "
	end

	if p_CurrentDepth == nil then
		p_CurrentDepth = 0
	end

	if p_MaxDepth == nil then
		p_MaxDepth = -1
	end

	if p_Padding == nil then
		p_Padding = ""
	end

	if string.match(p_TypeInfo.name:lower(), "voice") or
	string.match(p_TypeInfo.name:lower(), "sound") or
	p_TypeInfo == MaterialContainerPair.typeInfo or
	p_TypeInfo == MaterialContainerAsset.typeInfo then
		return
	end

	local s_Instance = _G[p_Instance.typeInfo.name](p_Instance)

	-- If it has a guid its an object, otherwise its a structure
	if s_Instance.instanceGuid == nil then
		m_Logger:Write(p_Padding ..p_FieldName..'(Structure - '..p_TypeInfo.name..') {')
	else
		-- Not print it if we already printed this object
		if m_PrintedObjects[tostring(s_Instance.instanceGuid)] ~= nil then
			m_Logger:Write(p_Padding ..p_FieldName..'(Object - '..p_TypeInfo.name..') instanceGuid: '.. tostring(s_Instance.instanceGuid).. ' (Printed above) {')
			return
		else
			m_PrintedObjects[tostring(s_Instance.instanceGuid)] = true
		end

		local s_LazyLoadedWarning = ''

		if s_Instance.isLazyLoaded then
			s_LazyLoadedWarning = 'LAZYLOADED!'
		end

		m_Logger:Write(p_Padding ..p_FieldName..'(Object - '..p_TypeInfo.name..') instanceGuid: '.. tostring(s_Instance.instanceGuid).. ' '..s_LazyLoadedWarning..'{')
	end

	--Stop if we have reached max depth
	if p_MaxDepth ~= -1 and p_CurrentDepth > p_MaxDepth then
		return
	end

	p_Padding = p_Padding .. " "

	local s_Fields = getFields(p_TypeInfo)

	for _, l_Field in ipairs(s_Fields) do
		if l_Field.typeInfo == nil then
			m_Logger:Write("field.typeInfo == nil")
			goto continue
		elseif l_Field.name == "MaterialPairs" then
			m_Logger:Write("MaterialPairs isn't supported, ignoring.")
			goto continue
		end

		local s_Name = firstToLower(l_Field.name)

		if isPrintable(l_Field.typeInfo.name) then
			local s_Value = s_Instance[s_Name]
			m_Logger:Write(p_Padding ..l_Field.name..' ('..l_Field.typeInfo.name..') : '.. tostring(s_Value))
		--Array
		elseif l_Field.typeInfo.array then
			local s_Array = s_Instance[s_Name]

			if s_Array == nil then
				m_Logger:Write(p_Padding ..l_Field.name..' (Array), nil')
			else
				m_Logger:Write(p_Padding ..l_Field.name..' (Array), '..tostring(#s_Array)..' Members {')
				for i = 1, #s_Array, 1 do
					local s_Member = s_Array[i]

					if s_Member == nil then
						goto continue1
					end

					if l_Field.typeInfo.elementType == nil then
						m_Logger:Write(p_Padding .. "[" .. i .. "] (no elementType)")
					elseif isPrintable(l_Field.typeInfo.elementType.name) then
						m_Logger:Write(p_Padding .."[" .. i .. "] "..' ('..l_Field.typeInfo.elementType.name..') : '.. tostring(s_Member))
					elseif l_Field.typeInfo.elementType.enum then
						m_Logger:Write(p_Padding .."[" .. i .. "] "..' (Enum) : '.. tostring(s_Member))
					else
						self:_printFieldsInternal(s_Member, s_Member.typeInfo, p_Padding, p_CurrentDepth + 1, p_MaxDepth)
					end

					::continue1::
				end

				m_Logger:Write(p_Padding .. "}")
			end
		--Enum
		elseif l_Field.typeInfo.enum then
			local s_Value = s_Instance[s_Name]
			m_Logger:Write(p_Padding..l_Field.name..' (Enum) : ' .. tostring(s_Value))
		--Object or Structure
		else
			if s_Instance[s_Name] ~= nil then
				-- local s_Value = s_Instance[s_Name]
				local i = _G[l_Field.typeInfo.name](s_Instance[s_Name])
				if i ~= nil then
					-- p_Padding = p_Padding .. "	"
					self:_printFieldsInternal( i, i.typeInfo, p_Padding, p_CurrentDepth + 1, p_MaxDepth, l_Field.name)
				end
			else
				m_Logger:Write(p_Padding ..l_Field.name..' (Object - '..l_Field.typeInfo.name..') nil')
			end
		end

		::continue::
	end

	m_Logger:Write(p_Padding:sub(1, -3) .. "}")

	-- Clear printed objects
	if p_CurrentDepth == 0 then
		m_PrintedObjects = nil
	end
end

--- Fields grouped by the type that DECLARES them, base-most group first.
---
--- getFields() is built on top of this, so the two can never disagree about order or membership:
--- the inspector wants to show a header per declaring type, and deriving that from a SECOND walk
--- would be a second chance to drift from the walk that produced the fields.
---
--- A type that declares no fields of its own contributes no group -- an empty header in the
--- inspector is noise, and the flattened field list is identical either way.
---@param p_TypeInfo TypeInfo
---@param p_Depth number|nil recursion guard, see below
---@return table { { name = <declaring type name>, fields = { <FieldInformation>, ... } }, ... }
function getFieldGroups(p_TypeInfo, p_Depth)
	local s_Groups = {}

	if p_TypeInfo == nil then
		return s_Groups
	end

	local s_Depth = p_Depth or 0

	-- BOUNDED, unlike the walk this replaces. typeInfo.super does not reliably terminate: at the
	-- root it can keep handing back a non-nil typeInfo rather than nil (see EBXManager:SetField,
	-- where an unbounded version of exactly this loop hung the game with no crash and no dump).
	-- The "stop above DataContainer" test below is the only reason the old recursion terminated,
	-- which is fine for a DataContainer chain and nothing else -- structs go through here too.
	if s_Depth < 32 and p_TypeInfo.super ~= nil and p_TypeInfo.super ~= p_TypeInfo then
		if p_TypeInfo.super.name ~= "DataContainer" then
			for _, l_Group in ipairs(getFieldGroups(p_TypeInfo.super, s_Depth + 1)) do
				table.insert(s_Groups, l_Group)
			end
		end
	end

	local s_Own = {}

	if p_TypeInfo.fields ~= nil then
		-- ipairs, NOT pairs: fields must come out in DECLARATION order.
		--
		-- The groups were already base-most first, but pairs() iterates a Lua table in whatever
		-- order it likes, so the fields WITHIN each type came out scrambled -- correct grouping,
		-- arbitrary contents, which still reads as "the ordering is wrong". typeInfo.fields is a
		-- sequence, so ipairs walks it in the order the type declares.
		for _, l_Field in ipairs(p_TypeInfo.fields) do
			table.insert(s_Own, l_Field)
		end
	end

	if #s_Own > 0 then
		table.insert(s_Groups, { name = p_TypeInfo.name, fields = s_Own })
	end

	return s_Groups
end

--- Every field of a type INCLUDING inherited ones, base-most declaration first.
function getFields(p_TypeInfo)
	local s_Fields = {}

	for _, l_Group in ipairs(getFieldGroups(p_TypeInfo)) do
		for _, l_Field in ipairs(l_Group.fields) do
			table.insert(s_Fields, l_Field)
		end
	end

	return s_Fields
end

function isPrintable(p_Type)
	if p_Type == "CString" or
	p_Type == "Single" or
	p_Type == "Float8" or
	p_Type == "Float16" or
	p_Type == "Float32" or
	p_Type == "Float64" or
	p_Type == "Int8" or
	p_Type == "Int16" or
	p_Type == "Int32" or
	p_Type == "Int64" or
	p_Type == "Uint8" or
	p_Type == "Uint16" or
	p_Type == "Uint32" or
	p_Type == "Uint64" or
	p_Type == "LinearTransform" or
	p_Type == "Vec2" or
	p_Type == "Vec3" or
	p_Type == "Vec4" or
	p_Type == "Boolean" or
	p_Type == "Guid" or
	p_Type == "SByte" then
		return true
	end

	return false
end

--- Field name as VEXT exposes it in Lua.
---
--- VEXT lowercases the leading ACRONYM RUN, not just the first character:
---     Name -> name,  FLIRValue -> flirValue,  MPMode -> mpMode,  ID -> id
---
--- This used to be `gsub("^%L", string.lower)`, which lowercases only character 1 and so produced
--- `fLIRValue` / `mPMode` -- names that do not exist. Reading them returned nil, so the deep-copy
--- walkers below skipped those fields entirely and left their sub-containers SHARED with the
--- original: a per-instance edit under any acronym-named field silently leaked to every instance.
--- Values were unaffected (the copy itself is a native :Clone()); only traversal was.
---
--- Note the parentheses: gsub returns (string, count), and returning both would pass a stray
--- integer to anything calling this inline.
function firstToLower(p_String)
	if p_String == nil or p_String == '' then
		return p_String
	end

	local s_Run = p_String:match('^%u+')

	if s_Run == nil then
		return p_String
	end

	if #s_Run == 1 then
		return (p_String:sub(1, 1):lower() .. p_String:sub(2))
	end

	if #s_Run == #p_String then
		return p_String:lower()
	end

	-- The last capital of the run starts the next word: FLIR|Value, MP|Mode.
	return (s_Run:sub(1, #s_Run - 1):lower() .. p_String:sub(#s_Run))
end

function GenerateGuid()
	return Guid(h()..h()..h()..h().."-"..h()..h().."-"..h()..h().."-"..h()..h().."-"..h()..h()..h()..h()..h()..h(), "D")
end

function h()
	local s_Vars = {"A","B","C","D","E","F","0","1","2","3","4","5","6","7","8","9"}
	return s_Vars[math.floor(MathUtils:GetRandomInt(1,16))]..s_Vars[math.floor(MathUtils:GetRandomInt(1,16))]
end

-- Singleton.
if g_DataContainerExt == nil then
	g_DataContainerExt = DataContainerExt()
end

return g_DataContainerExt
