---@class DataBaseManager
DataBaseManager = class 'DataBaseManager'

local m_Logger = Logger("DataBaseManager", false)

local m_DB_Header_Table_Name = "project_header"
local m_ProjectName_Unique_Index = "idx_project_name"
local m_ProjectName_Text_Column_Name = "project_name"
local m_MapName_Text_Column_Name = "map_name"
local m_GameModeName_Text_Column_Name = "gamemode_name"
local m_RequiredBundles_Text_Column_Name = "required_bundles"
local m_TimeStamp_Text_Column_Name = "timestamp"

local m_DB_Data_Table_Name = "project_data"
local m_ProjectHeader_Id_Column_Name = "project_header_id"
local m_SaveFile_Text_Column_Name = "save_file_json"

local m_ExportHeaderName = "header"
local m_ExportDataName = "data"

function DataBaseManager:__init()
	m_Logger:Write("Initializing DataBaseManager")
	self:CreateOrUpdateDatabase()
end

function DataBaseManager:SaveProject(p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundles, p_GameObjectSaveDatas, p_TimeStamp)
	local s_TimeStamp = p_TimeStamp or SharedUtils:GetTimeMS()

	local s_GameObjectSaveDatasJson = p_GameObjectSaveDatas
	local s_RequiredBundlesJson = p_RequiredBundles

	if type(p_GameObjectSaveDatas) ~= 'string' then
		s_GameObjectSaveDatasJson = json.encode(p_GameObjectSaveDatas)
	end

	-- Round numbers to 3 decimals
	s_GameObjectSaveDatasJson = string.gsub(s_GameObjectSaveDatasJson, "(%d+%.%d+)", function(n)
		return string.format("%.3f", tonumber(n))
	end)

	if type(p_RequiredBundles) ~= 'string' then
		s_RequiredBundlesJson = json.encode(p_RequiredBundles)
	end

	local s_Success, s_ErrorMsg, s_HeaderId = self:SaveProjectHeader(p_ProjectName, p_MapName, p_GameModeName, s_RequiredBundlesJson, s_TimeStamp)

	if s_Success then
		return self:SaveProjectData(s_HeaderId, s_GameObjectSaveDatasJson)
	else
		return s_Success, s_ErrorMsg
	end
end

function DataBaseManager:CreateOrUpdateDatabase()
	m_Logger:Write("DataBaseManager:CreateOrUpdateDatabase()")

	if not SQL:Open() then
		return
	end

	-- Create our data table:
	local s_CreateProjectHeaderTableQuery = [[
		CREATE TABLE IF NOT EXISTS ]] .. m_DB_Header_Table_Name .. [[ (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			]] .. m_ProjectName_Text_Column_Name .. [[ TEXT,
			]] .. m_MapName_Text_Column_Name .. [[ TEXT,
			]] .. m_GameModeName_Text_Column_Name .. [[ TEXT,
			]] .. m_RequiredBundles_Text_Column_Name .. [[ TEXT,
			]] .. m_TimeStamp_Text_Column_Name .. [[ INTEGER
		);

		CREATE UNIQUE INDEX IF NOT EXISTS ]] .. m_ProjectName_Unique_Index .. [[ ON ]] .. m_DB_Header_Table_Name .. [[(]] .. m_ProjectName_Text_Column_Name .. [[);
	]]

	-- m_Logger:Write(createProjectHeaderTableQuery)

	if not SQL:Query(s_CreateProjectHeaderTableQuery) then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	-- Create our data table:
	local s_CreateProjectDataTableQuery = [[
		CREATE TABLE IF NOT EXISTS ]] .. m_DB_Data_Table_Name .. [[ (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			]] .. m_ProjectHeader_Id_Column_Name .. [[ INTEGER REFERENCES ]] .. m_DB_Header_Table_Name.. [[(id) ON DELETE CASCADE,
			]] .. m_SaveFile_Text_Column_Name .. [[ TEXT
		);
	]]

	if not SQL:Query(s_CreateProjectDataTableQuery) then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	m_Logger:Write("Successfully created database!")
end

