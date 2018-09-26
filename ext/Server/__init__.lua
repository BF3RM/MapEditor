class 'MapEditorServer'

function MapEditorServer:__init()
	print("Initializing MapEditorServer")
	self:RegisterVars()
	self:RegisterEvents()
end

function MapEditorServer:RegisterVars()
end

function MapEditorServer:RegisterEvents()
	NetEvents:Subscribe('EnableInputRestriction', self, self.OnEnableInputRestriction)
	NetEvents:Subscribe('DisableInputRestriction', self, self.OnDisableInputRestriction)
end

function MapEditorServer:OnEnableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, false)
end

function MapEditorServer:OnDisableInputRestriction(p_Player)
	self:SetInputRestriction(p_Player, true)
end

function MapEditorServer:SetInputRestriction(p_Player, p_Enabled)
	for i=0, 65 do
		p_Player:EnableInput(i, p_Enabled)
	end
end



return MapEditorServer()