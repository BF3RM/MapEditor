class 'GameObject'

local m_Logger = Logger("GameObject", true)
local m_TraceableField_Suffix = "_original_value"

function GameObject:__init(arg)
    self.guid = arg.guid
    self.creatorName = arg.creatorName -- never gets sent to js
    self.blueprintCtrRef = arg.blueprintCtrRef
    self.isVanilla = arg.isVanilla -- never gets sent to js
    self.gameEntities = arg.gameEntities or { }
    self.children = arg.children or {} -- never gets sent to js
    self.realm = arg.realm
    self.isUserModified = true
    self.userModifiedFields = {}
	self.originalRef = arg.originalRef  -- never gets sent to js
	self.localTransform = arg.localTransform
    self.overrides = arg.overrides or {}
	self.internalBlueprint = nil
    --self.name = arg.name
    --self.parentData = arg.parentData
    --self.transform = arg.transform  -- world transform
    --self.variation = arg.variation
    --self.isDeleted = arg.isDeleted --> only vanilla objects, dont appear in the browser anymore. entities get disabled, because we cannot destroy them
    --self.isEnabled = arg.isEnabled

    self:RegisterUserModifiableField("name", arg.name)
    self:RegisterUserModifiableField("parentData", arg.parentData)
    self:RegisterUserModifiableField("transform", arg.transform)
	self:RegisterUserModifiableField("localTransform", arg.localTransform)
    self:RegisterUserModifiableField("variation", arg.variation)
    self:RegisterUserModifiableField("isDeleted", arg.isDeleted)
	self:RegisterUserModifiableField("isEnabled", arg.isEnabled)
	self:RegisterUserModifiableField("overrides", self.overrides)
end

function GameObject:RegisterUserModifiableField(p_FieldName, p_DefaultValue)
    self[p_FieldName] = p_DefaultValue
    self[p_FieldName .. m_TraceableField_Suffix] = p_DefaultValue
end

function GameObject:SetField(p_FieldName, p_NewValue, p_AutoModified)
    self[p_FieldName] = p_NewValue
	if(not p_AutoModified) then
	    local originalValue = self[p_FieldName .. m_TraceableField_Suffix]
        local newValue = self[p_FieldName]
		self.userModifiedFields[p_FieldName] = newValue ~= originalValue
	end
end

function GameObject:IsUserModified()
    if (self.isVanilla == false) then
        return true
    end

    for fieldName, isUserModified in pairs(self.userModifiedFields) do
        if isUserModified == true then
            m_Logger:Write("GameObject: " .. self.name .. " has modified field: " .. fieldName .. " - original value: " .. tostring(self[fieldName .. m_TraceableField_Suffix]) .. " | new value: " .. tostring(self[fieldName]))
            return true
        end
    end

    return false
end

function GameObject:Disable(p_AutoModified)
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:Disable(true)
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Disable()
            end
        end
    end
	self:SetField("isEnabled", false, p_AutoModified)
end

function GameObject:Enable(p_AutoModified)
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:Enable(true)
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Enable()
            end
        end
    end
	self:SetField("isEnabled", true, p_AutoModified)
end

function GameObject:MarkAsDeleted(p_AutoModified)
    if (self.isVanilla == false) then
        m_Logger:Error("Cant delete a non-vanilla object, use destroy instead")
        return
    end
	self:Disable(p_AutoModified)
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:MarkAsDeleted(true)
        end
    end
	self:SetField("isDeleted", true, p_AutoModified)
end

function GameObject:MarkAsUndeleted(p_AutoModified)
    if (self.isVanilla == false) then
        m_Logger:Error("Cant undelete a non-vanilla object, use spawn instead")
        return
    end
	self:Enable(p_AutoModified)
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:MarkAsUndeleted(true)
        end
    end
	self:SetField("isDeleted", false, p_AutoModified)
end

function GameObject:Destroy() -- this will effectively destroy all entities and childentities. the gameobject becomes useless and needs to be dereferenced
	self:Disable()
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            l_ChildGameObject:Destroy()
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if l_GameEntity ~= nil then
                l_GameEntity:Destroy()
            end
        end
    end
end

