class 'InstanceParser'

function InstanceParser:__init()
	print("Initializing InstanceParserClient")
	self:RegisterVars()
	self:RegisterEvents()
end


function InstanceParser:RegisterVars()
	self.m_Blueprints = {}
	self.m_Meshes = {}
	self.m_Variations = {}
	self.m_MeshVariationDatabases = {}
	self.m_StaticModelGroupDatabase = {}

	self.m_IllegalTypes = Set {
		"DebrisClusterData",
		"MeshProxyEntityData"
	}


    self.m_BlueprintInstances = {}
end


function InstanceParser:Clear()
    self:RegisterVars()
end

function InstanceParser:GetPartition(p_InstanceGuid)
    return self.m_BlueprintInstances[tostring(p_InstanceGuid)]
end
function InstanceParser:RegisterEvents()
end

--TODO: Redo this whole fucking thing.


function InstanceParser:OnPartitionLoaded(p_Partition)
	if p_Partition == nil then
		return
	end
	
	local s_Instances = p_Partition.instances

    local s_PrimaryInstance = p_Partition.primaryInstance
    local s_Blueprint = false
    if(s_PrimaryInstance:Is("Blueprint") and not s_PrimaryInstance.typeInfo.name == "WorldPartData" and not s_PrimaryInstance.typeInfo.name == "SubWorldData") then
        s_Blueprint = true
    end

	for _, l_Instance in ipairs(s_Instances) do
		if l_Instance == nil then
			print('Instance is null?')
			goto continue
		end

        if(s_Blueprint) then
            self.m_BlueprintInstances[tostring(l_Instance.instanceGuid)] = tostring(p_Partition.guid)
        end

		-- Catch all blueprints
		if l_Instance:Is("Blueprint") then

			local s_Instance = _G[l_Instance.typeInfo.name](l_Instance)
			-- print(tostring(l_Instance.instanceGuid).." --- "..tostring(p_Partition.guid))
			-- We're not storing the actual instance since we'd rather look it up manually in case of a reload.
			if(l_Instance.typeInfo.name == "ObjectBlueprint") then
				if(s_Instance.object == nil or self.m_IllegalTypes[s_Instance.object.typeInfo.name] == true) then
					return
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
		if(l_Instance.typeInfo.super.name == "MeshAsset") then
			local s_Instance = MeshAsset(l_Instance)
			self.m_Meshes[s_Instance.name:lower()] = tostring(l_Instance.instanceGuid)
		end

		-- Catch all variations
		if(l_Instance.typeInfo.name == "MeshVariationDatabase") then
			local s_Instance = MeshVariationDatabase(l_Instance)
			table.insert(self.m_MeshVariationDatabases, s_Instance)
		end

		if(l_Instance.typeInfo.name == "StaticModelGroupEntityData") then
			local s_Instance = StaticModelGroupEntityData(l_Instance)
			for i,l_Member in ipairs(s_Instance.memberDatas) do
				local s_Member = StaticModelGroupMemberData(l_Member)
				if(#s_Member.instanceObjectVariation > 0) then
					local s_MemberType = StaticModelEntityData(s_Member.memberType)
					if(s_MemberType ~= nil) then
						local s_Mesh = tostring(s_MemberType.mesh.instanceGuid)

						local s_Variations = {}
						for i2, l_Variation in ipairs(s_Member.instanceObjectVariation ) do
							-- Eww
							s_Variations[l_Variation] = l_Variation
						end

						if(self.m_Variations[s_Mesh] == nil) then
							self.m_Variations[s_Mesh] = {}
						end

						for i3, l_Variation in pairs(s_Variations) do
							local s_Variation = {
								hash =l_Variation,
								name ="fuck"
							}
							table.insert(self.m_Variations[s_Mesh], s_Variation)
						end
					end
				end
			end
		end

		::continue::
	end


end

function InstanceParser:FillVariations()
	print("FILL")

	for key, database in pairs(self.m_MeshVariationDatabases) do
		local s_Instance = database
		for k, v in ipairs(s_Instance.entries) do
			local l_mvdEntry = MeshVariationDatabaseEntry(v)
			if(l_mvdEntry.mesh == nil) then
				return
			end
			local l_MeshGuid = tostring(l_mvdEntry.mesh.instanceGuid)
			local mesh = Asset(l_mvdEntry.mesh)
			if(self.m_Variations[l_MeshGuid] == nil) then
				self.m_Variations[l_MeshGuid] = {}
			end
			local s_Hash = l_mvdEntry.variationAssetNameHash
			local s_Variation = {
				hash =s_Hash,
				name ="fuck"
			}

			table.insert(self.m_Variations[l_MeshGuid], s_Variation)
		end
	end
	for k, v in pairs(self.m_Blueprints) do
		if(self.m_Meshes[v.name:lower() .. "_mesh"] == nil) then
			--print("Missing: " .. v.name .. "_mesh")
		else
			local l_MeshGuid = self.m_Meshes[v.name:lower() .. "_mesh"]

			if(self.m_Variations[l_MeshGuid] ~= nil ) then
				self.m_Blueprints[k].variations = self.m_Variations[l_MeshGuid]
				local jsonTest = (json.encode(self.m_Variations[l_MeshGuid]))
				if(jsonTest == nil) then
					print("------------------")
					print(self.m_Variations[l_MeshGuid])
					print("------------------")
				end
			else
				print("No variation for " .. v.name)
			end
		end
	end
end

return InstanceParser()

