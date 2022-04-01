---@class Coroutiner
Coroutiner = class 'Coroutiner'

local m_Logger = Logger("Coroutiner", false)

function Coroutiner:__init()
	m_Logger:Write("Initializing Coroutiner")
	self:RegisterVars()
	self:RegisterEvents()
end

function Coroutiner:RegisterVars()
	self.m_Tasks = {}
end

function Coroutiner:RegisterEvents()
	Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)
end

function Coroutiner:Yield()
	coroutine.yield()
end

function Coroutiner:Start(p_Task)
	local s_Task = {
		id = #self.m_Tasks + 1,
		task = p_Task,
		time = 0,
		state = CoroutineState.Suspended,
		coroutine = nil
	}

	s_Task.coroutine = coroutine.create(function()
		s_Task.state = CoroutineState.Running
		s_Task.task()
		s_Task.state = CoroutineState.Dead
	end)

	table.insert(self.m_Tasks, s_Task)
end

function Coroutiner:OnEngineUpdate(p_Delta)
	local s_TasksToHandle = #self.m_Tasks

	for _, l_Task in pairs(self.m_Tasks) do
		if l_Task.state == CoroutineState.Suspended then -- If suspended, resume task
			m_Logger:Write("Running task")
			coroutine.resume(l_Task.coroutine)
		end

		if l_Task.state == CoroutineState.Running then -- Task is already running I guess
			coroutine.resume(l_Task.coroutine)
			l_Task.time = l_Task.time + p_Delta
		end

		if l_Task.state == CoroutineState.Dead then -- Task is dead
			s_TasksToHandle = s_TasksToHandle - 1
		end
	end

	if #self.m_Tasks > 0 and s_TasksToHandle == 0 then
		m_Logger:Write("All tasks are completed. Clearing buffer")
		self.m_Tasks = {}
	end
end

Coroutiner = Coroutiner()

return Coroutiner

