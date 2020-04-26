class 'EditorCommon'

local m_Logger = Logger("EditorCommon", true)


function EditorCommon:__init()
    m_Logger:Write("Initializing EditorCommon")
    self:RegisterVars()
end

function EditorCommon:RegisterVars()

end

function EditorCommon:OnPartitionLoaded(p_Partition)
    if p_Partition == nil then
        return
    end

    local s_Instances = p_Partition.instances

    for _, l_Instance in ipairs(s_Instances) do
        if l_Instance == nil then
            m_Logger:Write('Instance is null?')
            goto continue
        end
	    if(l_Instance.instanceGuid == Guid('117FDD9E-0904-4923-818E-0FFF2CBF5B83')) then -- Remove common rose input hook
			local s_Instance = InstanceOutputNode(l_Instance)
		    s_Instance:MakeWritable()
		    s_Instance.id = MathUtils:FNVHash("CommoRoseReleased")
	    end
	    if(l_Instance.instanceGuid == Guid('3A3B6678-9158-4536-AD55-200DCF392A9D') or l_Instance.instanceGuid == Guid('1BC94AE0-743A-4D1E-B2DB-F203A999F758')) then -- Remove common rose input hook
		    local s_Instance = UINodePort(l_Instance)
		    s_Instance:MakeWritable()
		    s_Instance.query = UIWidgetEventID.UIWidgetEventID_None
	    end

        ::continue::
    end
end

function EditorCommon:OnEntityCreate(p_Hook, p_Data, p_Transform)

end

function EditorCommon:OnLoadBundles(p_Hook, p_Bundles, p_Compartment, p_ProjectHeader)
    if p_ProjectHeader == nil then
        return
    end

	-- Catch the earliest possible bundle. Both server & client.
	if(p_Bundles[1] == "gameconfigurations/game" or p_Bundles[1] == "UI/Flow/Bundle/LoadingBundleMp") then 
		-- Mount your superbundle and bundles..

        -- for _, s_BundleName in pairs(p_ProjectHeader.requiredBundles) do
        --     local s_Bundle = Bundles[s_BundleName] -- Bundles doesnt exit yet

        --     Events:Dispatch('BundleMounter:LoadBundles', s_Bundle.superBundle, s_Bundle.path)
        -- -- TODO Might make sense to gather all bundles of a superbundle and send them together, but not sure if worth the effort
        -- end
	end
end

return EditorCommon