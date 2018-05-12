class 'MapEditorClient'
local Shared = require '__shared/MapEditorShared'
local JSONentities = require '__shared/JSONentities'

function MapEditorClient:__init()
	print("Initializing MapEditorClient")
	self:RegisterVars()
	self:RegisterEvents()
	Shared:__init()
end

function MapEditorClient:RegisterVars()
	self.spawnedEntities = {}
	self.selectedEntityID = -1
end

function MapEditorClient:RegisterEvents()
	--Game events
	self.m_OnUpdateInputEvent = Events:Subscribe('Client:UpdateInput', self, self.OnUpdateInput)
	self.m_ExtensionLoadedEvent = Events:Subscribe('ExtensionLoaded', self, self.OnLoaded)
	self.m_EngineMessageEvent = Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
	self.m_EngineUpdateEvent = Events:Subscribe("Engine:Update", self, self.OnUpdate)

	--WebUI events
	self.m_SetEffectEvent = Events:Subscribe('MapEditor:SpawnInstance', self, self.OnSpawnInstance)
	self.m_SetEffectEvent = Events:Subscribe('MapEditor:EnableKeyboard', self, self.OnEnableKeyboard)
	self.m_SetEffectEvent = Events:Subscribe('MapEditor:DisableKeyboard', self, self.OnDisableKeyboard)
	self.m_SetEffectEvent = Events:Subscribe('MapEditor:SelectEntity', self, self.OnSelectEntity)
	self.m_SetEffectEvent = Events:Subscribe('MapEditor:UnselectEntity', self, self.OnUnselectEntity)
	self.m_SetEffectEvent = Events:Subscribe('MapEditor:SetEntityMatrix', self, self.OnSetEntityMatrix)
	self.m_SetEffectEvent = Events:Subscribe('MapEditor:DeleteEntity', self, self.OnDeleteEntity)
end

----------- Game functions----------------

function MapEditorClient:OnUpdate(p_Delta, p_SimulationDelta)
	if self.selectedEntityID < 0 then
		return
	end

	local s_Player = PlayerManager:GetLocalPlayer()
	if s_Player == nil or s_Player.soldier == nil then
		m_Soldier = nil
	else
		m_Soldier = s_Player.soldier
	end
	if(m_Soldier == nil and not s_Player.teamID == 0) then
		return
	end

	local s_Transform = ClientUtils:GetCameraTransform()
	local pos = s_Transform.trans

	local left = s_Transform.left
	local up = s_Transform.up
	local forward = s_Transform.forward

	WebUI:ExecuteJS(string.format('UpdateCameraPos(%s, %s, %s);', pos.x, pos.y, pos.z))
	WebUI:ExecuteJS(string.format('UpdateCameraAngle(%s, %s, %s,%s, %s, %s,%s, %s, %s);', left.x, left.y, left.z,up.x, up.y, up.z,forward.x, forward.y, forward.z))
end

function MapEditorClient:OnLoaded()
	print("init")
	-- Initialize our custom WebUI package.
	WebUI:Init()

	-- Show our custom WebUI package.
	WebUI:Show()
end

function MapEditorClient:OnEngineMessage(p_Message) 

	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		print("MessageType.ClientLevelFinalizedMessage")
		-- print(Shared.m_BlueprintInstances)

	
		WebUI:ExecuteJS(string.format("RegisterInstances('%s')", json.encode(Shared.m_BlueprintInstances)))
		self:LoadJSONEntities() --Might be better to call this after a bit, so we are sure that all the blueprints are stored in js
	end
end

