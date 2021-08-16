class 'MapEditorShared'

local m_Logger = Logger("MapEditorShared", false)

function MapEditorShared:__init()
	m_Logger:Write("Initializing MapEditorShared")
	self:RegisterVars()
	self:RegisterEvents()
end

function MapEditorShared:RegisterVars()
	self.m_Blueprints = {}
	self.m_Meshes = {}
	self.m_Variations = {}
	self.m_MeshVariationDatabases = {}

	self.m_IllegalTypes = Util.Set {
		"DebrisClusterData",
		"MeshProxyEntityData"
	}
end


function MapEditorShared:RegisterEvents()
	self.m_PartitionLoadedEvent = Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
end


function MapEditorShared:OnPartitionLoaded(p_Partition)
	if p_Partition == nil then
		return
	end

	local s_Instances = p_Partition.instances

	for _, l_Instance in ipairs(s_Instances) do
		if l_Instance == nil then
			goto continue
		end

		-- Catch all blueprints
		if  l_Instance.typeInfo == ObjectBlueprint.typeInfo or
		--l_Instance.typeInfo.name == "PrefabBlueprint" or
		--l_Instance.typeInfo.name == "SpatialPrefabBlueprint" or
		l_Instance.typeInfo == EffectBlueprint.typeInfo or
		l_Instance.typeInfo == VehicleBlueprint.typeInfo then

			local s_Instance = _G[l_Instance.typeInfo.name](l_Instance)

			-- m_Logger:Write(tostring(l_Instance.instanceGuid).." --- "..tostring(p_Partition.guid))

			-- We're not storing the actual instance since we'd rather look it up manually in case of a reload.
			if l_Instance.typeInfo == ObjectBlueprint.typeInfo then
				if s_Instance.object == nil or self.m_IllegalTypes[s_Instance.object.typeInfo.name] == true then
					goto continue
				end
			end

			self.m_Blueprints[tostring(l_Instance.instanceGuid)] = {
				instanceGuid = tostring(l_Instance.instanceGuid),
				partitionGuid = tostring(p_Partition.guid),
				name = s_Instance.name,
				typeName = l_Instance.typeInfo.name,
				variations = {}
			}
		end

		-- Catch all mesh assets
		if l_Instance.typeInfo.super == MeshAsset.typeInfo then
			local s_Instance = MeshAsset(l_Instance)
			self.m_Meshes[s_Instance.name:lower()] = tostring(l_Instance.instanceGuid)
		end

		-- Catch all variations
		if l_Instance.typeInfo == MeshVariationDatabase.typeInfo then
			local s_Instance = MeshVariationDatabase(l_Instance)
			Patches:PatchMeshVariationDatabase(s_Instance)
			table.insert(self.m_MeshVariationDatabases, s_Instance)
		end

		::continue::
	end
end

function MapEditorShared:FillVariations()
	for _, l_Database in pairs(self.m_MeshVariationDatabases) do
		local s_Instance = l_Database
		for _, l_Entry in ipairs(s_Instance.entries) do
			local s_MeshVariationDatabaseEntry = MeshVariationDatabaseEntry(l_Entry)

			if s_MeshVariationDatabaseEntry.mesh == nil then
				return
			end

			local s_MeshGuid = tostring(s_MeshVariationDatabaseEntry.mesh.instanceGuid)
			-- local s_Mesh = Asset(s_MeshVariationDatabaseEntry.mesh)

			if self.m_Variations[s_MeshGuid] == nil then
				self.m_Variations[s_MeshGuid] = {}
			end

			table.insert(self.m_Variations[s_MeshGuid], s_MeshVariationDatabaseEntry.variationAssetNameHash)
		end
	end

	for l_Index, l_Blueprint in pairs(self.m_Blueprints) do
		if self.m_Meshes[l_Blueprint.name:lower() .. "_mesh"] == nil then
			m_Logger:Write("Missing: " .. l_Blueprint.name .. "_mesh")
		else
			local s_MeshGuid = self.m_Meshes[l_Blueprint.name:lower() .. "_mesh"]

			if self.m_Variations[s_MeshGuid] ~= nil then
				self.m_Blueprints[l_Index].variations = self.m_Variations[s_MeshGuid]
			else
				m_Logger:Write("No variation for " .. l_Blueprint.name)
			end
		end
	end
end

return MapEditorShared
