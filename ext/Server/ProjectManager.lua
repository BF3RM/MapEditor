class 'ProjectManager'

local m_Logger = Logger("ProjectManager", true)

local m_IsLevelLoaded = false
local m_LoadDelay = 0

function ProjectManager:__init()
    m_Logger:Write("Initializing ProjectManager")

    self.m_CurrentProjectHeader = nil -- dont reset this, is required info for map restart
	self:RegisterVars()
    self:RegisterEvents()
end

function ProjectManager:RegisterVars()
	self.m_MapName = nil
	self.m_GameMode = nil
	self.m_LoadedBundles = {}
end

function ProjectManager:RegisterEvents()
	NetEvents:Subscribe('ProjectManager:RequestProjectHeaders', self, self.OnRequestProjectHeaders)
    NetEvents:Subscribe('ProjectManager:RequestProjectHeaderUpdate', self, self.UpdateClientProjectHeader)
    NetEvents:Subscribe('ProjectManager:RequestProjectData', self, self.OnRequestProjectData)
    NetEvents:Subscribe('ProjectManager:RequestProjectSave', self, self.OnRequestProjectSave)
    NetEvents:Subscribe('ProjectManager:RequestProjectLoad', self, self.OnRequestProjectLoad)
    NetEvents:Subscribe('ProjectManager:RequestProjectDelete', self, self.OnRequestProjectDelete)
end

function ProjectManager:OnLoadBundles(p_Bundles, p_Compartment)
	for _,v in pairs(p_Bundles) do
		self.m_LoadedBundles[v] = true
	end
end

function ProjectManager:OnRequestProjectHeaders(p_Player)
	if p_Player == nil then -- update all players
		NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
		self:UpdateClientProjectHeader(nil)
	else
		NetEvents:SendToLocal("MapEditorClient:ReceiveProjectHeaders", p_Player, DataBaseManager:GetProjectHeaders())
		self:UpdateClientProjectHeader(p_Player)
	end
end

function ProjectManager:UpdateClientProjectHeader(p_Player)
    if self.m_CurrentProjectHeader == nil then
	    self.m_CurrentProjectHeader = {
		    projectName = 'Untitled Project',
		    mapName = self.m_MapName,
		    gameModeName = self.m_GameMode,
		    requiredBundles = self.m_RequiredBundles
	    }
    end
    if p_Player == nil then -- update all players
        NetEvents:BroadcastLocal("MapEditorClient:ReceiveCurrentProjectHeader", self.m_CurrentProjectHeader)
    else
        NetEvents:SendToLocal("MapEditorClient:ReceiveCurrentProjectHeader", p_Player, self.m_CurrentProjectHeader)
    end
end

function ServerTransactionManager:OnRequestProjectData(p_Player, p_ProjectId)
    m_Logger:Write("Data requested: " .. p_ProjectName)

    local s_ProjectDataJson = DataBaseManager:GetProjectDataByProjectId(p_ProjectId)

    NetEvents:SendToLocal("MapEditorClient:ReceiveProjectData", p_Player, s_ProjectDataJson)
end

function ServerTransactionManager:OnRequestProjectDelete(p_ProjectId)
    m_Logger:Write("Delete requested: " .. p_ProjectId)

    --TODO: if the project that gets deleted is the currently loaded project, we need to clear all data and reload an empty map.

    DataBaseManager:DeleteProject(p_ProjectId)
end

function ProjectManager:OnLevelLoaded(p_Map, p_GameMode, p_Round)
    m_IsLevelLoaded = true

    self.m_MapName = p_Map
	self.m_GameMode = p_GameMode
end

function ProjectManager:OnUpdatePass(p_Delta, p_Pass)
    -- TODO: ugly, find a better entry point to invoke project data loading
    if m_IsLevelLoaded == true and self.m_CurrentProjectHeader ~= nil and self.m_CurrentProjectHeader.id ~= nil then
        m_LoadDelay = m_LoadDelay + p_Delta

        if m_LoadDelay > 10 and
                self.m_CurrentProjectHeader.projectName ~= nil then

            m_IsLevelLoaded = false
            m_LoadDelay = 0

            if self.m_MapName ~= self.m_CurrentProjectHeader.mapName then
                m_Logger:Error("Cant load project that is not built for the same map as current one.")
            end

            -- Load User Data from Database
            local s_ProjectSaveData = DataBaseManager:GetProjectDataByProjectId(self.m_CurrentProjectHeader.id)
            --self:UpdateLevelFromOldSaveFile(s_SaveFile)
            self:CreateAndExecuteImitationCommands(DecodeParams(json.decode(s_ProjectSaveData[1].save_file_json)))
        end
    end
end

