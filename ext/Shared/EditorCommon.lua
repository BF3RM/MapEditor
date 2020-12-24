class 'EditorCommon'

local m_Logger = Logger("EditorCommon", true)


function EditorCommon:__init()
    m_Logger:Write("Initializing EditorCommon")
	self:RegisterVars()
	self:RegisterEvents()
end
function EditorCommon:RegisterVars()
	self.timeStopped = false
end
function EditorCommon:RegisterEvents()
	--Events:Subscribe('Engine:Update', self, self.StopTime)
	Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
	Hooks:Install('EntityFactory:Create', 999, self, self.OnEntityCreate)
end
function EditorCommon:StopTime()
	if(not self.timeStopped) then
		local s_Setting = ResourceManager:GetSettings("GameTimeSettings")
		if(s_Setting == nil) then
			print("No setting")
		else
			s_Setting = GameTimeSettings(s_Setting)
			s_Setting.timeScale = 0
			print('Stopped time!')
			self.timeStopped = true
		end
	end
end
function EditorCommon:StepTime()
	if(self.timeStopped) then
		local s_Setting = ResourceManager:GetSettings("GameTimeSettings")
		if(s_Setting == nil) then
			print("No setting")
		else
			s_Setting = GameTimeSettings(s_Setting)
			s_Setting.timeScale = 1
			print('Stepping time!')
			self.timeStopped = false
		end
	end
end
function EditorCommon:OnEngineMessage(p_Message)
	if p_Message.type == MessageType.ClientLoadLevelMessage or p_Message.type == MessageType.ServerLoadLevelMessage then
		self:StopTime()
	end
	if p_Message.type == MessageType.CoreEnteredIngameMessage then
		print("CoreEnteredIngameMessage")
		local iterator = EntityManager:GetIterator('ClientFadeEntity')
		local entity = iterator:Next()
		while entity ~= nil do
			entity:FireEvent("FadeIn")
			entity = iterator:Next()
		end

		iterator = EntityManager:GetIterator('ClientUIGraphEntity')
		entity = iterator:Next()
		while entity ~= nil do
			entity:FireEvent("ExitUIGraph")
			entity = iterator:Next()
		end
		UIManager:EnableFreeCam()
	end
end

function EditorCommon:OnEntityCreate(p_Hook, p_Data, p_Transform)
	if (p_Data:Is("FadeEntityData")) then
		print("Fade entity created")
		print(p_Data.instanceGuid)
		p_Hook:Return(nil)
	end
	if(p_Data.instanceGuid == Guid('A17FCE78-E904-4833-98F8-50BE77EFCC41')) then
		print("Removing UI background")
		p_Hook:Return(nil)
	end
end

function EditorCommon:OnLoadBundles(p_Hook, p_Bundles, p_Compartment, p_ProjectHeader)
    if p_ProjectHeader == nil then
        return
    end

	-- Catch the earliest possible bundle. Both server & client.
	if(p_Bundles[1] == "gameconfigurations/game" or p_Bundles[1] == "UI/Flow/Bundle/LoadingBundleMp") then
		-- Mount your superbundle and bundles..

        -- for _, s_BundleName in pairs(p_ProjectHeader.requiredBundles) do
        --     local s_Bundle = Bundles[s_BundleName] -- Bundles doesnt exit yet

        --     Events:Dispatch('BundleMounter:LoadBundles', s_Bundle.superBundle, s_Bundle.path)
        -- -- TODO Might make sense to gather all bundles of a superbundle and send them together, but not sure if worth the effort
        -- end
	end
end

return EditorCommon
