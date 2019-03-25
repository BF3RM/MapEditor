class 'Editor'


local m_InstanceParser = require "InstanceParser"


local MAX_CAST_DISTANCE = 10000
local FALLBACK_DISTANCE = 10

function Editor:__init()
	print("Initializing EditorClient")
	self:RegisterVars()

end

function Editor:RegisterVars()
	self.m_PendingRaycast = false
    self.m_FreecamMoving = false

	self.m_Commands = {
		SpawnBlueprintCommand = Backend.SpawnBlueprint,
		DestroyBlueprintCommand = Backend.DestroyBlueprint,
		SetTransformCommand = Backend.SetTransform,
		SelectGameObjectCommand = Backend.SelectGameObject,
		CreateGroupCommand = Backend.CreateGroup,
	}

	self.m_Changes = {
		reference = "SpawnBlueprintCommand",
		destroyed = "DestroyBlueprintCommand",
		transform = "SetTransformCommand",
	}

	self.m_Messages = {
		MoveObjectMessage = self.MoveObject,
		SetViewModeMessage = self.SetViewMode,
		SetScreenToWorldPositionMessage = self.SetScreenToWorldPosition,
		SelectObject3DMessage = self.SelectObject3D,
        PreviewSpawnMessage = self.PreviewSpawn,
        PreviewDestroyMessage = self.PreviewDestroy,
        PreviewMoveMessage = self.PreviewMove
	}

	self.m_Queue = {
        commands = {},
        messages = {}
    };

	self.m_TransactionId = 0
	self.m_GameObjects = {}
    self.m_VanillaObjects = {}
	self.m_VanillaUnresolved = {}
end

function Editor:OnPartitionLoaded(p_Partition)
    m_InstanceParser:OnPartitionLoaded(p_Partition)
end

function Editor:OnLevelLoaded(p_MapName, p_GameModeName)
	m_InstanceParser:OnLevelLoaded(p_MapName, p_GameModeName)
end

function Editor:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		m_InstanceParser:FillVariations()
		local s_LevelDatas = m_InstanceParser:GetLevelDatas()

		for k,v in pairs(s_LevelDatas) do
			WebUI:ExecuteJS(string.format("editor.gameContext.LoadLevel('%s')", json.encode(v)))
		end
		print("Unresolved: " .. #self.m_VanillaUnresolved)

		WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(m_InstanceParser.m_Blueprints)))
        WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(self.m_VanillaObjects)))
        WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(self.m_VanillaUnresolved)))

    end
	if p_Message.type == MessageType.ClientCharacterLocalPlayerSetMessage then
		local s_LocalPlayer = PlayerManager:GetLocalPlayer()

		if s_LocalPlayer == nil then
			error("Local player is nil")
			return
		end
		print("Requesting update")
		NetEvents:SendLocal("MapEditorServer:RequestUpdate", 1)
		WebUI:ExecuteJS(string.format("editor.setPlayerName('%s')", s_LocalPlayer.name))
	end
end

