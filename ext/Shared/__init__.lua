class 'MapEditorShared'

require "__shared/Util/Logger"
require "__shared/Util/Util"
require "__shared/ObjectManager"
require "__shared/Backend"
require "__shared/InstanceParser"
require "__shared/Commands"
require "__shared/Enums"


local m_Logger = Logger("MapEditorShared", true)

function MapEditorShared:__init()
	m_Logger:Write("Initializing MapEditorShared")

end

return MapEditorShared()