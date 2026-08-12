---@class ProjectManager
ProjectManager = class 'ProjectManager'

local m_Logger = Logger("ProjectManager", false)

-- 0.1.3: object order is now guaranteed by unique, strictly-increasing creation timestamps.
-- Saves written before this can contain COLLIDING timestamps (bulk spawns landed in the same
-- millisecond), so upgrading re-spaces them once — see RespaceDuplicateTimestamps.
local SAVE_VERSION = "0.1.3"

function ProjectManager:__init()
	m_Logger:Write("Initializing ProjectManager")

	self.m_CurrentProjectHeader = nil -- dont reset this, is required info for map restart
	self.m_ProjectLoadingState = ProjectLoadingState.Loaded

	self:RegisterVars()
	self:RegisterEvents()
end

function ProjectManager:RegisterVars()
	self.m_MapName = nil
	self.m_GameMode = nil
	self.m_LoadedBundles = {}
	self.m_GUID_To_Timestamps = {}
end

function ProjectManager:RegisterEvents()
	NetEvents:Subscribe('ProjectManager:RequestProjectHeaders', self, self.OnRequestProjectHeaders)
	NetEvents:Subscribe('ProjectManager:RequestProjectHeaderUpdate', self, self.UpdateClientProjectHeader)
	NetEvents:Subscribe('ProjectManager:RequestProjectData', self, self.OnRequestProjectData)
	NetEvents:Subscribe('ProjectManager:RequestProjectSave', self, self.OnRequestProjectSave)
	NetEvents:Subscribe('ProjectManager:RequestProjectLoad', self, self.OnRequestProjectLoad)
	NetEvents:Subscribe('ProjectManager:RequestProjectDelete', self, self.OnRequestProjectDelete)
	NetEvents:Subscribe('ProjectManager:RequestProjectImport', self, self.OnRequestProjectImport)
end

function ProjectManager:OnLoadBundles(p_Bundles, p_Compartment)
	for _, l_Bundle in pairs(p_Bundles) do
		self.m_LoadedBundles[l_Bundle] = true
	end
end

---@param p_Player Player
function ProjectManager:OnRequestProjectHeaders(p_Player)
	if p_Player == nil then -- update all players
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
		self:UpdateClientProjectHeader(nil)
	else
		NetEvents:SendToLocal("MapEditorClient:ReceiveProjectHeaders", p_Player, DataBaseManager:GetProjectHeaders())
		self:UpdateClientProjectHeader(p_Player)
	end
end

---@param p_Player Player|nil
function ProjectManager:UpdateClientProjectHeader(p_Player)
	if self.m_CurrentProjectHeader == nil then
		self.m_CurrentProjectHeader = {
			projectName = 'Untitled Project',
			mapName = self.m_MapName,
			gameModeName = self.m_GameMode,
			requiredBundles = self.m_LoadedBundles
		}
	end

	if p_Player == nil then -- update all players
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveCurrentProjectHeader", self.m_CurrentProjectHeader)
	else
		NetEvents:SendToLocal("MapEditorClient:ReceiveCurrentProjectHeader", p_Player, self.m_CurrentProjectHeader)
	end
end

---@param p_Player Player
---@param p_ProjectId integer
function ProjectManager:OnRequestProjectData(p_Player, p_ProjectId)
	m_Logger:Write("Data requested: " .. p_ProjectId)

	local s_ProjectData = DataBaseManager:GetProjectByProjectId(p_ProjectId)

	NetEvents:SendToLocal("MapEditorClient:ReceiveProjectData", p_Player, s_ProjectData)
end

---@param p_Player Player
---@param p_ProjectId integer
function ProjectManager:OnRequestProjectDelete(p_Player, p_ProjectId)
	m_Logger:Write("Delete requested: " .. p_ProjectId)

	--TODO: if the project that gets deleted is the currently loaded project, we need to clear all data and reload an empty map.
	local s_Success = DataBaseManager:DeleteProject(p_ProjectId)

	if s_Success then
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
	end
end