function MapEditorClient:OnUpdateInput(p_Delta)
	--We need to do the raycast in a physics update apparently.
	if(self.spawnEntity ~= nil) then
		-- RAYCAST START

		local s_Player = PlayerManager:GetLocalPlayer()
		if s_Player == nil then
			return
		end

		local s_Soldier = s_Player.soldier
		if s_Soldier == nil  and not s_Player.teamID == 0 then
			return
		end

		local s_Transform = ClientUtils:GetCameraTransform()
		local s_CastDistance = 10000;

        local s_CameraTransform = ClientUtils:GetCameraTransform()

        local s_CameraForward = Vec3(s_Transform.forward.x * -1, s_Transform.forward.y * -1, s_Transform.forward.z * -1)

		local s_CastPosition = Vec3(s_CameraTransform.trans.x + (s_CameraForward.x*s_CastDistance),
									s_CameraTransform.trans.y + (s_CameraForward.y*s_CastDistance),
									s_CameraTransform.trans.z + (s_CameraForward.z*s_CastDistance))

        print("starting raycast")
        local s_Raycast = RaycastManager:Raycast(s_CameraTransform.trans, s_CastPosition, 2)
		print("raycast did")
		if(s_Raycast ~= nil) then
			-- print(tostring(s_Raycast.rigidBody.typeInfo.name))
		else
			return
		end		

		-- RAYCAST END
		local s_Instance = self.spawnEntity.instance
		local s_InstanceBlueprintID = self.spawnEntity.blueprintID


		print(tostring(s_Instance))
		print("raycast didnt stop us, no sir")
		if(s_Raycast == nil or s_Raycast.position == nil) then
			print("Raycast didn't hit nothin")
			return
		end

		local s_Transform = LinearTransform(Vec3(1,0,0),Vec3(0,1,0),Vec3(0,0,1),Vec3(0,0,0))
		s_Transform.trans = s_Raycast.position
		print("Spawning!")

		local prefabEntities = EntityManager:CreateClientEntitiesFromBlueprint(s_Instance, s_Transform, true)
		print("Spawned!")

		if(prefabEntities == nil) then
			print("Unable to spawn shit.")
		end

		for i, entity in ipairs(prefabEntities) do
			print(i)
			entity:Init(Realm.Realm_Client, true)
		end

		self.spawnEntity = nil

		self:RegisterEntity(s_InstanceBlueprintID, prefabEntities, s_Transform)
		
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F1) then
		
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F2) then
		WebUI:BringToFront()
		WebUI:EnableMouse()
		WebUI:Show()
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_F3) then
		--WebUI:BringToFront()
		WebUI:DisableMouse()
		-- WebUI:Hide()
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_Q) then
		WebUI:ExecuteJS("SetGizmoMode(\'translate\')")
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_W) then
		WebUI:ExecuteJS("SetGizmoMode(\'rotate\')")
	end

	if InputManager:WentKeyDown(InputDeviceKeys.IDK_E) then
		WebUI:ExecuteJS("SetGizmoMode(\'scale\')")
	end
end

----------- WebUI functions----------------

function MapEditorClient:OnEnableKeyboard() 
		WebUI:EnableKeyboard()
end
function MapEditorClient:OnDisableKeyboard() 
		WebUI:DisableKeyboard()
end

function MapEditorClient:OnDeleteEntity(p_ID)
	if p_ID ~= self.selectedEntityID then 
		error("Trying to delete an entity that's not selected. Parameter: "..p_ID..", selected ID: ".. self.selectedEntityID)
	end

	local s_Entities = self.spawnedEntities[p_ID]

	for _, l_Entity in ipairs(s_Entities) do
		-- local s_Entity = SpatialEntity(l_Entity)

		-- if s_Entity ~= nil then
			-- l_Entity:Destroy()
			l_Entity = nil
		-- end
	end

	self.spawnedEntities[p_ID] = nil
	WebUI:ExecuteJS("RemoveEntityFromList("..p_ID..")")

end

function MapEditorClient:OnSelectEntity(p_ID) 
	
	if self.selectedEntityID < 0 then
		WebUI:ExecuteJS("ShowGizmo()")
	end

	self.selectedEntityID = tonumber(p_ID)

	local entities = self.spawnedEntities[self.selectedEntityID]

	if entities == nil then
		return
	end

	local entity = SpatialEntity(entities[1])

	if entity ~= nil then

		local left = entity.transform.left
		local up = entity.transform.up
		local forward = entity.transform.forward

		local pos = entity.transform.trans

		-- TODO: send rotation too and apply it if gizmo is on local state
		WebUI:ExecuteJS(string.format('SetGizmoAt(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);', 
			left.x, left.y, left.z,up.x, up.y, up.z,forward.x, forward.y, forward.z, pos.x, pos.y, pos.z))

	end
end

function MapEditorClient:OnUnselectEntity(p_ID) 
	WebUI:ExecuteJS("HideGizmo()")
	self.selectedEntityID = -1
end

function MapEditorClient:OnSetEntityMatrix(p_Args) 
	-- print("OnSetEntityMatrix "..p_Args)

	local p_ArgsArray = split(p_Args, ",")

	if tonumber(p_ArgsArray[1]) ~= self.selectedEntityID then
		error("Moved entity that isn't selected. Parameter: "..tonumber(p_ArgsArray[1])..", selected ID: ".. self.selectedEntityID)
	end

	local s_Entities = self.spawnedEntities[tonumber(p_ArgsArray[1])]

	for _, l_Entity in ipairs(s_Entities) do
		local s_Entity = SpatialEntity(l_Entity)

		if s_Entity ~= nil then
			-- print("moving")
			local s_Left 		 = Vec3( tonumber(p_ArgsArray[2]), tonumber(p_ArgsArray[3]), tonumber(p_ArgsArray[4]) )
			local s_Up 			 = Vec3( tonumber(p_ArgsArray[6]), tonumber(p_ArgsArray[7]), tonumber(p_ArgsArray[8]) )
			local s_Forward  = Vec3( tonumber(p_ArgsArray[10]), tonumber(p_ArgsArray[11]), tonumber(p_ArgsArray[12]) )
			local s_Position = Vec3( tonumber(p_ArgsArray[14]), tonumber(p_ArgsArray[15]), tonumber(p_ArgsArray[16]) )
			-- print( s_Position )
			local s_Transform = LinearTransform(
					s_Left,
					s_Up,
					s_Forward,
					s_Position
				)
			s_Entity.transform = s_Transform
		else
			print("entity was null")
		end
	end
