class 'DataBaseManager'

local m_Logger = Logger("DataBaseManager", true)

local m_DB_Header_Table_Name = "project_header"
local m_ProjectName_Text_Column_Name = "project_name"
local m_MapName_Text_Column_Name = "map_name"
local m_RequiredBundles_Text_Column_Name = "required_bundles"

local m_DB_Data_Table_Name = "project_data"
local m_ProjectHeader_Id_Column_Name = "project_header_id"
local m_SaveFile_Text_Column_Name = "save_file_json"

function DataBaseManager:__init()
	m_Logger:Write("Initializing DataBaseManager")
end

function DataBaseManager:SaveProject(p_ProjectName, p_MapName, p_RequiredBundles, p_GameObjectSaveDatas)
	local s_Header = {
		projectName = p_ProjectName,
		mapName = p_MapName,
		requiredBundles = p_RequiredBundles
	}

	self:CreateOrUpdateDatabase()
	local s_HeaderId = self:SaveProjectHeader(s_Header)
	self:SaveProjectData(s_HeaderId, s_JSON_Data)
end

function DataBaseManager:CreateOrUpdateDatabase()
	if not SQL:Open() then
        return
	end
	
	-- Create our data table:
	local createProjectHeaderTableQuery = [[
		CREATE TABLE IF NOT EXISTS ]] .. m_DB_Header_Table_Name .. [[ (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			]] .. m_ProjectName_Text_Column_Name .. [[ TEXT,
			]] .. m_MapName_Text_Column_Name .. [[ TEXT,
			]] .. m_RequiredBundles_Text_Column_Name .. [[ TEXT
		)
	]]

	if not SQL:Query(createDataTableQuery) then
		print('Failed to execute query: ' .. SQL:Error())
		return
	end

    -- Create our data table:
    local createProjectDataTableQuery = [[
        CREATE TABLE IF NOT EXISTS ]] .. m_DB_Data_Table_Name .. [[ (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			]] .. m_ProjectHeader_Id_Column_Name .. [[ INTEGER REFERENCES ]] .. m_DB_Header_Table_Name.. [[(id) ON UPDATE CASCADE
            ]] .. m_SaveFile_Text_Column_Name .. [[ TEXT
		)
    ]]

    if not SQL:Query(createProjectDataTableQuery) then
        print('Failed to execute query: ' .. SQL:Error())
        return
    end
end

function DataBaseManager:SaveProjectHeader(p_Header)
	local s_Query = 'INSERT INTO ' .. m_DB_Header_Table_Name .. ' (' .. m_ProjectName_Text_Column_Name .. ', ' .. m_MapName_Text_Column_Name .. ', ' .. m_RequiredBundles_Text_Column_Name .. ') VALUES (?, ?, ?)'

	if not SQL:Query(s_Query, p_Header.projectName, p_Header.mapName, p_Header.requiredBundles) then
        print('Failed to execute query: ' .. SQL:Error())
        return
	end
	
	m_Logger:Write('Inserted header. Insert ID: ' .. tostring(SQL:LastInsertID()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
	return SQL:LastInsertID()
end

function DataBaseManager:SaveProjectData(p_HeaderId, p_GameObjectSaveDatas)
	local s_JSON_Data = json.encode(p_GameObjectSaveDatas)

	local s_Query = 'INSERT INTO ' .. m_DB_Data_Table_Name .. ' (' .. m_ProjectHeader_Id_Column_Name .. ', ' .. m_SaveFile_Text_Column_Name .. ') VALUES (?, ?)'

	if not SQL:Query(s_Query, p_HeaderId, s_JSON_Data) then
        print('Failed to execute query: ' .. SQL:Error())
        return
	end
	
	m_Logger:Write('Inserted data. Insert ID: ' .. tostring(SQL:LastInsertID()) .. '. Rows affected: ' .. tostring(SQL:AffectedRows()))
end

function DataBaseManager:GetProjectHeaders()
	local s_ProjectHeaderRows = SQL:Query('SELECT * FROM ' .. m_DB_Header_Table_Name)

	if not s_ProjectHeaderRows then
		print('Failed to execute query: ' .. SQL:Error())
		return
	end

	local s_ProjectHeaders = { }

	for _, row in pairs(s_ProjectHeaderRows) do
		local s_Header = {
			projectName = row[m_ProjectName_Text_Column_Name],
			mapName = row[m_MapName_Text_Column_Name],
			requiredBundles = row[m_RequiredBundles_Text_Column_Name]
		}

		table.insert(s_ProjectHeaders, s_Header)
	end

	return s_ProjectHeaders
end

function DataBaseManager:GetProjectData(p_ProjectName)
	local projectDataJson = SQL:Query('SELECT ' .. m_SaveFile_Text_Column_Name .. ' FROM ' .. m_DB_Data_Table_Name .. ' WHERE '.. m_ProjectName_Text_Column_Name .. ' = "' .. p_ProjectName .. '" LIMIT 1')

	if not projectDataJson then
		print('Failed to execute query: ' .. SQL:Error())
		return
	end

	return projectDataJson
end

return DataBaseManager()