class 'DataBaseManager'

local m_Logger = Logger("DataBaseManager", true)

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

function DataBaseManager:__init()
	m_Logger:Write("Initializing DataBaseManager")
	self:CreateOrUpdateDatabase()
end

function DataBaseManager:SaveProject(p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundles, p_GameObjectSaveDatas)
	local s_TimeStamp = SharedUtils:GetTimeMS()

	local s_GameObjectSaveDatasJson = json.encode(p_GameObjectSaveDatas)
	local s_RequiredBundlesJson = json.encode(p_RequiredBundles)

	local s_HeaderId = self:SaveProjectHeader(p_ProjectName, p_MapName, p_GameModeName, s_RequiredBundlesJson, s_TimeStamp)
	self:SaveProjectData(s_HeaderId, s_GameObjectSaveDatasJson)
end

function DataBaseManager:CreateOrUpdateDatabase()
	m_Logger:Write("DataBaseManager:CreateOrUpdateDatabase()")

	if not SQL:Open() then
        return
	end

	-- Create our data table:
	local createProjectHeaderTableQuery = [[
		CREATE TABLE IF NOT EXISTS ]] .. m_DB_Header_Table_Name .. [[ (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			]] .. m_ProjectName_Text_Column_Name .. [[ TEXT,
			]] .. m_MapName_Text_Column_Name .. [[ TEXT,
			]] .. m_GameModeName_Text_Column_Name .. [[ TEXT,
			]] .. m_RequiredBundles_Text_Column_Name .. [[ TEXT,
			]] .. m_TimeStamp_Text_Column_Name .. [[ INTEGER
		);

		CREATE UNIQUE INDEX IF NOT EXISTS ]] .. m_ProjectName_Unique_Index .. [[ ON ]] .. m_DB_Header_Table_Name ..  [[(]] .. m_ProjectName_Text_Column_Name .. [[);
	]]

	-- m_Logger:Write(createProjectHeaderTableQuery)

	if not SQL:Query(createProjectHeaderTableQuery) then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

    -- Create our data table:
    local createProjectDataTableQuery = [[
        CREATE TABLE IF NOT EXISTS ]] .. m_DB_Data_Table_Name .. [[ (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			]] .. m_ProjectHeader_Id_Column_Name .. [[ INTEGER REFERENCES ]] .. m_DB_Header_Table_Name.. [[(id) ON DELETE CASCADE,
            ]] .. m_SaveFile_Text_Column_Name .. [[ TEXT
		);
	]]

	m_Logger:Write(createProjectDataTableQuery)

    if not SQL:Query(createProjectDataTableQuery) then
        m_Logger:Error('Failed to execute query: ' .. SQL:Error())
        return
	end

	m_Logger:Write("Successfully created database!")
end

