class 'Editor'

local m_ClientEntityManager = "ClientEntityManager"

function Editor:__init()
	print("Initializing Editor")
	self:RegisterVars()
	self:RegisterEvents()
end

function Editor:RegisterVars()

end

function Editor:RegisterEvents()

end

function Editor:OnEngineMessage(p_Message) 
	if p_Message.type == MessageType.ClientLevelFinalizedMessage then
		print("MessageType.ClientLevelFinalizedMessage")
		m_InstanceParser:FillVariations()

		WebUI:ExecuteJS(string.format("editor.blueprintManager.RegisterBlueprints('%s')", json.encode(m_InstanceParser.m_Blueprints)))
	end
end

function Editor:OnSpawnBlueprint(p_JSONparams)
	local table = self:DecodeParams(json.decode(p_JSONparams))
end

function Editor:DecodeParams(p_Table)
	for s_Key, s_Value in pairs(p_Table) do
		if s_Key == 'transform' then
			local s_LinearTransform = LinearTransform(
				Vec3(s_Value.left.x, s_Value.left.y, s_Value.left.z),
				Vec3(s_Value.up.x, s_Value.up.y, s_Value.up.z),
				Vec3(s_Value.forward.x, s_Value.forward.y, s_Value.forward.z),
				Vec3(s_Value.trans.x, s_Value.trans.y, s_Value.trans.z))
				

			p_Table[s_Key] = s_LinearTransform

		elseif type(s_Value) == "table" then
			self:DecodeParams(s_Value)
		end

	end

	return p_Table
end

return Editor()