end

function MapEditorClient:OnSpawnInstance(p_ParamsCombined) 
	-- print("---------------------")
	print(p_ParamsCombined)
	local p_GuidSplit = split(p_ParamsCombined, ":")
	-- print(p_GuidSplit[1])
	-- print(p_GuidSplit[2])
	-- print(p_GuidSplit[3])
	local s_Instance = ResourceManager:FindInstanceByGUID(Guid(p_GuidSplit[1]), Guid(p_GuidSplit[2]))

	if(s_Instance == nil) then
		print("Attempted to spawn an instance that doesn't exist: " .. p_PartitionGuid .. " | " .. p_InstanceGuid)
		return
	end
	
	self.spawnEntity = {blueprintID = p_GuidSplit[2], instance = _G[s_Instance.typeInfo.name](s_Instance)}
	
end

--------------- Class functions ---------------

function MapEditorClient:RegisterEntity(p_BlueprintID, p_EntityArray, p_EntityTransform) 
	if p_EntityArray == nil or #p_EntityArray == 0 then
		return
	end

	local s_ID = #self.spawnedEntities + 1
	table.insert(self.spawnedEntities, p_EntityArray)

	local s_Left = p_EntityTransform.left
	local s_Up = p_EntityTransform.up
	local s_Forward = p_EntityTransform.forward
	local s_Pos = p_EntityTransform.trans

	local s_MatrixString = string.format('%s,%s,%s,0,%s,%s,%s,0,%s,%s,%s,0,%s,%s,%s,1', 
		s_Left.x, s_Left.y, s_Left.z, s_Up.x, s_Up.y, s_Up.z, s_Forward.x, s_Forward.y, s_Forward.z, s_Pos.x, s_Pos.y, s_Pos.z )

	WebUI:ExecuteJS(string.format('OnSpawnedEntity(%s, \"%s\", \"%s\")', s_ID, p_BlueprintID, s_MatrixString))
end

function MapEditorClient:LoadJSONEntities() 
	if JSONentities == nil or JSONentities == true then
		print("No entities saved in JSON")
		return
	end

	print("Found JSON table, applying..")

	local entitiesArray = json.decode(JSONentities)

	if entitiesArray == nil then
		print("JSON string is not valid")
		return
	end



	-- print(entitiesArray)

	for k, entityInfo in ipairs(entitiesArray) do
		local s_Instance = ResourceManager:FindInstanceByGUID(Guid(entityInfo.partitionGuid), Guid(entityInfo.instanceGuid))

		if(s_Instance == nil) then
			print("Attempted to spawn an instance that doesn't exist: " .. entityInfo.partitionGuid .. " | " .. entityInfo.instanceGuid)
			goto continue
		end

		local m = split(entityInfo.matrix, ",")

		for i,v in ipairs(m) do
			m[i] = tonumber(v)
		end

		local s_Transform = LinearTransform(Vec3(m[1],m[2],m[3]),Vec3(m[5],m[6],m[7]),Vec3(m[9],m[10],m[11]),Vec3(m[13],m[14],m[15]))
		
		-- print("Spawning!")

		local prefabEntities = EntityManager:CreateClientEntitiesFromBlueprint(s_Instance, s_Transform, true)
		print("Spawned!")

		if(prefabEntities == nil) then
			print("Unable to spawn shit.")
		end

		for i, entity in ipairs(prefabEntities) do
			entity:Init(Realm.Realm_Client, true)
		end

		self:RegisterEntity(entityInfo.instanceGuid, prefabEntities, s_Transform)
		

		::continue::
	end
end


function split(pString, pPattern)
	local Table = {}  -- NOTE: use {n = 0} in Lua-5.0
	local fpat = "(.-)" .. pPattern
	local last_end = 1
	local s, e, cap = pString:find(fpat, 1)
	while s do
		if s ~= 1 or cap ~= "" then
			table.insert(Table,cap)
		end
		last_end = e+1
		s, e, cap = pString:find(fpat, last_end)
	end
	if last_end <= #pString then
		cap = pString:sub(last_end)
		table.insert(Table, cap)
	end
	return Table
end

g_MapEditorClient = MapEditorClient()