function DataBaseManager:SaveProjectHeader(p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundlesJson, p_TimeStamp)
	if p_ProjectName == nil or
		type(p_ProjectName) ~= "string" then
		m_Logger:Error("Failed to save Project - header.projectName is invalid: " .. tostring(p_ProjectName))
	end

	if p_MapName == nil or
		type(p_MapName) ~= "string" then
		m_Logger:Error("Failed to save Project - header.mapName is invalid: " .. tostring(p_MapName))
	end

	if p_GameModeName == nil or
		type(p_GameModeName) ~= "string" then
		m_Logger:Error("Failed to save Project - header.gameModeName is invalid: " .. tostring(p_GameModeName))
	end

	if p_RequiredBundlesJson == nil or
		type(p_RequiredBundlesJson) ~= "string" then
		m_Logger:Error("Failed to save Project - header.requiredBundles is invalid: " .. tostring(p_RequiredBundlesJson))
	end

	if p_TimeStamp == nil or
		type(p_TimeStamp) ~= "number" then
		m_Logger:Error("Failed to save Project - header.timeStamp is invalid: " .. tostring(p_TimeStamp))
	end

	local s_Query = [[INSERT OR REPLACE INTO ]] .. m_DB_Header_Table_Name .. [[ (]] .. m_ProjectName_Text_Column_Name .. [[, ]] .. m_MapName_Text_Column_Name .. [[, ]] .. m_GameModeName_Text_Column_Name .. [[, ]] .. m_RequiredBundles_Text_Column_Name .. [[, ]] .. m_TimeStamp_Text_Column_Name .. [[) VALUES (?, ?, ?, ?, ?)]]

	m_Logger:Write(s_Query)
	m_Logger:Write("Inserting values:")
	m_Logger:Write(p_ProjectName .. " | " .. p_MapName .. " | " .. p_GameModeName .. " | " ..  p_RequiredBundlesJson .. " | " .. tostring(p_TimeStamp))

	if not SQL:Query(s_Query, p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundlesJson, p_TimeStamp) then
        m_Logger:Error('Failed to execute query: ' .. SQL:Error())
        return
	end

	m_Logger:Write('Inserted header. Insert ID: ' .. tostring(SQL:LastInsertId()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
	return SQL:LastInsertId()
end

function DataBaseManager:SaveProjectData(p_HeaderId, p_GameObjectSaveDatasJson)
	m_Logger:Write("SaveProjectData() " .. tostring(p_HeaderId))
	m_Logger:Write(p_GameObjectSaveDatasJson)

	local s_Query = 'INSERT INTO ' .. m_DB_Data_Table_Name .. ' (' .. m_ProjectHeader_Id_Column_Name .. ', ' .. m_SaveFile_Text_Column_Name .. ') VALUES (?, ?)'

	m_Logger:Write(s_Query)

	if not SQL:Query(s_Query, p_HeaderId, p_GameObjectSaveDatasJson) then
        m_Logger:Error('Failed to execute query: ' .. SQL:Error())
        return
	end

	m_Logger:Write('Inserted data. Insert ID: ' .. tostring(SQL:LastInsertId()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
end

function DataBaseManager:GetProjectHeaders()
	m_Logger:Write("GetProjectHeaders()")

	local s_ProjectHeaderRows = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name)

	m_Logger:Write(s_ProjectHeaderRows)

	if not s_ProjectHeaderRows then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	local s_ProjectHeaders = { }

	for _, row in pairs(s_ProjectHeaderRows) do
		local s_Header = {
			projectName = row[m_ProjectName_Text_Column_Name],
			mapName = row[m_MapName_Text_Column_Name],
			gameModeName = row[m_GameModeName_Text_Column_Name],
			requiredBundles = row[m_RequiredBundles_Text_Column_Name],
			timeStamp = row[m_TimeStamp_Text_Column_Name],
			id = row['id']
		}

		table.insert(s_ProjectHeaders, s_Header)
	end

	return s_ProjectHeaders
end

function DataBaseManager:GetProjectHeader(p_ProjectId)
	p_ProjectId = tostring(math.floor(p_ProjectId))
	m_Logger:Write("GetProjectHeader()" .. p_ProjectId)

	local s_ProjectHeaderRow = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name .. ' WHERE '.. 'id' .. ' = ' .. p_ProjectId .. ' LIMIT 1')
	-- m_Logger:Write(s_ProjectHeaderRow)

	if not s_ProjectHeaderRow then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end
	local s_Header = {
		projectName = s_ProjectHeaderRow[1][m_ProjectName_Text_Column_Name],
		mapName = s_ProjectHeaderRow[1][m_MapName_Text_Column_Name],
		gameModeName = s_ProjectHeaderRow[1][m_GameModeName_Text_Column_Name],
		requiredBundles = s_ProjectHeaderRow[1][m_RequiredBundles_Text_Column_Name],
		timeStamp = s_ProjectHeaderRow[1][m_TimeStamp_Text_Column_Name],
		id = s_ProjectHeaderRow[1]['id']
	}

	return s_Header
end

function DataBaseManager:GetProjectDataByProjectId(p_ProjectId)
	p_ProjectId = tostring(math.floor(p_ProjectId))
	m_Logger:Write("GetProjectDataByProjectId()" .. p_ProjectId)

	local projectDataJson = SQL:Query('SELECT ' .. m_SaveFile_Text_Column_Name .. ' FROM ' .. m_DB_Data_Table_Name .. ' WHERE '.. m_ProjectHeader_Id_Column_Name .. ' = ' .. p_ProjectId .. ' LIMIT 1')

	-- m_Logger:Write(projectDataJson)

	if not projectDataJson then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	return projectDataJson
end

function DataBaseManager:DeleteProject(p_ProjectId)
	m_Logger:Write("DeleteProject()" .. p_ProjectId)

	local s_ProjectHeader = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name .. ' WHERE ' .. 'id' .. ' = ' .. p_ProjectId)

	if not s_ProjectHeader then
		m_Logger:Error("Invalid project name")
	end

	SQL:Query('DELETE FROM ' .. m_DB_Header_Table_Name .. ' WHERE id = "' .. s_ProjectHeader["id"]) -- this should cascade delete the according data table
	-- SQL:Query('DELETE FROM ' .. m_DB_Data_Table_Name .. ' WHERE '.. m_ProjectHeader_Id_Column_Name .. ' = "' .. s_ProjectHeader["id"])
end

return DataBaseManager()
