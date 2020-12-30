class 'Coroutiner'

function Coroutiner:__init()
	print("Initializing Coroutiner")
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
	for _, task in pairs(self.m_Tasks) do
		if (task.state == CoroutineState.Suspended) then -- If suspended, resume task
			print("Running task")
			coroutine.resume(task.coroutine)
		end
		if (task.state == CoroutineState.Running) then -- Task is already running I guess
			coroutine.resume(task.coroutine)
			task.time = task.time + p_Delta
		end
		if (task.state == CoroutineState.Dead) then -- Task is dead
			s_TasksToHandle = s_TasksToHandle - 1
		end
	end
	if (#self.m_Tasks > 0 and s_TasksToHandle == 0) then
		print("All tasks are completed. Clearing buffer")
		self.m_Tasks = {}
	end
end

return Coroutiner()

