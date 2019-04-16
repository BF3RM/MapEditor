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

return EditorCommon