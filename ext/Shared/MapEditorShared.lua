class 'MapEditorShared'

function MapEditorShared:__init()
	print("Initializing MapEditorShared")
	self:RegisterVars()
	self:RegisterEvents()
end


function MapEditorShared:RegisterVars()
	self.m_BlueprintInstances = {}
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
			print('Instance is null?')
			goto continue
		end


		if(l_Instance.typeInfo.name == "ObjectBlueprint" or
			l_Instance.typeInfo.name == "PrefabBlueprint") then

			local s_Instance = _G[l_Instance.typeInfo.name](l_Instance)
			-- print(tostring(l_Instance.instanceGuid).." --- "..tostring(p_Partition.guid))
			-- We're not storing the actual instance since we'd rather look it up manually in case of a reload.
			local s_ID = #self.m_BlueprintInstances + 1
			self.m_BlueprintInstances[s_ID] = {
				instanceGuid = tostring(l_Instance.instanceGuid),
				partitionGuid = tostring(p_Partition.guid),
				name = s_Instance.name,
				typeName = l_Instance.typeInfo.name
			}
		end

		::continue
	end
end

return MapEditorShared