function Editor:OnReceiveUpdate(p_Update)
	local s_Responses = {}
	for k,v in pairs(p_Update) do
		if(self.m_GameObjects[k] == nil) then
			local s_Command = {
				type = "SpawnBlueprintCommand",
				guid = k,
				userData = p_Update[k]
			}
			table.insert(s_Responses, s_Command)
		else
			local s_Changes = GetChanges(self.m_GameObjects[k], p_Update[k])
			-- Hopefully this will never happen. It's hard to test these changes since they require a desync.
			if(#s_Changes > 0) then
				print("--------------------------------------------------------------------")
				print("If you ever see this, please report it on the repo.")
				print(s_Changes)
				print("--------------------------------------------------------------------")
			end
		end

	end
	self:OnReceiveCommand(s_Responses, true)
end

function Editor:OnUpdate(p_Delta, p_SimulationDelta)
    if(self.m_FreecamMoving) then
        self:UpdateCameraTransform()
    end
	-- Raycast has to be done in update
	self:Raycast()
end


function Editor:OnSendToServer(p_Command)
	NetEvents:SendLocal('MapEditorServer:ReceiveCommand', p_Command)
end

function Editor:OnReceiveCommand(p_Command, p_Raw, p_UpdatePass)
	local s_Command = p_Command
	if p_Raw == nil then
		s_Command = DecodeParams(json.decode(p_Command))
	end

	local s_Responses = {}
	for k, l_Command in ipairs(s_Command) do
		local s_Function = self.m_Commands[l_Command.type]
		if(s_Function == nil) then
			print("Attempted to call a nil function: " .. l_Command.type)
			return false
		end
		local s_Response = s_Function(self, l_Command, p_UpdatePass)
		if(s_Response == false) then
			-- TODO: Handle errors
			print("error")
		elseif(s_Response == "queue") then
			print("Queued command")
			table.insert(self.m_Queue.commands, l_Command)
		else
			self.m_GameObjects[l_Command.guid] = MergeUserdata(self.m_GameObjects[l_Command.guid], s_Response.userData)
			table.insert(s_Responses, s_Response)
		end
	end
	if(#s_Responses > 0) then
		WebUI:ExecuteJS(string.format("editor.vext.HandleResponse('%s')", json.encode(s_Responses)))
	end
end

function Editor:OnReceiveMessage(p_Messages, p_Raw, p_UpdatePass)
    local s_Messages = p_Messages
    if p_Raw == nil then
        s_Messages = DecodeParams(json.decode(p_Messages))
    end
    for k, l_Message in ipairs(s_Messages) do


        local s_Function = self.m_Messages[l_Message.type]
        if(s_Function == nil) then
            print("Attempted to call a nil function: " .. l_Message.type)
            return false
        end

        local s_Response = s_Function(self, l_Message, p_UpdatePass)

        if(s_Response == false) then
            -- TODO: Handle errors
            print("error")
        elseif(s_Response == "queue") then
            print("Queued message")
            table.insert(self.m_Queue.messages, l_Message)
        elseif(s_Response == true) then
            --TODO: Success message?
        end
    end

	-- Messages don't respond
end

function Editor:OnUpdatePass(p_Delta, p_Pass)
    if(p_Pass ~= UpdatePass.UpdatePass_PreSim or (#self.m_Queue.commands == 0 and #self.m_Queue.messages == 0)) then
        return
    end
    local s_Commands = {}
    for k,l_Command in ipairs(self.m_Queue.commands) do
        print("Executing command in the correct UpdatePass: " .. l_Command.type)
        table.insert(s_Commands, l_Command)
    end

    self:OnReceiveCommand(s_Commands, true, p_Pass)

    local s_Messages = {}
    for k,l_Message in ipairs(self.m_Queue.messages) do
        print("Executing message in the correct UpdatePass: " .. l_Message.type)
        table.insert(s_Messages, l_Message)
    end

    self:OnReceiveMessage(s_Messages, true, p_Pass)

    if(#self.m_Queue.commands > 0) then
        self.m_Queue.commands = {}
    end
    if(#self.m_Queue.messages > 0) then
        self.m_Queue.messages = {}
    end
end

--[[

	Messages

--]]

function Editor:MoveObject(p_Message)
	return ObjectManager:SetTransform(p_Message.guid, p_Message.transform, false)
end

function Editor:SetViewMode(p_Message)
	local p_WorldRenderSettings = ResourceManager:GetSettings("WorldRenderSettings")
	if p_WorldRenderSettings ~= nil then
		local s_WorldRenderSettings = WorldRenderSettings(p_WorldRenderSettings)
		s_WorldRenderSettings.viewMode = p_Message.viewMode
	else
		print("Failed to get WorldRenderSettings")
		return false;
		-- Notify WebUI
	end
end

function Editor:SetScreenToWorldPosition(p_Message)
	self:SetPendingRaycast(RaycastType.Mouse, p_Message.direction)
end
function Editor:SelectObject3D(p_Message, p_Arguments)
	self:SetPendingRaycast(RaycastType.Select, p_Message.direction)
end

function Editor:PreviewSpawn(p_Message, p_Arguments)
    local s_UserData = p_Message.userData
    return ObjectManager:SpawnBlueprint(p_Message.guid, s_UserData.reference.partitionGuid, s_UserData.reference.instanceGuid, s_UserData.transform, s_UserData.variation)
end
function Editor:PreviewDestroy(p_Message, p_UpdatePass)
    if(p_UpdatePass ~= UpdatePass.UpdatePass_PreSim) then
        return "queue"
    end

    return ObjectManager:DestroyEntity(p_Message.guid)
end
function Editor:PreviewMove(p_Message, p_Arguments)
    return ObjectManager:SetTransform(p_Message.guid, p_Message.transform, false)
end
--[[

	Shit

--]]
function Editor:OnEntityCreateFromBlueprint(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent )
    --Avoid nested blueprints for now...

	local s_PartitionGuid = m_InstanceParser:GetPartition(p_Blueprint.instanceGuid)
	local s_ParentPartition = nil
	local s_ParentPrimaryInstance = nil
	local s_ParentType = nil
	if(p_Parent ~= nil) then
		s_ParentPartition = m_InstanceParser:GetPartition(p_Parent.instanceGuid)
		s_ParentPrimaryInstance = m_InstanceParser:GetPrimaryInstance(s_ParentPartition)
		local s_Parent = ResourceManager:FindInstanceByGUID(Guid(s_ParentPartition), Guid(s_ParentPrimaryInstance))
		s_ParentType = s_Parent.typeInfo.name
	else
		print(p_Blueprint.instanceGuid)
		s_ParentPartition = "dynamic"
		s_ParentPrimaryInstance = "dynamic"
	end
	local s_Response = Backend:BlueprintSpawned(p_Hook, p_Blueprint, p_Transform, p_Variation, p_Parent, s_PartitionGuid, s_ParentPartition, s_ParentPrimaryInstance, s_ParentType)

	-- Check if the current blueprint is referenced from a leveldata
	if(m_InstanceParser:GetLevelData(s_ParentPrimaryInstance) ~= nil) then
		s_Response.parentGuid = s_ParentPrimaryInstance
		table.insert(self.m_VanillaObjects, s_Response)
	else
		print(m_InstanceParser:GetLevelDatas())
	end
		-- Check if the current blueprint is referenced by earlier blueprints
	if(self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] ~= nil) then
		-- Loop through all the children that are referencing this blueprint and assign this as their parent.
		for k,v in pairs(self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)]) do
			v.parentGuid = s_Response.guid
			table.insert(self.m_VanillaObjects, v)
		end
		self.m_VanillaUnresolved[tostring(p_Blueprint.instanceGuid)] = nil
		-- If the current blueprint don't have a parent assigned, add it to the unresolved list
		if(s_Response.parentGuid == nil) then
			-- Add the current blueprint to the unresolved list.
			if(self.m_VanillaUnresolved[s_ParentPrimaryInstance] == nil) then
				self.m_VanillaUnresolved[s_ParentPrimaryInstance] = {}
			end
			table.insert(self.m_VanillaUnresolved[s_ParentPrimaryInstance],s_Response)
		end
	else -- Blueprint has arrived before the parent. Add it to the unresolved list.
		if(self.m_VanillaUnresolved[s_ParentPrimaryInstance] == nil) then
			self.m_VanillaUnresolved[s_ParentPrimaryInstance] = {}
		end
		table.insert(self.m_VanillaUnresolved[s_ParentPrimaryInstance], s_Response)
	end
end



function Editor:OnEntityCreate(p_Hook, p_Data, p_Transform)
    if p_Data == nil then
        print("Didnt get no data")
    else
        local s_Entity = p_Hook:Call(p_Data, p_Transform)
        local s_PartitionGuid = m_InstanceParser:GetPartition(p_Data.instanceGuid)
        if(s_PartitionGuid == nil) then
            return
        end
        local s_Partition = ResourceManager:FindDatabasePartition(Guid(s_PartitionGuid))
        if(s_Partition == nil) then
            return
        end
    end
end

function Editor:Raycast()
	if not self.m_PendingRaycast then
		return
	end

	local s_Transform = ClientUtils:GetCameraTransform()
	local s_Direction = self.m_PendingRaycast.direction

	if(self.m_PendingRaycast.type == RaycastType.Camera) then
		s_Direction = Vec3(s_Transform.forward.x * -1, s_Transform.forward.y * -1, s_Transform.forward.z * -1)
	end


	if s_Transform.trans == Vec3(0,0,0) then -- Camera is below the ground. Creating an entity here would be useless.
		return
	end

	-- The freecam transform is inverted. Invert it back


	local s_CastPosition = Vec3(s_Transform.trans.x + (s_Direction.x * MAX_CAST_DISTANCE),
								s_Transform.trans.y + (s_Direction.y * MAX_CAST_DISTANCE),
								s_Transform.trans.z + (s_Direction.z * MAX_CAST_DISTANCE))

	local s_Raycast = RaycastManager:Raycast(s_Transform.trans, s_CastPosition, 2)

	if s_Raycast ~= nil then
		s_Transform.trans = s_Raycast.position
	else

		-- Raycast didn't hit anything. Spawn it in front of the player instead.
		s_Transform.trans = Vec3(s_Transform.trans.x + (s_Direction.x * FALLBACK_DISTANCE),
							s_Transform.trans.y + (s_Direction.y * FALLBACK_DISTANCE),
							s_Transform.trans.z + (s_Direction.z * FALLBACK_DISTANCE))
	end
	if(self.m_PendingRaycast.type == RaycastType.Camera) then
		WebUI:ExecuteJS(string.format('editor.SetRaycastPosition(%s, %s, %s)',
				s_Transform.trans.x, s_Transform.trans.y, s_Transform.trans.z))
	end
	if(self.m_PendingRaycast.type == RaycastType.Mouse) then
		WebUI:ExecuteJS(string.format('editor.SetScreenToWorldPosition(%s, %s, %s)',
				s_Transform.trans.x, s_Transform.trans.y, s_Transform.trans.z))

		
	end

	-- if(self.m_PendingRaycast.type == RaycastType.Select) then
	-- 	if(s_Raycast == nil or s_Raycast.rigidBody == nil) then
	-- 		print("___option 1: raycast or rigidBody nil")
	-- 		self:GetFistObjectInView(s_Transform.trans, s_CastPosition)
	-- 	else
	-- 			-- Catch all entities in view. SpatialRaycast is really wide :shrug:
	-- 		local s_Entities = RaycastManager:SpatialRaycast(s_Transform.trans, s_CastPosition, SpatialQueryFlags.AllGrids)
	-- 		-- Store the transform of the collider we hit
	-- 		local s_RigidBodyHitTransform = SpatialEntity(s_Raycast.rigidBody).transform

	-- 		if s_RigidBodyHitTransform == Vec3(0,0,0) then
	-- 			print("___option 2: s_RigidBodyHitTransform  == Vec3(0,0,0)")
	-- 			self:GetFistObjectInView(s_Transform.trans, s_CastPosition)
	-- 			goto continue
	-- 		end

	-- 		if(s_Entities ~= nil and #s_Entities > 0) then
	-- 			for k, l_Entity in pairs(s_Entities) do
	-- 				-- Filter the entities to not include physics entities
	-- 				if(l_Entity:Is("SpatialEntity") and
	-- 						not l_Entity:Is("StaticPhysicsEntity") and
	-- 						not l_Entity:Is("GroupPhysicsEntity") and
	-- 						not l_Entity:Is("ClientWaterEntity") and
	-- 						not l_Entity:Is("WaterPhysicsEntity") and
	-- 						not l_Entity:Is("ClientSoldierEntity") and
	-- 						not l_Entity:Is("DebrisClusterContainerEntity") and
	-- 						not l_Entity:Is("CharacterPhysicsEntity")
	-- 				) then
	-- 					local s_Entity = SpatialEntity(l_Entity)
	-- 					-- Compare the collider's transform to the actual entity's transform
	-- 					if(s_RigidBodyHitTransform.trans == s_Entity.transform.trans ) then
	-- 						-- Check if we have that entity's instanceId stored
	-- 						local s_Guid = ObjectManager:GetGuidFromInstanceID(s_Entity.instanceID)
	-- 						if(s_Guid ~= nil) then
	-- 							-- Select it
	-- 							print("___option 3: found transform match")
	-- 							WebUI:ExecuteJS(string.format('editor.Select("%s")', s_Guid))
	-- 							goto continue
	-- 						end
	-- 					end
	-- 				end
	-- 			end

	-- 			print("___option 4: no match found")
	-- 			self:GetFistObjectInView(s_Transform.trans, s_CastPosition)
	-- 		end

	-- 		::continue::
	-- 	end
	-- end
			
	self.m_PendingRaycast = false

end

function Editor:GetFistObjectInView(p_Position, p_CastPosition)
	-- Catch all entities in view.
	local s_Entities = RaycastManager:SpatialRaycast(p_Position, p_CastPosition, SpatialQueryFlags.AllGrids)
	-- print("-------doing SpatialRaycast")
	if(s_Entities ~= nil and #s_Entities > 0) then
		-- local s_Guids = ""
		for k, l_Entity in pairs(s_Entities) do
			-- Filter the entities to not include physics entities
			if(l_Entity:Is("SpatialEntity") and
					not l_Entity:Is("StaticPhysicsEntity") and
					not l_Entity:Is("GroupPhysicsEntity") and
					not l_Entity:Is("ClientWaterEntity") and
					not l_Entity:Is("WaterPhysicsEntity") and
					not l_Entity:Is("ClientSoldierEntity") and
					not l_Entity:Is("DebrisClusterContainerEntity") and
					not l_Entity:Is("CharacterPhysicsEntity")
			) then
				local s_Entity = SpatialEntity(l_Entity)
					-- Check if we have that entity's instanceId stored
				local s_Guid = ObjectManager:GetGuidFromInstanceID(s_Entity.instanceID)
				if(s_Guid ~= nil) then
					-- Select it
					-- s_Guids = s_Guids .. ":" .. s_Guid
					-- print("--found object with guid: ".. s_Guid)
					WebUI:ExecuteJS(string.format('editor.Select("%s")', s_Guid))
					break
				end
			end
		end

		-- WebUI:ExecuteJS(string.format('editor.UpdateSceneObjects("%s")', s_Guids))
	end
end

function Editor:UpdateCameraTransform()
	local s_Transform = ClientUtils:GetCameraTransform()
	local pos = s_Transform.trans

	local left = s_Transform.left
	local up = s_Transform.up
	local forward = s_Transform.forward

	WebUI:ExecuteJS(string.format('editor.threeManager.UpdateCameraTransform(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);',
		left.x, left.y, left.z, up.x, up.y, up.z, forward.x, forward.y, forward.z, pos.x, pos.y, pos.z))

end

function Editor:SetPendingRaycast(p_Type, p_Direction)
	self.m_PendingRaycast = {
		type = p_Type,
		direction = p_Direction
	}
end


return Editor()