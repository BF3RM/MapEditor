class 'MapEditorShared'

require "__shared/Config"
require "__shared/Util/Logger"
Coroutiner = require "__shared/Util/Coroutiner"
require "__shared/Util/Util"
DataContainerExt = require "__shared/Util/DataContainerExt"
--require "__shared/Modules/ObjectManager"
require "__shared/Modules/GameObjectManager"
require "__shared/Modules/CommandActions"
--require "__shared/Modules/VanillaBlueprintsParser"
require "__shared/Modules/InstanceParser"
require "__shared/Enums/Enums"
require "__shared/GameData/GameModes"
require "__shared/GameData/Maps"
require "__shared/GameData/SuperBundles"
require "__shared/GameData/Bundles"
require "__shared/GameData/Blueprints"
require "__shared/EditorCommon"
require "__shared/Types/AABB"
require "__shared/Types/CtrRef"
require "__shared/Types/CommandActionResult"
require "__shared/Types/GameEntity"
require "__shared/Types/GameEntityTransferData"
require "__shared/Types/GameObject"
require "__shared/Types/GameObjectTransferData"
require "__shared/Types/GameObjectParentData"
require "__shared/Types/GameObjectSaveData"
Patches = require "__shared/Patches/Patches"
Timer = require "__shared/Util/Timer"

local m_Logger = Logger("MapEditorShared", false)

local m_SettingsGuids = {
	partitionGuid = Guid('C4DCACFF-ED8F-BC87-F647-0BC8ACE0D9B4'),
	instanceGuid = Guid('818334B3-CEA6-FC3F-B524-4A0FED28CA35'),
}

function MapEditorShared:__init()
	m_Logger:Write("Initializing MapEditorShared")
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
	Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)

	ResourceManager:RegisterInstanceLoadHandler(m_SettingsGuids.partitionGuid, m_SettingsGuids.instanceGuid, self, self._updateTimeoutSettings)
end

function MapEditorShared:_updateTimeoutSettings(p_Instance)
	if SharedUtils:IsClientModule()	then
		p_Instance = ClientSettings(p_Instance)
		p_Instance:MakeWritable()
		p_Instance.loadedTimeout = ME_CONFIG.LOADING_TIMEOUT
		p_Instance.loadingTimeout = ME_CONFIG.LOADING_TIMEOUT
		p_Instance.ingameTimeout = ME_CONFIG.LOADING_TIMEOUT
		m_Logger:Write("Changed ClientSettings")
	else
		p_Instance = ServerSettings(p_Instance)
		p_Instance:MakeWritable()
		p_Instance.loadingTimeout = ME_CONFIG.LOADING_TIMEOUT
		p_Instance.ingameTimeout = ME_CONFIG.LOADING_TIMEOUT
		p_Instance.timeoutTime = ME_CONFIG.LOADING_TIMEOUT
		m_Logger:Write("Changed ServerSettings")
	end
end

function MapEditorShared:OnEngineUpdate(p_Delta, p_SimulationDelta)
	Timer:OnEngineUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorShared:OnLevelDestroy()
	Timer:OnResetData()
	InstanceParser:OnLevelDestroy()
end

return MapEditorShared()
