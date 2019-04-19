class 'MapEditorShared'

require "__shared/Util/Logger"
require "__shared/Util/Util"
require "__shared/Modules/ObjectManager"
require "__shared/Modules/Backend"
require "__shared/Modules/InstanceParser"
require "__shared/Types/Commands"
require "__shared/Types/Enums"
require "__shared/Types/GameObject"

require "__shared/EditorCommon"



local m_Logger = Logger("MapEditorShared", true)

function MapEditorShared:__init()
	m_Logger:Write("Initializing MapEditorShared")

end

return MapEditorShared()