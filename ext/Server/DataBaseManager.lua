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
end

function DataBaseManager:SaveProject(p_ProjectName, p_MapName, p_GameModeName, p_RequiredBundles, p_GameObjectSaveDatas)
	local s_Header = {
		projectName = p_ProjectName,
		mapName = p_MapName,
		gameModeName = p_GameModeName,
		requiredBundles = p_RequiredBundles,
		timeStamp = SharedUtils:GetTimeMS()
	}

	self:CreateOrUpdateDatabase()
	local s_HeaderId = self:SaveProjectHeader(s_Header)
	self:SaveProjectData(s_HeaderId, s_JSON_Data)
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
			]] .. m_RequiredBundles_Text_Column_Name .. [[ TEXT,
			]] .. m_TimeStamp_Text_Column_Name .. [[ INTEGER
		);

		CREATE UNIQUE INDEX IF NOT EXISTS ]] .. m_ProjectName_Unique_Index .. [[ ON ]] .. m_DB_Header_Table_Name ..  [[(]] .. m_ProjectName_Text_Column_Name .. [[);
	]]

	m_Logger:Write(createProjectHeaderTableQuery)

	if not SQL:Query(createDataTableQuery) then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

    -- Create our data table:
    local createProjectDataTableQuery = [[
        CREATE TABLE IF NOT EXISTS ]] .. m_DB_Data_Table_Name .. [[ (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			]] .. m_ProjectHeader_Id_Column_Name .. [[ INTEGER REFERENCES ]] .. m_DB_Header_Table_Name.. [[(id) ON DELETE CASCADE
            ]] .. m_SaveFile_Text_Column_Name .. [[ TEXT
		)
	]]
	
	m_Logger:Write(createProjectDataTableQuery)

    if not SQL:Query(createProjectDataTableQuery) then
        m_Logger:Error('Failed to execute query: ' .. SQL:Error())
        return
    end
end

function DataBaseManager:SaveProjectHeader(p_Header)
	if p_Header == nil or
		p_Header.projectName == nil or
		type(p_Header.projectName) ~= "string" or
		p_Header.mapName == nil or
		type(p_Header.mapName) ~= "string" or
		p_Header.gameModeName == nil or
		type(p_Header.gameModeName) ~= "string" or
		p_Header.requiredBundles == nil or
		type(p_Header.requiredBundles) ~= "string" or
		p_Header.timeStamp == nil or
		type(p_Header.timeStamp) ~= "number" then
			m_Logger:Error("Failed to save Project, one or more parameters are invalid: " .. tostring(p_Header))
			return
	end

	m_Logger:Write("SaveProjectHeader() " .. tostring(p_Header))


	local s_Query = [[INSERT OR REPLACE INTO ]] .. m_DB_Header_Table_Name .. [[ (]] .. m_ProjectName_Text_Column_Name .. [[, ]] .. m_MapName_Text_Column_Name .. [[, ]] .. m_GameModeName_Text_Column_Name .. [[, ]] .. m_RequiredBundles_Text_Column_Name .. [[) VALUES (?, ?, ?, ?)]]

	m_Logger:Write(s_Query)

	if not SQL:Query(s_Query, p_Header.projectName, p_Header.mapName, p_Header.gameModeName, p_Header.requiredBundles) then
        m_Logger:Error('Failed to execute query: ' .. SQL:Error())
        return
	end
	
	m_Logger:Write('Inserted header. Insert ID: ' .. tostring(SQL:LastInsertID()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
	return SQL:LastInsertID()
end

function DataBaseManager:SaveProjectData(p_HeaderId, p_GameObjectSaveDatas)
	m_Logger:Write("SaveProjectData() " .. tostring(p_HeaderId) .. " | " .. #p_GameObjectSaveDatas)

	local s_JSON_Data = json.encode(p_GameObjectSaveDatas)

	local s_Query = 'INSERT INTO ' .. m_DB_Data_Table_Name .. ' (' .. m_ProjectHeader_Id_Column_Name .. ', ' .. m_SaveFile_Text_Column_Name .. ') VALUES (?, ?)'

	m_Logger:Write(s_Query)

	if not SQL:Query(s_Query, p_HeaderId, s_JSON_Data) then
        m_Logger:Error('Failed to execute query: ' .. SQL:Error())
        return
	end
	
	m_Logger:Write('Inserted data. Insert ID: ' .. tostring(SQL:LastInsertID()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
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
			timeStamp = row[m_TimeStamp_Text_Column_Name]
		}

		table.insert(s_ProjectHeaders, s_Header)
	end

	return s_ProjectHeaders
end

function DataBaseManager:GetProjectHeader(p_ProjectName)
	m_Logger:Write("GetProjectHeader()" .. p_ProjectName)

	local s_ProjectHeaderRow = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name .. ' WHERE '.. m_ProjectName_Text_Column_Name .. ' = "' .. p_ProjectName .. '" LIMIT 1')

	m_Logger:Write(s_ProjectHeaderRow)

	if not s_ProjectHeaderRow then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	local s_Header = {
		projectName = s_ProjectHeaderRow[m_ProjectName_Text_Column_Name],
		mapName = s_ProjectHeaderRow[m_MapName_Text_Column_Name],
		gameModeName = s_ProjectHeaderRow[m_GameModeName_Text_Column_Name],
		requiredBundles = s_ProjectHeaderRow[m_RequiredBundles_Text_Column_Name],
		timeStamp = s_ProjectHeaderRow[m_TimeStamp_Text_Column_Name]
	}

	return s_Header
end

function DataBaseManager:GetProjectDataByProjectName(p_ProjectName)
	m_Logger:Write("GetProjectDataByProjectName()" .. p_ProjectName)

	local projectDataJson = SQL:Query('SELECT ' .. m_SaveFile_Text_Column_Name .. ' FROM ' .. m_DB_Data_Table_Name .. ' WHERE '.. m_ProjectName_Text_Column_Name .. ' = "' .. p_ProjectName .. '" LIMIT 1')

	-- m_Logger:Write(projectDataJson)

	if not projectDataJson then
		m_Logger:Error('Failed to execute query: ' .. SQL:Error())
		return
	end

	return projectDataJson
end

function DataBaseManager:DeleteProject(p_ProjectName)
	m_Logger:Write("DeleteProject()" .. p_ProjectName)

	local s_ProjectHeader = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name .. ' WHERE ' .. m_ProjectName_Text_Column_Name .. ' = "' .. p_ProjectName)

	if not s_ProjectHeader then
		m_Logger:Error("Invalid project name")
	end

	SQL:Query('DELETE FROM ' .. m_DB_Header_Table_Name .. ' WHERE id = "' .. s_ProjectHeader["id"]) -- this should cascade delete the according data table
	-- SQL:Query('DELETE FROM ' .. m_DB_Data_Table_Name .. ' WHERE '.. m_ProjectHeader_Id_Column_Name .. ' = "' .. s_ProjectHeader["id"]) 
end

return DataBaseManager()