function GameObject:SetTransform(p_LinearTransform, p_UpdateCollision, p_AutoModified)
    if self.children ~= nil then
        for _, l_ChildGameObject in pairs(self.children) do
            if(l_ChildGameObject == nil) then
                m_Logger:Error("l_ChildGameObject is nil?")
                return false
            end

            -- We calculate the offset to get where the child gameobject should be
            local s_Offset = ToLocal(l_ChildGameObject.transform, self.transform)
	        l_ChildGameObject.localTransform = s_Offset
            local s_LinearTransform = ToWorld(s_Offset, p_LinearTransform)

            local s_Response = l_ChildGameObject:SetTransform(s_LinearTransform, p_UpdateCollision, true)

            if not s_Response then
                return false
            end
        end
    end

    if self.gameEntities ~= nil then
        for _, l_GameEntity in pairs(self.gameEntities) do
            if(l_GameEntity == nil) then
                m_Logger:Error("GameEntity is nil?")
                return false
            end
            local response = l_GameEntity:SetTransform(p_LinearTransform, p_UpdateCollision, self.isEnabled)

            if not response then
                return false
            end
        end
    end
	self:SetField("transform", LinearTransform(p_LinearTransform), p_AutoModified)
	if(tostring(self.parentData.guid) ~= "00000000-0000-0000-0000-000000000000") then
		local s_Parent = GameObjectManager:GetGameObject(self.parentData.guid)
		if(s_Parent ~= nil) then
			local s_LocalTransform = ToLocal(self.transform, s_Parent.transform)
			self:SetField("localTransform", s_LocalTransform, p_AutoModified)
		else
			m_Logger:Write("Could not find parent")
		end
	end
    return true
end

function GameObject:GetGameObjectTransferData()
    local s_GameObjectTransferData = {
        guid = self.guid,
        name = self.name,
        blueprintCtrRef = self.blueprintCtrRef:GetTable(),
        parentData = self.parentData:GetTable(),
        transform = self.transform,
        localTransform = self.localTransform,
        variation = self.variation,
        isEnabled = self.isEnabled,
        isDeleted = self.isDeleted,
        creatorName = self.creatorName,
        isVanilla = self.isVanilla,
        realm = self.realm,
        isUserModified = self.isUserModified,
        overrides = self.overrides
        -- entities have to be set externally
    }

    local s_GameEntityTransferDatas = { }
    for _, l_GameEntity in pairs(self.gameEntities) do
        table.insert(s_GameEntityTransferDatas, l_GameEntity:GetGameEntityTransferData())
    end

    s_GameObjectTransferData.gameEntities = s_GameEntityTransferDatas

    return s_GameObjectTransferData
end

function GameObject:GetEntities()
    local s_Entities = { }

    for _, l_GameEntity in pairs(self.gameEntities) do
        table.insert(s_Entities, l_GameEntity.entity)
    end

    return s_Entities
end

function GameObject:SetOverrides(p_Overrides)
	print("Setting overrides of gameobject.")
	local s_ShouldRespawn = false
	local s_Blueprint = nil
	if (self.internalBlueprint == nil) then
		print("Internal blueprint not set. Respawn this gameobject! Blueprint will be cloned and overrides will be set at spawn.")
		if(self:HasOverrides()) then
			print("We already have overrides set, but no internal blueprint yet? How is this possible?")
		end
		self:SetField('overrides', p_Overrides) -- Setting overrides
		return true, true, self:GetGameObjectTransferData()
	else
		s_Blueprint = self.internalBlueprint:Get()
	end
	if(s_Blueprint == nil) then
		print("Failed to get blueprint?")
		print(self.internalBlueprint.instanceGuid)
		print(self.internalBlueprint.partitionGuid)
		return false, false
	else
		print("Applying overrides to: ")
		print(self.internalBlueprint.instanceGuid)
		print(self.internalBlueprint.partitionGuid)
	end
	local s_PartitionInstanceGuid = InstanceParser:GetPartition(Guid(s_Blueprint.instanceGuid))
	print(s_PartitionInstanceGuid)
	local s_Partition = ResourceManager:FindDatabasePartition(Guid(s_PartitionInstanceGuid))
	m_Logger:Write("Setting overrides: " .. tostring(s_Blueprint.instanceGuid))
	for k,l_Field in pairs(p_Overrides) do
		m_Logger:Write(k)
		m_Logger:Write(l_Field)
		local s_Success, s_Path, s_DemandsRespawn = self:SetOverride(s_Blueprint, l_Field, self.guid, s_Partition)
		if (s_Success and s_DemandsRespawn) then
			print("Overrides demands respawn")
			s_ShouldRespawn = true
		end
	end
	print("Finished setting overrides. Should respawn: " .. tostring(s_ShouldRespawn))
	self:SetField('overrides', self.overrides) -- Assigning to itself just to trigger the modified field.
	if(s_ShouldRespawn) then
		print("Set overrides, but GameObject should respawn since we changed references...")
		return true, s_ShouldRespawn, self:GetGameObjectTransferData()
	else
		return true, false
	end
end
function GameObject:SetOverride(p_Instance, p_Field, p_RootGuid, p_Partition)
	local s_Path, s_RequiresRespawn = EBXManager:SetField(p_Instance, p_Field, '', p_RootGuid, p_Partition, false)
	if(s_Path) then
		print(s_Path)
		self.overrides[s_Path] = p_Field
	end
	if(s_RequiresRespawn) then
		print("Requires respawn!!")
	end
	return s_Path ~= '', s_Path, s_RequiresRespawn
end

function GameObject:HasOverrides()
	if(self.overrides) then
		return GetLength(self.overrides) > 0
	end
	return false
end


return GameObject
