---@class InstanceParser
InstanceParser = class 'InstanceParser'

local m_Logger = Logger("InstanceParser", false)

function InstanceParser:__init(p_Realm)
	m_Logger:Write("Initializing InstanceParser")
	self.m_Realm = p_Realm
	self:RegisterVars()
	self:RegisterEvents()
end

function InstanceParser:RegisterVars()
	m_Logger:Write("Registered vars")
	self.m_Blueprints = {}
	self.m_Meshes = {}
	self.m_Variations = {}
	self.m_MeshVariationDatabases = {}
	self.m_StaticModelGroupDatabase = {}
	self.m_StaticModelGroupEntityDataGuids = {}
	self.m_ObjectVariations = {}

	self.m_IllegalTypes = Set {
		"DebrisClusterData",
		"MeshProxyEntityData"
	}

	self.m_BlueprintInstances = {}
	self.m_PrimaryInstances = {}
	self.m_LevelDatas = {}
end

function InstanceParser:OnLevelDestroy()
	self.m_MeshVariationDatabases = {}
end

function InstanceParser:Clear()
	--self:RegisterVars()
end

function InstanceParser:GetPartition(p_InstanceGuid)
	return self.m_BlueprintInstances[tostring(p_InstanceGuid)]
end

function InstanceParser:GetPrimaryInstance(p_PartitionGuid)
	return self.m_PrimaryInstances[tostring(p_PartitionGuid)]
end

function InstanceParser:GetLevelDatas()
	return self.m_LevelDatas
end

function InstanceParser:GetLevelData(guid)
	return self.m_LevelDatas[guid]
end

function InstanceParser:RegisterEvents()
end

--TODO: Redo this whole fucking thing.

function InstanceParser:OnLevelLoaded(p_MapName, p_GameModeName)
	--m_Logger:Write(self.m_StaticModelGroupEntityDataGuids)

	for _, l_Data in pairs(self.m_StaticModelGroupEntityDataGuids) do
		---@type StaticModelGroupEntityData|DataContainer|nil
		local s_Instance = ResourceManager:FindInstanceByGuid(Guid(l_Data.partitionGuid), Guid(l_Data.instanceGuid))

		if s_Instance == nil then
			m_Logger:Write('Couldn\'t find DataContainer. PartitionGuid: '.. tostring(l_Data.partitionGuid)..', instanceGuid'..tostring(l_Data.instanceGuid))
			goto continue
		end

		s_Instance = StaticModelGroupEntityData(s_Instance)

		for _, l_Member in ipairs(s_Instance.memberDatas) do
			local s_Member = StaticModelGroupMemberData(l_Member)

			if #s_Member.instanceObjectVariation > 0 then
				local s_MemberType = StaticModelEntityData(s_Member.memberType)

				if s_MemberType ~= nil then
					local s_Mesh = tostring(s_MemberType.mesh.instanceGuid)
					local s_Variations = {}

					for _, l_Variation in ipairs(s_Member.instanceObjectVariation ) do
						-- Eww
						s_Variations[l_Variation] = l_Variation
					end

					if self.m_Variations[s_Mesh] == nil then
						self.m_Variations[s_Mesh] = {}
					end

					for _, l_Variation in pairs(s_Variations) do
						local s_Variation = {
							hash = l_Variation,
							name = self.m_ObjectVariations[l_Variation]
						}
						self.m_Variations[s_Mesh][l_Variation] = s_Variation
					end
				end
			end
		end

		::continue::
	end
end

