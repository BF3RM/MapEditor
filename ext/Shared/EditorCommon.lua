class 'EditorCommon'

local m_Logger = Logger("EditorCommon", true)


function EditorCommon:__init()
    m_Logger:Write("Initializing EditorCommon")
    self:RegisterVars()
end

function EditorCommon:RegisterVars()

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
