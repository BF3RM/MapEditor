---@class MapEditorShared
MapEditorShared = class 'MapEditorShared'

require "__shared/Config"
require "__shared/Util/Logger"
Coroutiner = require "__shared/Util/Coroutiner"
require "__shared/Util/Util"
DataContainerExt = require "__shared/Util/DataContainerExt"
FastLoad = require "__shared/FastLoad"
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

function MapEditorShared:__init()
	m_Logger:Write("Initializing MapEditorShared")
	Events:Subscribe('Level:Destroy', self, self.OnLevelDestroy)
	Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)
	Events:Subscribe('Level:LoadResources', self, self.OnLoadResources)
	Events:Subscribe('Level:Loaded', self, self.OnLevelLoaded)
	Events:Subscribe('Extension:Unloading', self, self.OnExtensionUnloading)
end

function MapEditorShared:OnEngineUpdate(p_Delta, p_SimulationDelta)
	Timer:OnEngineUpdate(p_Delta, p_SimulationDelta)
end

function MapEditorShared:OnLevelDestroy()
	Timer:OnResetData()
	InstanceParser:OnLevelDestroy()
end

---@param p_LevelName string
---@param p_GameMode string
---@param p_IsDedicatedServer boolean
function MapEditorShared:OnLoadResources(p_LevelName, p_GameMode, p_IsDedicatedServer)
	FastLoad:OnLoadResources(p_LevelName, p_GameMode, p_IsDedicatedServer)
end

---@param p_LevelName string
---@param p_GameMode string
function MapEditorShared:OnLevelLoaded(p_LevelName, p_GameMode)
	FastLoad:OnLevelLoaded(p_LevelName, p_GameMode)
end

function MapEditorShared:OnExtensionUnloading()
	FastLoad:OnExtensionUnloading()
end

return MapEditorShared()
