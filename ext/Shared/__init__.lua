class 'MapEditorShared'

require "__shared/Enums"
local m_InstanceParser = require "__shared/InstanceParser"


function MapEditorShared:__init()
	print("Initializing MapEditorShared")
	self:RegisterVars()
	self:RegisterEvents()
end

function MapEditorShared:RegisterVars()

end

function MapEditorShared:RegisterEvents()
	self.m_PartitionLoadedEvent = Events:Subscribe('Partition:Loaded', self, self.OnPartitionLoaded)
end

function MapEditorShared:OnPartitionLoaded(p_Partition)
	m_InstanceParser:OnPartitionLoaded(p_Partition)
end

return MapEditorShared()