function InstanceParser:OnPartitionLoaded(p_Partition)
	if p_Partition == nil then
		return
	end

	local s_Instances = p_Partition.instances

	local s_PrimaryInstance = _G[p_Partition.primaryInstance.typeInfo.name](p_Partition.primaryInstance)
	local s_Blueprint = false

	if s_PrimaryInstance == nil then
		m_Logger:Error("Primary is nil")
		return
	end

	if s_PrimaryInstance:Is("Blueprint") then
		s_PrimaryInstance = _G[s_PrimaryInstance.typeInfo.name](s_PrimaryInstance)
		s_Blueprint = true
	end

	self.m_PrimaryInstances[tostring(p_Partition.guid)] = tostring(s_PrimaryInstance.instanceGuid);

	for _, l_Instance in ipairs(s_Instances) do
		if l_Instance == nil then
			m_Logger:Write('Instance is null?')
			goto continue
		end

		if s_Blueprint == true then
			local s_Autogen = false

			if string.match(s_PrimaryInstance.name, "nongroupable_autogen") ~= nil then
				s_Autogen = true
			end

			-- If the map uses both the autogen and the original prefab, use the original prefab instead.
			--if self.m_BlueprintInstances[tostring(l_Instance.instanceGuid)] ~= nil then
			--	if s_Autogen == false then
			--		m_Logger:Write("Replacing Autogen: " .. s_PrimaryInstance.name .. " - " .. tostring(l_Instance.instanceGuid))
			--		self.m_BlueprintInstances[tostring(l_Instance.instanceGuid)] = tostring(p_Partition.guid)
			--	end
			--else
			self.m_BlueprintInstances[tostring(l_Instance.instanceGuid)] = tostring(p_Partition.guid)
			--end
		end

		-- Catch all blueprints
		if l_Instance:Is("Blueprint") then
			local s_Instance = _G[l_Instance.typeInfo.name](l_Instance)
			-- m_Logger:Write(tostring(l_Instance.instanceGuid).." --- "..tostring(p_Partition.guid))
			-- We're not storing the actual instance since we'd rather look it up manually in case of a reload.

			self.m_Blueprints[tostring(l_Instance.instanceGuid)] = {
				instanceGuid = tostring(l_Instance.instanceGuid),
				partitionGuid = tostring(p_Partition.guid),
				name = s_Instance.name,
				typeName = l_Instance.typeInfo.name,
				variations = {}
			}
		end

		-- Catch all mesh assets
		if l_Instance.typeInfo.super.name == "MeshAsset" then
			local s_Instance = MeshAsset(l_Instance)
			self.m_Meshes[s_Instance.name:lower()] = tostring(l_Instance.instanceGuid)
		end

		-- Catch all variations
		if l_Instance.typeInfo.name == "MeshVariationDatabase" then
			local s_Instance = MeshVariationDatabase(l_Instance)
			table.insert(self.m_MeshVariationDatabases, s_Instance)
		end

		if l_Instance.typeInfo.name == "ObjectVariation" then
			local s_Instance = ObjectVariation(l_Instance)
			self.m_ObjectVariations[s_Instance.nameHash] = s_Instance.name
		end

		if l_Instance.typeInfo.name == "StaticModelGroupEntityData" then
			table.insert(self.m_StaticModelGroupEntityDataGuids, {
				instanceGuid = l_Instance.instanceGuid,
				partitionGuid = p_Partition.guid
			})
		end

		if l_Instance.typeInfo.name == "LevelData" then
			local s_Instance = LevelData(l_Instance)
			m_Logger:Write(s_Instance.name)
			self.m_LevelDatas[tostring(l_Instance.instanceGuid)] = {
				partitionGuid = tostring(p_Partition.guid),
				instanceGuid = tostring(l_Instance.instanceGuid),
				name = s_Instance.name
			}
		end

		::continue::
	end
end

function InstanceParser:IsValidVariation(p_InstanceGuid, p_VariationHash)
	local s_Blueprint = self.m_Blueprints[tostring(p_InstanceGuid)]

	if not s_Blueprint then
		m_Logger:Error('Could not find blueprint with instanceGuid: '.. tostring(p_InstanceGuid))
		return false
	end

	for _, l_Variation in pairs(s_Blueprint.variations) do
		if p_VariationHash == l_Variation.hash then
			return true
		end
	end
	return false
end

function InstanceParser:GetDefaultVariation(p_InstanceGuid)
	local s_Blueprint = self.m_Blueprints[tostring(p_InstanceGuid)]

	if not s_Blueprint then
		m_Logger:Error('Could not find blueprint with instanceGuid: '.. tostring(p_InstanceGuid))
		return nil
	end

	if s_Blueprint.variations[1] then
		return s_Blueprint.variations[1].hash
	end
end

function InstanceParser:FillVariations()
	--m_Logger:Write("FILL")
	--m_Logger:Write(#self.m_MeshVariationDatabases)
	--m_Logger:Write(#self.m_Blueprints)
	--m_Logger:Write(#self.m_BlueprintInstances)

	for _, l_Database in pairs(self.m_MeshVariationDatabases) do
		local s_Instance = l_Database

		for _, l_Entry in ipairs(s_Instance.entries) do
			local s_MeshVariationDatabaseEntry = MeshVariationDatabaseEntry(l_Entry)

			if s_MeshVariationDatabaseEntry.mesh == nil then
				return
			end

			local s_MeshGuid = tostring(Asset(s_MeshVariationDatabaseEntry.mesh).instanceGuid)
			--local s_Mesh = Asset(s_MeshVariationDatabaseEntry.mesh)

			if self.m_Variations[s_MeshGuid] == nil then
				self.m_Variations[s_MeshGuid] = {}
			end

			local s_Hash = s_MeshVariationDatabaseEntry.variationAssetNameHash
			local s_Variation = {
				hash = s_Hash,
				name = self.m_ObjectVariations[s_Hash]
			}

			self.m_Variations[s_MeshGuid][s_Hash] = s_Variation
		end
	end

	for _, l_Blueprint in pairs(self.m_Blueprints) do
		local s_MeshGuid = self.m_Meshes[l_Blueprint.name:lower() .. "_mesh"]

		if s_MeshGuid == nil then
			--m_Logger:Write("Missing: " .. v.name .. "_mesh")
		else
			if self.m_Variations[s_MeshGuid] ~= nil then
				l_Blueprint.variations = {}

				for _, l_Variation in pairs(self.m_Variations[s_MeshGuid]) do
					table.insert(l_Blueprint.variations, l_Variation)
				end

				--- NOTE: json.encode causes a crash when the round restarts for some reason
				--local jsonTest = (json.encode(self.m_Variations[l_MeshGuid]))
				--if(jsonTest == nil) then
				--	m_Logger:Write("------------------")
				--	m_Logger:Write(self.m_Variations[l_MeshGuid])
				--	m_Logger:Write("------------------")
				--end
			else
				m_Logger:Write("No variation for " .. l_Blueprint.name)
			end
		end
	end
end

if SharedUtils:IsClientModule() then
	InstanceParser = InstanceParser(Realm.Realm_Client)
else
	InstanceParser = InstanceParser(Realm.Realm_Server)
end

return InstanceParser
