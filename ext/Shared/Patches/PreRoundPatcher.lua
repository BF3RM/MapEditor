class 'PreRoundPatcher'

local m_Logger = Logger("PreRoundPatcher", false)

function PreRoundPatcher:__init()
	m_Logger:Write("Initializing PreRoundPatcher")
end

function PreRoundPatcher:PatchPreRound()
	-- This is for Conquest tickets etc.
	local s_TicketCounterIterator = EntityManager:GetIterator("ServerTicketCounterEntity")

	local s_TicketCounterEntity = s_TicketCounterIterator:Next()
	while s_TicketCounterEntity do

		s_TicketCounterEntity = Entity(s_TicketCounterEntity)
		s_TicketCounterEntity:FireEvent('StartRound')
		s_TicketCounterEntity = s_TicketCounterIterator:Next()
	end

	-- This is for Rush tickets etc.
	local s_LifeCounterIterator = EntityManager:GetIterator("ServerLifeCounterEntity")

	local s_LifeCounterEntity = s_LifeCounterIterator:Next()
	while s_LifeCounterEntity do

		s_LifeCounterEntity = Entity(s_LifeCounterEntity)
		s_LifeCounterEntity:FireEvent('StartRound')
		s_LifeCounterEntity = s_LifeCounterIterator:Next()
	end

	-- This is for TDM tickets etc.
	local s_KillCounterIterator = EntityManager:GetIterator("ServerKillCounterEntity")

	local s_KillCounterEntity = s_KillCounterIterator:Next()
	while s_KillCounterEntity do

		s_KillCounterEntity = Entity(s_KillCounterEntity)
		s_KillCounterEntity:FireEvent('StartRound')
		s_KillCounterEntity = s_KillCounterIterator:Next()
	end

	-- This is needed so you are able to move
	local s_InputRestrictionIterator = EntityManager:GetIterator("ServerInputRestrictionEntity")

	local s_InputRestrictionEntity = s_InputRestrictionIterator:Next()
	while s_InputRestrictionEntity do

		s_InputRestrictionEntity = Entity(s_InputRestrictionEntity)
		s_InputRestrictionEntity:FireEvent('Disable')

		s_InputRestrictionEntity = s_InputRestrictionIterator:Next()
	end

	-- This Entity is needed so the round ends when tickets are reached
	local s_RoundOverIterator = EntityManager:GetIterator("ServerRoundOverEntity")

	local s_RoundOverEntity = s_RoundOverIterator:Next()
	while s_RoundOverEntity do

		s_RoundOverEntity = Entity(s_RoundOverEntity)
		s_RoundOverEntity:FireEvent('RoundStarted')

		s_RoundOverEntity = s_RoundOverIterator:Next()
	end

	-- This EventGate needs to be closed otherwise Attacker can't win in Rush 
	local s_EventGateIterator = EntityManager:GetIterator("EventGateEntity")

	local s_EventGateEntity = s_EventGateIterator:Next()
	while s_EventGateEntity do

		s_EventGateEntity = Entity(s_EventGateEntity)

		if s_EventGateEntity.data.instanceGuid == Guid('253BD7C1-920E-46D6-B112-5857D88DAF41') then
			s_EventGateEntity:FireEvent('Close')
		end

		s_EventGateEntity = s_EventGateIterator:Next()
	end

	m_Logger:Write("Patched PreRound Entities")
end

function PreRoundPatcher:PatchPreRoundEntityData(p_Instance)
	local s_PreRoundEntityData = PreRoundEntityData(p_Instance)
	s_PreRoundEntityData:MakeWritable()
	s_PreRoundEntityData.enabled = false

	m_Logger:Write("Patched PreRoundEntityData")
end

return PreRoundPatcher()