function ProjectManager:OnRequestProjectLoad(p_Player, p_ProjectId)
    m_Logger:Write("Load requested: " .. p_ProjectId)
    -- TODO: check player's permission once that is implemented

    self.m_CurrentProjectHeader = DataBaseManager:GetProjectHeader(p_ProjectId)

    local s_MapName = self.m_CurrentProjectHeader.mapName
    local s_GameModeName = self.m_CurrentProjectHeader.gameModeName
	print(self.m_CurrentProjectHeader)
	print(tostring(self.m_CurrentProjectHeader))
    if s_MapName == nil or
            Maps[s_MapName] == nil or
            s_GameModeName == nil or
            GameModes[s_GameModeName] == nil then

        m_Logger:Error("Failed to load project, one or more fields of the project header are not set: " .. s_MapName .. " | " .. s_GameModeName)
    end

    self:UpdateClientProjectHeader(nil)

    -- TODO: Check if we need to delay the restart to ensure all clients have properly updated headers. Would be nice to show a 'Loading Project' screen too (?)
    -- Invoke Restart
	if(self.m_MapName == s_MapName) then
		local s_ProjectSaveData = DataBaseManager:GetProjectDataByProjectId(self.m_CurrentProjectHeader.id)
		Events:Dispatch('MapLoader:LoadLevel', {header = self.m_CurrentProjectHeader, data = DecodeParams(json.decode(s_ProjectSaveData[1].save_file_json)), vanillaOnly = true})
		RCON:SendCommand('mapList.restartRound')
	else
		RCON:SendCommand('mapList.clear')
		local out = RCON:SendCommand('mapList.add ' .. s_MapName .. ' ' .. s_GameModeName .. ' 1') -- TODO: add proper map / gameplay support
		print(out)
		RCON:SendCommand('mapList.runNextRound')
	end

end

function ProjectManager:OnRequestProjectSave(p_Player, p_ProjectSaveData)
	-- TODO: check player's permission once that is implemented

	Async:Start(function() self:SaveProjectCoroutine(p_ProjectSaveData)
	end)
end

function ProjectManager:SaveProjectCoroutine(p_ProjectSaveData)
	m_Logger:Write("Save requested: " .. p_ProjectSaveData.projectName)

	local s_GameObjectSaveDatas = {}
	local count = 0

	-- TODO: get the GameObjectSaveDatas not from the transferdatas array, but from the GO array of the GOManager. (remove the GOTD array)
	for _, l_GameObject in pairs(GameObjectManager.m_GameObjects) do
		if l_GameObject:IsUserModified() == true then
			count = count + 1
			s_GameObjectSaveDatas[tostring(l_GameObject.guid)] = GameObjectSaveData(l_GameObject):GetAsTable()
			print(l_GameObject.localTransform)
		end
		Async:Yield()
	end

	m_Logger:Write("vvvvvvvvvvvvvvvvv")
	m_Logger:Write("GameObjectSaveDatas: " .. count)
	for _, gameObjectSaveData in pairs(s_GameObjectSaveDatas) do
		m_Logger:Write(tostring(gameObjectSaveData.guid) .. " | " .. gameObjectSaveData.name)
	end
	m_Logger:Write(json.encode(s_GameObjectSaveDatas))
	m_Logger:Write("^^^^^^^^^^^^^^^^^")
	self.m_CurrentProjectHeader = {
		projectName = p_ProjectSaveData.projectName,
		mapName = self.m_MapName,
		gameModeName = self.m_GameMode,
		requiredBundles = self.m_RequiredBundles
	}
	DataBaseManager:SaveProject(p_ProjectSaveData.projectName, self.m_CurrentProjectHeader.mapName, self.m_CurrentProjectHeader.gameModeName, self.m_LoadedBundles, s_GameObjectSaveDatas)
	NetEvents:BroadcastLocal("MapEditorClient:ReceiveProjectHeaders", DataBaseManager:GetProjectHeaders())
	NetEvents:BroadcastLocal("MapEditorClient:ReceiveCurrentProjectHeader", self.m_CurrentProjectHeader)
end

-- we're creating commands from the savefile, basically imitating every step that has been undertaken
function ProjectManager:CreateAndExecuteImitationCommands(p_ProjectSaveData)
    local s_SaveFileCommands = {}

    for _, l_GameObjectSaveData in pairs(p_ProjectSaveData) do
	    local l_Guid = l_GameObjectSaveData.guid
        if (GameObjectManager.m_GameObjects[l_Guid] == nil) then
            m_Logger:Error("GameObject with Guid " .. tostring(l_Guid) .. " not found in GameObjectManager.")
        end

        local s_Command

        --If it's a vanilla object we move it or we delete it. If not we spawn a new object.
        if IsVanilla(l_Guid) then
            --[[if l_GameObjectSaveData.isDeleted then
                s_Command = {
                    sender = "LoadingSaveFile",
                    type = "DeleteBlueprintCommand",
                    gameObjectTransferData = {
                        guid = l_Guid
                    }
                }
            else
                s_Command = {
                    sender = "LoadingSaveFile",
                    type = "SetTransformCommand",
                    gameObjectTransferData = {
                        guid = l_Guid,
                        transform = l_GameObjectSaveData.transform
                    }
                }
            end

            table.insert(s_SaveFileCommands, s_Command)
            --]]
        else
            s_Command = {
                guid = l_Guid,
                sender = "LoadingSaveFile",
                type = "SpawnBlueprintCommand",
                gameObjectTransferData = { -- We're not using the actual type, i think its because of json serialization fuckups
                    guid = l_Guid,
                    name = l_GameObjectSaveData.name,
                    blueprintCtrRef = l_GameObjectSaveData.blueprintCtrRef,
                    parentData = l_GameObjectSaveData.parentData,
                    transform = l_GameObjectSaveData.transform,
                    variation = l_GameObjectSaveData.variation,
                    gameEntities = {},
                    isEnabled = l_GameObjectSaveData.isEnabled or true,
                    isDeleted = l_GameObjectSaveData.isDeleted or false
                }
            }

            table.insert(s_SaveFileCommands, s_Command)
        end
    end

    ServerTransactionManager:ExecuteCommands(s_SaveFileCommands, true)
end

return ProjectManager()
