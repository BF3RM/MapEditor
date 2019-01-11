class 'InstanceParser'

function InstanceParser:__init()
    print("Initializing InstanceParserServer")
    self:RegisterVars()
    self:RegisterEvents()
end


function InstanceParser:RegisterVars()
    self.m_Blueprints = {}
end


function InstanceParser:Clear()
end

function InstanceParser:RegisterEvents()
end

--TODO: Redo this whole fucking thing.


function InstanceParser:OnPartitionLoaded(p_Partition)
    if p_Partition == nil then
        return
    end

    local s_Instances = p_Partition.instances



end

return InstanceParser()

