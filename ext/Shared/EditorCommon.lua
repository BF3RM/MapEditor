class 'EditorCommon'

local m_Logger = Logger("EditorCommon", true)


function EditorCommon:__init(p_Realm)
    m_Logger:Write("Initializing EditorCommon")
	self:RegisterVars()
	self:RegisterEvents()
end
function EditorCommon:RegisterVars()
	self.timeStopped = false
	self.shouldStopTime = false
end
function EditorCommon:RegisterEvents()
	Events:Subscribe('UpdateManager:Update', self, self.OnUpdatePass)
	Events:Subscribe('Engine:Message', self, self.OnEngineMessage)
end
function EditorCommon:OnUpdatePass(p_Delta, p_Pass)
	if(p_Pass ~= UpdatePass.UpdatePass_PostSim) then
		return
	end
	if(self.timeStopped) then
		return
	end
	if(self.shouldStopTime) then
		self:StopTime()
	end
end
function EditorCommon:SetPlayMode(playmode)
	if(playmode == 'pause') then
		self:StopTime()
		return true
	elseif(playmode == 'play') then
		self:PlayTime()
		return true
	elseif(playmode == 'reset') then
		print('todo')
		self:StopTime()
		return false
	end
end
function EditorCommon:PlayTime()
	if(self.timeStopped) then
		local s_Setting = ResourceManager:GetSettings("GameTimeSettings")
		if(s_Setting == nil) then
			print("No setting")
		else
			s_Setting = GameTimeSettings(s_Setting)
			s_Setting.timeScale = 1
			print('Playing time!')
			self.timeStopped = false
			self.shouldStopTime = false
		end
	end
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
			self.shouldStopTime = false
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
			self.shouldStopTime = true
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