function DataBaseManager:SaveProjectHeader(p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundlesJson, p_TimeStamp)
	if p_ProjectName == nil or type(p_ProjectName) ~= "string" then
		return false, "Failed to save Project - header.projectName is invalid: " .. tostring(p_ProjectName)
	end

	if p_MapName == nil or type(p_MapName) ~= "string" then
		return false, "Failed to save Project - header.mapName is invalid: " .. tostring(p_MapName)
	end

	if p_GameModeName == nil or type(p_GameModeName) ~= "string" then
		return false, "Failed to save Project - header.gameModeName is invalid: " .. tostring(p_GameModeName)
	end

	if p_RequiredBundlesJson == nil or type(p_RequiredBundlesJson) ~= "string" then
		return false, "Failed to save Project - header.requiredBundles is invalid: " .. tostring(p_RequiredBundlesJson)
	end

	if p_TimeStamp == nil or type(p_TimeStamp) ~= "number" then
		return false, "Failed to save Project - header.timeStamp is invalid: " .. tostring(p_TimeStamp)
	end

	local s_Query = [[INSERT OR REPLACE INTO ]] .. m_DB_Header_Table_Name .. [[ (]] .. m_ProjectName_Text_Column_Name .. [[, ]] .. m_MapName_Text_Column_Name .. [[, ]] .. m_GameModeName_Text_Column_Name .. [[, ]] .. m_RequiredBundles_Text_Column_Name .. [[, ]] .. m_TimeStamp_Text_Column_Name .. [[) VALUES (?, ?, ?, ?, ?)]]

	m_Logger:Write("Inserting values:")
	m_Logger:Write(p_ProjectName .. " | " .. p_MapName .. " | " .. p_GameModeName .. " | " .. p_RequiredBundlesJson .. " | " .. tostring(p_TimeStamp))

	if not SQL:Query(s_Query, p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundlesJson, p_TimeStamp) then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return false, 'Internal database error, check server output for more info'
	end

	m_Logger:Write('Inserted header. Insert ID: ' .. tostring(SQL:LastInsertId()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
	return true, nil, SQL:LastInsertId()
end

function DataBaseManager:SaveProjectData(p_HeaderId, p_GameObjectSaveDatasJson)
	m_Logger:Write("SaveProjectData() " .. tostring(p_HeaderId))
	--m_Logger:Write(p_GameObjectSaveDatasJson)

	local s_Query = 'INSERT INTO ' .. m_DB_Data_Table_Name .. ' (' .. m_ProjectHeader_Id_Column_Name .. ', ' .. m_SaveFile_Text_Column_Name .. ') VALUES (?, ?)'

	m_Logger:Write(s_Query)

	if not SQL:Query(s_Query, p_HeaderId, p_GameObjectSaveDatasJson) then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return false, 'Internal database error, check server output for more info'
	end

	m_Logger:Write('Inserted data. Insert ID: ' .. tostring(SQL:LastInsertId()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
	return true
end

function DataBaseManager:GetProjectHeaders()
	local s_ProjectHeaderRows = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name)

	if not s_ProjectHeaderRows then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	local s_ProjectHeaders = { }

	for _, l_Row in pairs(s_ProjectHeaderRows) do
		local s_Header = {
			projectName = l_Row[m_ProjectName_Text_Column_Name],
			mapName = l_Row[m_MapName_Text_Column_Name],
			gameModeName = l_Row[m_GameModeName_Text_Column_Name],
			requiredBundles = json.decode(l_Row[m_RequiredBundles_Text_Column_Name]),
			timeStamp = l_Row[m_TimeStamp_Text_Column_Name],
			id = l_Row['id']
		}

		table.insert(s_ProjectHeaders, s_Header)
	end

	return s_ProjectHeaders
end

function DataBaseManager:GetProjectHeader(p_ProjectId)
	p_ProjectId = tostring(math.floor(p_ProjectId))
	m_Logger:Write("GetProjectHeader()" .. p_ProjectId)

	local s_ProjectHeaderRow = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name .. ' WHERE '.. 'id' .. ' = ' .. p_ProjectId .. ' LIMIT 1')

	if not s_ProjectHeaderRow then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	local s_Header = {
		projectName = s_ProjectHeaderRow[1][m_ProjectName_Text_Column_Name],
		mapName = s_ProjectHeaderRow[1][m_MapName_Text_Column_Name],
		gameModeName = s_ProjectHeaderRow[1][m_GameModeName_Text_Column_Name],
		requiredBundles = json.decode(s_ProjectHeaderRow[1][m_RequiredBundles_Text_Column_Name]),
		timeStamp = s_ProjectHeaderRow[1][m_TimeStamp_Text_Column_Name],
		id = s_ProjectHeaderRow[1]['id']
	}

	return s_Header
end

---@param p_ProjectId number
---@return string|nil
function DataBaseManager:GetProjectDataJSONByProjectId(p_ProjectId)
	p_ProjectId = tostring(math.floor(p_ProjectId))
	m_Logger:Write("GetProjectDataByProjectId()" .. p_ProjectId)

	local s_ProjectDataTable = SQL:Query('SELECT ' .. m_SaveFile_Text_Column_Name .. ' FROM ' .. m_DB_Data_Table_Name .. ' WHERE '.. m_ProjectHeader_Id_Column_Name .. ' = ' .. p_ProjectId .. ' LIMIT 1')

	if not s_ProjectDataTable then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	local s_ProjectDataJSON = s_ProjectDataTable[1][m_SaveFile_Text_Column_Name]

	if not s_ProjectDataJSON then
		m_Logger:Error('Failed to get project data')
		return
	end

	return s_ProjectDataJSON
end

---@param p_ProjectId number
---@return table|nil
function DataBaseManager:GetProjectDataByProjectId(p_ProjectId)
	local s_ProjectDataJSON = self:GetProjectDataJSONByProjectId(p_ProjectId)

	if not s_ProjectDataJSON then
		return
	end

	local s_ProjectData = DecodeParams(json.decode(s_ProjectDataJSON))

	if not s_ProjectData then
		m_Logger:Error('Failed to decode project data')
		return
	end

	return s_ProjectData
end

---@param p_ProjectId number
---@return table|nil
function DataBaseManager:GetProjectByProjectId(p_ProjectId)
	p_ProjectId = tostring(math.floor(p_ProjectId))
	m_Logger:Write("GetProjectByProjectId()" .. p_ProjectId)

	local s_ProjectData = self:GetProjectDataByProjectId(p_ProjectId)
	local s_Header = self:GetProjectHeader(p_ProjectId)

	if s_ProjectData == nil or s_Header == nil then
		m_Logger:Error('Failed to get project save')
		return
	end

	return {
		[m_ExportHeaderName] = s_Header,
		[m_ExportDataName] = s_ProjectData
	}
end

function DataBaseManager:ImportProject(p_ProjectDataJSON)
	-- TODO: check save file version number and handle old formats
	local s_ProjectDataTable = json.decode(p_ProjectDataJSON)

	if s_ProjectDataTable == nil then
		return false, 'Incorrect save format'
	end

	local s_Header = s_ProjectDataTable[m_ExportHeaderName]
	local s_Data = s_ProjectDataTable[m_ExportDataName]

	if s_Header == nil then
		return false, 'Save file is missing header '
	end

	if s_Data == nil then
		return false, 'Save file is missing data'
	end

	if s_Header.projectName == nil or
	s_Header.mapName == nil or
	s_Header.gameModeName == nil or
	s_Header.requiredBundles == nil then
		return false, 'Save header missing necessary field(s)'
	end

	return self:SaveProject(s_Header.projectName, s_Header.mapName, s_Header.gameModeName, s_Header.requiredBundles, s_Data, s_Header.timeStamp)
end

function DataBaseManager:DeleteProject(p_ProjectId)
	m_Logger:Write("DeleteProject()" .. p_ProjectId)

	local s_ProjectHeader = self:GetProjectHeader(p_ProjectId)

	if not s_ProjectHeader then
		m_Logger:Error("Invalid project id")
		return false
	end

	SQL:Query('DELETE FROM ' .. m_DB_Header_Table_Name .. ' WHERE id = ' .. s_ProjectHeader.id) -- this should cascade delete the according data table
	SQL:Query('DELETE FROM ' .. m_DB_Data_Table_Name .. ' WHERE '.. m_ProjectHeader_Id_Column_Name .. ' = ' .. s_ProjectHeader.id)
	return true
end

return DataBaseManager()
