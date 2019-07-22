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

        -- TODO: Properly invoke bundle mounting
        -- for _, bundle in pairs(p_ProjectHeader.requiredBundles) do

        -- end

        -- Events:Dispatch('BundleMounter:LoadBundle', 'levels/sp_paris/sp_paris', {
        --     "levels/sp_paris/heat_pc_only",
        --     "levels/sp_paris/sp_paris",
        --     "levels/sp_paris/chase",
        --     "levels/sp_paris/loweroffice",
        --     "levels/sp_paris/loweroffice_pc"
        -- })
	end
end

return EditorCommon