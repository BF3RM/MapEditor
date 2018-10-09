class 'MapEditorShared'

require "__shared/Enums"


function MapEditorShared:__init()
	print("Initializing MapEditorShared")
	self:RegisterVars()
	self:RegisterEvents()
end

function MapEditorShared:RegisterVars()

end

function MapEditorShared:RegisterEvents()
end

function MapEditorShared:OnPartitionLoaded(p_Partition)
end

return MapEditorShared()