---@param p_ProjectSave ProjectSave
---@return ProjectSave|nil projectSave, string|nil errorMessage
function ProjectManager:UpgradeSaveStructure(p_ProjectSave)
	local s_SaveVersion = p_ProjectSave[DataBaseManager.m_ExportHeaderName].saveVersion

	if s_SaveVersion == nil then -- Save from before versioning was implemented, try to upgrade to current version
		local s_Data = p_ProjectSave[DataBaseManager.m_ExportDataName]
		self:InsertTimestampsIntoObjects(s_Data)

		-- Some pre-versioning save files had an isVanilla flag
		for _, l_DataEntry in pairs(s_Data) do
			if l_DataEntry.isVanilla ~= nil then
				l_DataEntry.origin = GameObjectOriginType.Vanilla and l_DataEntry.isVanilla or GameObjectOriginType.Custom
				l_DataEntry.isVanilla = nil
			end
		end

		p_ProjectSave[DataBaseManager.m_ExportHeaderName].saveVersion = SAVE_VERSION

		return p_ProjectSave
	elseif s_SaveVersion > SAVE_VERSION then
		return nil, 'Importing save with a higher save format version than supported, please update MapEditor before importing'
	elseif s_SaveVersion < SAVE_VERSION then
		-- New version updates are handled here
		local s_Data = p_ProjectSave[DataBaseManager.m_ExportDataName]
		self:InsertTimestampsIntoObjects(s_Data)
		self:RespaceDuplicateTimestamps(s_Data)

		-- Update save version
		p_ProjectSave[DataBaseManager.m_ExportHeaderName].saveVersion = SAVE_VERSION
		return p_ProjectSave
	elseif s_SaveVersion == SAVE_VERSION then
		return p_ProjectSave
	end
end

