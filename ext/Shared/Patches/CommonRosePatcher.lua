-- Removes common rose
ResourceManager:RegisterInstanceLoadHandler(Guid('5F7105D8-9B3E-11E0-B3DC-96FE79F1995E'), Guid('117FDD9E-0904-4923-818E-0FFF2CBF5B83'), function(p_Instance)
	local s_Instance = InstanceOutputNode(p_Instance)
	s_Instance:MakeWritable()
	s_Instance.id = MathUtils:FNVHash("CommoRoseReleased")
end)

ResourceManager:RegisterInstanceLoadHandler(Guid('5F7105D8-9B3E-11E0-B3DC-96FE79F1995E'), Guid('3A3B6678-9158-4536-AD55-200DCF392A9D'), function(p_Instance)
	local s_Instance = UINodePort(p_Instance)
	s_Instance:MakeWritable()
	s_Instance.query = UIWidgetEventID.UIWidgetEventID_None
end)

ResourceManager:RegisterInstanceLoadHandler(Guid('5F7105D8-9B3E-11E0-B3DC-96FE79F1995E'), Guid('1BC94AE0-743A-4D1E-B2DB-F203A999F758'), function(p_Instance)
	local s_Instance = UINodePort(p_Instance)
	s_Instance:MakeWritable()
	s_Instance.query = UIWidgetEventID.UIWidgetEventID_None
end)
