class 'MapEditorShared'

require "__shared/Util/Logger"
require "__shared/Util/Util"
require "__shared/Modules/ObjectManager"
require "__shared/Modules/CommandActions"
require "__shared/Modules/VanillaBlueprintsParser"
require "__shared/Modules/InstanceParser"
require "__shared/Types/Enums"
require "__shared/EditorCommon"
require "__shared/Types/AABB"
require "__shared/Types/CtrRef"
require "__shared/Types/CommandActionResult"
require "__shared/Types/GameEntityData"
require "__shared/Types/GameObjectTransferData"
require "__shared/Types/GameObjectParentData"



local m_Logger = Logger("MapEditorShared", true)

function MapEditorShared:__init()
	m_Logger:Write("Initializing MapEditorShared")

end

return MapEditorShared()