--- Give every object a UNIQUE timestamp, preserving the save's current order.
--- Pre-0.1.3 saves can hold many objects sharing one millisecond (bulk spawns), which the
--- non-stable sort then reshuffled on each load. Freezing the order once, here, makes such a save
--- permanently stable from its next write onwards. The order we freeze is the save's own
--- (timestamp, guid) order — the same total order the save path now uses — so nothing moves for a
--- file that was already collision-free.
---@param p_Data table
function ProjectManager:RespaceDuplicateTimestamps(p_Data)
	local s_HasDuplicate = false
	local s_Seen = {}

	for _, l_DataEntry in ipairs(p_Data) do
		local s_Stamp = l_DataEntry.timeStamp or 0

		if s_Seen[s_Stamp] then
			s_HasDuplicate = true
			break
		end

		s_Seen[s_Stamp] = true
	end

	if not s_HasDuplicate then
		return
	end

	table.sort(p_Data, function(a, b)
		local s_A = a.timeStamp or 0
		local s_B = b.timeStamp or 0

		if s_A == s_B then
			return tostring(a.guid) < tostring(b.guid)
		end

		return s_A < s_B
	end)

	for l_Index, l_DataEntry in ipairs(p_Data) do
		l_DataEntry.timeStamp = 1000000000000 + l_Index
	end

	m_Logger:Write('Re-spaced ' .. tostring(#p_Data) .. ' colliding save timestamps (order frozen)')
end

---@param p_Data table
function ProjectManager:InsertTimestampsIntoObjects(p_Data)
	for l_Index, l_DataEntry in ipairs(p_Data) do
		if not l_DataEntry.timeStamp then
			l_DataEntry.timeStamp = 1000000000000 + l_Index
		end
	end
end

---@param p_Player Player
---@param p_ProjectSaveJSON string
function ProjectManager:OnRequestProjectImport(p_Player, p_ProjectSaveJSON)
	m_Logger:Write("Import requested")

	local s_ProjectSave, s_Msg = self:ParseJSONProject(p_ProjectSaveJSON)
	local s_Success = s_ProjectSave ~= nil

	-- Update save structure to newest save version
	if s_ProjectSave then
		if not s_ProjectSave[DataBaseManager.m_ExportHeaderName].saveVersion or s_ProjectSave[DataBaseManager.m_ExportHeaderName].saveVersion ~= SAVE_VERSION then
			m_Logger:Write('Older save version found, updating to newest save structure..')

			s_ProjectSave, s_Msg = self:UpgradeSaveStructure(s_ProjectSave)
			s_Success = s_ProjectSave ~= nil
		end
	end

	-- Attempt saving the project
	if s_ProjectSave then
		local s_Header = s_ProjectSave[DataBaseManager.m_ExportHeaderName]
		local s_Data = s_ProjectSave[DataBaseManager.m_ExportDataName]

		s_Success, s_Msg = DataBaseManager:SaveProject(s_Header.projectName, s_Header.mapName, s_Header.gameModeName, s_Header.requiredBundles, s_Data, s_Header.saveVersion, s_Header.timeStamp)
	end

	if s_Success then
		m_Logger:Write('Correctly imported save file')
		-- Update clients with new save.
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
	else
		m_Logger:Write('Error importing save file: ' .. s_Msg)
	end

	s_Msg = s_Msg or 'Successfully imported save file.'

	NetEvents:SendToLocal("MapEditorClient:ProjectImportFinished", p_Player, s_Msg)
end

---@param p_ProjectSaveJSON string
---@return ProjectSave|nil projectSave, string|nil errorMessage
function ProjectManager:ParseJSONProject(p_ProjectSaveJSON)
	local s_ProjectSave = json.decode(p_ProjectSaveJSON)

	if s_ProjectSave == nil then
		return nil, 'Incorrect save format'
	end

	local s_Header = s_ProjectSave[DataBaseManager.m_ExportHeaderName]
	local s_Data = s_ProjectSave[DataBaseManager.m_ExportDataName]

	if s_Header == nil then
		return nil, 'Save file is missing header '
	end

	if s_Data == nil then
		return nil, 'Save file is missing data'
	end

	if s_Header.projectName == nil or
		s_Header.mapName == nil or
		s_Header.gameModeName == nil or
		-- s_Header.saveVersion == nil or -- not required, old saves didn't have it
		s_Header.requiredBundles == nil then
		return nil, 'Save header missing necessary field(s)'
	end

	return { [DataBaseManager.m_ExportHeaderName] = s_Header, [DataBaseManager.m_ExportDataName] = s_Data }
end

---@param p_Map string
---@param p_GameMode string
---@param p_Round integer
function ProjectManager:OnLevelLoaded(p_Map, p_GameMode, p_Round)
	if self.m_ProjectLoadingState == ProjectLoadingState.PendingLevelLoad then
		self.m_ProjectLoadingState = ProjectLoadingState.PendingProjectLoad
	end

	self.m_MapName = p_Map:gsub(".*/", "")
	self.m_GameMode = p_GameMode:gsub(".*/", "")
end

function ProjectManager:OnUpdatePass(p_Delta, p_Pass)
	if p_Pass ~= UpdatePass.UpdatePass_PreSim then
		return
	end

	if self.m_ProjectLoadingState == ProjectLoadingState.PendingProjectLoad then
		if self.m_CurrentProjectHeader == nil or self.m_CurrentProjectHeader.id == nil or self.m_CurrentProjectHeader.projectName == nil then
			self.m_CurrentProjectHeader = ProjectLoadingState.Loaded
			m_Logger:Warning('Pending load of project cancelled due to missing project data')
			return
		end

		self.m_ProjectLoadingState = ProjectLoadingState.Loaded

		if self.m_MapName:gsub(".*/", "") ~= self.m_CurrentProjectHeader.mapName:gsub(".*/", "") then
			m_Logger:Error("Can't load project that is not built for the same map as current one. Current: " .. tostring(self.m_MapName) .. ", target: " .. tostring(self.m_CurrentProjectHeader.mapName))
			return
		end

		local s_ProjectSave = DataBaseManager:GetProjectByProjectId(self.m_CurrentProjectHeader.id)

		if s_ProjectSave == nil then
			m_Logger:Error("Can't load project, not found in database.")
			return
		end

		m_Logger:Write('Loading project save')

		-- Upgrade if necessary
		local s_Msg
		s_ProjectSave, s_Msg = self:UpgradeSaveStructure(s_ProjectSave)


		if s_ProjectSave == nil then
			m_Logger:Error("Can't load project. Error: " .. tostring(s_Msg))
			return
		end

		if s_ProjectSave.data ~= nil then
			for l_Index, l_Value in ipairs(s_ProjectSave.data) do
				-- store the timestamps to reference later
				self.m_GUID_To_Timestamps[l_Value.guid] = l_Value.timeStamp
				-- print(l_Value.timeStamp)
			end
			NetEvents:BroadcastLocal("Shared:StoreTimeStamps", self.m_GUID_To_Timestamps)
		end

		self:CreateAndExecuteImitationCommands(s_ProjectSave[DataBaseManager.m_ExportDataName])
	end
end

---@param p_Player Player
---@param p_ProjectId integer
function ProjectManager:OnRequestProjectLoad(p_Player, p_ProjectId)
	m_Logger:Write("Load requested: " .. p_ProjectId)
	-- TODO: check player's permission once that is implemented

	local s_Project = DataBaseManager:GetProjectByProjectId(p_ProjectId)

	if s_Project == nil then
		m_Logger:Error('Failed to get project with id ' .. tostring(p_ProjectId))
		return
	end

	self.m_ProjectLoadingState = ProjectLoadingState.PendingLevelLoad
	self.m_CurrentProjectHeader = s_Project.header

	local s_MapName = s_Project.header.mapName
	local s_GameModeName = s_Project.header.gameModeName

	if s_MapName == nil or
		Maps[s_MapName] == nil or
		s_GameModeName == nil or
		GameModes[s_GameModeName] == nil then
		m_Logger:Error("Failed to load project, one or more fields of the project header are not set: " .. s_MapName .. " | " .. s_GameModeName)
		return
	end

	self:UpdateClientProjectHeader(nil)

	-- Arm the level injector so the project's objects load NATIVELY during the loading screen
	-- (no post-load popping). Set on the server (persists through the restart) and push to
	-- connected clients CHUNKED over frames (a single NetEvent with a 2500+ object save is too big
	-- for the reliable channel → the client times out / gets kicked). A client whose VM reloads on
	-- a map change re-requests it (LevelInjector).
	if ME_CONFIG.LOAD_INJECTION then
		LevelInjector:SetData({ header = s_Project.header, data = s_Project.data })
		LevelInjector:SendChunked(nil)
	end

	-- TODO: Check if we need to delay the restart to ensure all clients have properly updated headers. Would be nice to show a 'Loading Project' screen too (?)
	-- Invoke Restart
	-- With load-screen injection we can NOT use restartRound on the same map: the LevelData
	-- partition stays mounted, Partition:Loaded doesn't re-fire, and the level is never re-patched.
	-- A full clear/add/runNextRound re-mounts the level so injection sees a fresh LevelData.
	if self.m_MapName == s_MapName and not ME_CONFIG.LOAD_INJECTION then
		--Events:Dispatch('MapLoader:LoadLevel', { header = s_Project.header, data = s_Project.data, vanillaOnly = true })
		RCON:SendCommand('mapList.restartRound')
	else
		local s_Response = RCON:SendCommand('mapList.clear')
		if s_Response[1] ~= 'OK' then
			m_Logger:Error('Couldn\'t clear maplist. ' .. s_Response[1])
			return
		end

		s_Response = RCON:SendCommand('mapList.add', { s_MapName, s_GameModeName, '1' }) -- TODO: add proper map / gameplay support
		if s_Response[1] ~= 'OK' then
			m_Logger:Error('Couldn\'t add map to maplist. ' .. s_Response[1])
		end

		s_Response = RCON:SendCommand('mapList.runNextRound')
		if s_Response[1] ~= 'OK' then
			m_Logger:Error('Couldn\'t run next round. ' .. s_Response[1])
		end
	end
end

function ProjectManager:OnRequestProjectSave(p_Player, p_ProjectHeader)
	-- TODO: check player's permission once that is implemented
	self:SaveProjectCoroutine(p_ProjectHeader)
end

---@param p_ProjectHeader ProjectHeader
function ProjectManager:SaveProjectCoroutine(p_ProjectHeader)
	m_Logger:Write("Save requested: " .. p_ProjectHeader.projectName)

	local s_GameObjectSaveDatas = {}
	local s_Count = 0

	-- TODO: get the GameObjectSaveDatas not from the transferdatas array, but from the GO array of the GOManager. (remove the GOTD array)
	for _, l_GameObject in pairs(GameObjectManager.m_GameObjects) do
		if l_GameObject:IsUserModified() == true or l_GameObject:HasOverrides() then
			-- check the old values that are stored
			local s_Guid = tostring(l_GameObject.guid)
			if self.m_GUID_To_Timestamps[s_Guid] ~= nil then
				l_GameObject.timeStamp = self.m_GUID_To_Timestamps[s_Guid]
			else
				self.m_GUID_To_Timestamps[s_Guid] = l_GameObject.timeStamp
			end
			s_Count = s_Count + 1
			table.insert(s_GameObjectSaveDatas, GameObjectSaveData(l_GameObject):GetAsTable())
		end
	end

	-- Restore creation order from the guid-keyed (i.e. unordered) walk above. Lua's table.sort is
	-- NOT stable, so equal timestamps would come out in an arbitrary — and differently arbitrary
	-- each run — order, which is what made the Scene Instances list reshuffle on every reload.
	-- Tie-breaking on the guid makes this a TOTAL order, so the result is deterministic even for
	-- legacy saves that still contain colliding timestamps. (New saves can't collide: see
	-- GameObjectManager:NextTimeStamp.) The `or 0` guards a save missing a timestamp entirely,
	-- which would otherwise throw inside the comparator.
	table.sort(s_GameObjectSaveDatas, function(a, b)
		local s_A = a.timeStamp or 0
		local s_B = b.timeStamp or 0

		if s_A == s_B then
			return tostring(a.guid) < tostring(b.guid)
		end

		return s_A < s_B
	end)

	-- m_Logger:Write("vvvvvvvvvvvvvvvvv")
	-- m_Logger:Write("GameObjectSaveDatas: " .. count)
	-- for _, gameObjectSaveData in pairs(s_GameObjectSaveDatas) do
	-- 	m_Logger:Write(tostring(gameObjectSaveData.guid) .. " | " .. gameObjectSaveData.name)
	-- end
	-- m_Logger:Write(json.encode(s_GameObjectSaveDatas))
	-- m_Logger:Write("^^^^^^^^^^^^^^^^^")
	self.m_CurrentProjectHeader = {
		projectName = p_ProjectHeader.projectName,
		mapName = self.m_MapName,
		gameModeName = self.m_GameMode,
		requiredBundles = self.m_LoadedBundles
	}
	local s_Success, s_Msg, s_HeaderId = DataBaseManager:SaveProject(p_ProjectHeader.projectName, self.m_CurrentProjectHeader.mapName, self.m_CurrentProjectHeader.gameModeName, self.m_LoadedBundles, s_GameObjectSaveDatas, SAVE_VERSION)

	if s_Success and s_HeaderId ~= nil then
		self:SaveClonedBlueprints(s_HeaderId)
	end

	if s_Success then
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveCurrentProjectHeader", self.m_CurrentProjectHeader)
	else
		m_Logger:Error(s_Msg)
	end
end

--- Persist every per-instance blueprint clone as a standalone EBX partition (GH #396).
---
--- An EBX override means "this instance uses a MODIFIED blueprint". The modification lives in a
--- runtime DeepClone that exists only in this process, so a save that records the override deltas
--- alone cannot be baked: the level generator has no blueprint to point at. Serializing the clone
--- subtree here gives it one — the generator compiles these as real partitions and repoints the
--- object's ReferenceObjectData at its own blueprint instead of the stock one.
---
--- Failures are logged and skipped rather than aborting the save: losing an override in the bake is
--- bad, losing the whole project save is worse.
---@param p_HeaderId number
function ProjectManager:SaveClonedBlueprints(p_HeaderId)
	if PartitionSerializer == nil or GameObjectManager.m_InstanceClones == nil then
		return
	end

	local s_Saved = 0

	for l_Guid, l_Entry in pairs(GameObjectManager.m_InstanceClones) do
		local s_Dc = l_Entry ~= nil and l_Entry.dc or nil

		-- A clone with no overrides behind it is byte-identical to the blueprint it came from, so
		-- baking it would pin the instance to today's blueprint for no benefit. This is not
		-- hypothetical: Apply-to-Blueprint clears the applier's overrides and then rebuilds it,
		-- and the rebuild path re-clones unconditionally — so the applying instance ended up with
		-- its own baked partition instead of sharing the blueprint it had just written.
		local s_GameObject = GameObjectManager.m_GameObjects[tostring(l_Guid)]
		local s_HasOverrides = s_GameObject ~= nil and s_GameObject.overrides ~= nil
			and next(s_GameObject.overrides) ~= nil

		if s_Dc ~= nil and s_HasOverrides then
			-- Partition names must be unique within the bundle and stable across saves, so key it
			-- on the editor guid rather than the blueprint name (several instances of one prefab
			-- can each carry different overrides).
			local s_Name = "CustomBlueprints/" .. tostring(l_Guid):lower()

			-- Copy-on-write against the blueprint this clone came from: emit only what actually
			-- changed and reference stock content for the rest. A full copy takes the whole render
			-- chain with it under fresh guids, and the baked object then references meshes the
			-- level has never seen — it is placed correctly and draws nothing.
			local s_Original = nil

			if l_Entry.originalRef ~= nil then
				pcall(function() s_Original = CtrRef(l_Entry.originalRef):Get() end)
			end

			local s_Ok, s_Partition, s_Emitted, s_Total

			if s_Original ~= nil then
				s_Ok, s_Partition, s_Emitted, s_Total = pcall(function()
					return PartitionSerializer:SerializeOverlayPartition(s_Dc, s_Original, s_Name,
						l_Entry.originalRef and l_Entry.originalRef.partitionGuid or nil)
				end)
			end

			if s_Ok and s_Partition ~= nil then
				m_Logger:Write("Overlay for " .. tostring(l_Guid) .. ": emitted " ..
					tostring(s_Emitted) .. " of " .. tostring(s_Total) .. " containers")
			else
				-- No resolvable original (or the pairing failed): fall back to the full copy, which
				-- at least preserves the data even though such an object may not render.
				m_Logger:Warning("Overlay failed for " .. tostring(l_Guid) .. "; emitting full clone")
				s_Ok, s_Partition = pcall(function()
					return PartitionSerializer:SerializeCloneSubtree(s_Dc, s_Name)
				end)
			end

			if s_Ok and s_Partition ~= nil then
				local s_JsonOk, s_Json = pcall(function() return json.encode(s_Partition) end)

				if s_JsonOk and s_Json ~= nil then
					if DataBaseManager:SaveProjectEbx(p_HeaderId, tostring(l_Guid), s_Name, s_Json) then
						s_Saved = s_Saved + 1
					end
				else
					m_Logger:Error("Could not encode cloned blueprint for " .. tostring(l_Guid) .. ": " .. tostring(s_Json))
				end
			else
				m_Logger:Error("Could not serialize cloned blueprint for " .. tostring(l_Guid) .. ": " .. tostring(s_Partition))
			end
		end
	end

	-- Blueprints permanently modified via Apply-to-Blueprint. These are stock, partition-resident
	-- containers rather than runtime clones, so the whole ORIGINAL partition is serialized and
	-- stored under its own name. The generator emits it under that same name so the custom bundle
	-- SHADOWS the stock partition — which is what makes an applied change reach every instance,
	-- including vanilla ReferenceObjectDatas the editor never tracked and therefore cannot repoint.
	-- Marked by an empty object_guid: these belong to a blueprint, not to one instance.
	for l_BpGuid, l_Info in pairs(GameObjectManager.m_AppliedBlueprints or {}) do
		local s_Ok, s_Partition = pcall(function()
			return PartitionSerializer:SerializePartition(l_Info.partitionGuid, l_Info.name)
		end)

		if s_Ok and s_Partition ~= nil then
			local s_JsonOk, s_Json = pcall(function() return json.encode(s_Partition) end)

			if s_JsonOk and s_Json ~= nil then
				if DataBaseManager:SaveProjectEbx(p_HeaderId, '', l_Info.name, s_Json) then
					s_Saved = s_Saved + 1
				end
			end
		else
			m_Logger:Error("Could not serialize applied blueprint " .. tostring(l_BpGuid) ..
				": " .. tostring(s_Partition))
		end
	end

	if s_Saved > 0 then
		m_Logger:Write("Stored " .. tostring(s_Saved) .. " cloned blueprint partition(s)")
	end
end

---We're creating commands from the savefile, basically imitating every step that has been undertaken
---@param p_ProjectSaveData ProjectDataEntry[]
function ProjectManager:CreateAndExecuteImitationCommands(p_ProjectSaveData)
	local s_SaveFileCommands = {}

	-- ipairs, not pairs: the save array is written in sorted creation order and the commands are
	-- queued/executed in the order we build them here, so iteration order IS the load order that
	-- the Scene Instances tree ends up showing. pairs() gives no ordering guarantee.
	for _, l_GameObjectSaveData in ipairs(p_ProjectSaveData) do
		-- With load-screen injection, Vanilla/Custom/NoHavok are placed natively during load and
		-- CustomChild isn't command-driven yet, so there's nothing to queue post-load.
		if ME_CONFIG.LOAD_INJECTION then
			goto continue
		end

		local s_Guid = l_GameObjectSaveData.guid:upper()

		--if (GameObjectManager.m_GameObjects[l_Guid] == nil) then
		--	m_Logger:Error("GameObject with Guid " .. tostring(l_Guid) .. " not found in GameObjectManager.")
		--end

		local s_Command
		local s_TimeStamp = self.m_GUID_To_Timestamps[s_Guid]

		-- Vanilla and nohavok objects are handled in levelloader
		if l_GameObjectSaveData.origin == GameObjectOriginType.Vanilla or
			l_GameObjectSaveData.origin == GameObjectOriginType.NoHavok then
			if l_GameObjectSaveData.isDeleted then
				s_Command = {
					guid = s_Guid,
					sender = "LoadingSaveFile",
					type = CommandActionType.DeleteGameObjectCommand,
					gameObjectTransferData = {
						guid = s_Guid,
						timeStamp = s_TimeStamp
					}
				}
			else
				s_Command = {
					guid = s_Guid,
					sender = "LoadingSaveFile",
					type = CommandActionType.SetTransformCommand,
					gameObjectTransferData = {
						guid = s_Guid,
						transform = l_GameObjectSaveData.transform,
						timeStamp = s_TimeStamp
					}
				}
			end

			table.insert(s_SaveFileCommands, s_Command)
		elseif l_GameObjectSaveData.origin == GameObjectOriginType.CustomChild then
			-- TODO Fool: Handle custom objects' children, they should be handled after the parent is spawned
		else
			s_Command = {
				guid = s_Guid,
				sender = "LoadingSaveFile",
				type = CommandActionType.SpawnGameObjectCommand,
				gameObjectTransferData = { -- We're not using the actual type, i think its because of json serialization fuckups
					guid = s_Guid,
					name = l_GameObjectSaveData.name,
					blueprintCtrRef = l_GameObjectSaveData.blueprintCtrRef,
					parentData = l_GameObjectSaveData.parentData or GameObjectParentData:GetRootParentData(),
					timeStamp = s_TimeStamp,
					transform = l_GameObjectSaveData.transform,
					variation = l_GameObjectSaveData.variation or 0,
					gameEntities = {},
					isEnabled = l_GameObjectSaveData.isEnabled or true,
					isDeleted = l_GameObjectSaveData.isDeleted or false,
					overrides = l_GameObjectSaveData.overrides
				}
			}

			table.insert(s_SaveFileCommands, s_Command)
		end

		::continue::
	end

	ServerTransactionManager:QueueCommands(s_SaveFileCommands)
	-- IMPORTANT: pass nil (not 0) when there are no commands. The client's OnSyncClientContext
	-- does `if p_ProjectLastTransactionId then` and 0 is TRUTHY in Lua, so it would enter syncing
	-- mode with target 0, and 'LoadingComplete' (only fired while processing a command batch)
	-- would NEVER dispatch -> client stuck in Loading, editor UI dead. With injection there are
	-- usually 0 commands, so this is essential.
	local s_CommandCount = #s_SaveFileCommands
	ServerTransactionManager:SetLoadingProjectLastTransactionId(s_CommandCount > 0 and s_CommandCount or nil)
end

ProjectManager = ProjectManager()

return ProjectManager
