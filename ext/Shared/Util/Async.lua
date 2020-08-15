class 'Async'

function Async:__init()
	print("Initializing Async")
	self:RegisterVars()
	self:RegisterEvents()
end

function Async:RegisterVars()
	self.m_Tasks = {}
end

function Async:RegisterEvents()
	Events:Subscribe('Engine:Update', self, self.OnEngineUpdate)
end

function Async:Yield()
	coroutine.yield()
end

function Async:Start(p_Task)
	local s_Task = {
		id = #self.m_Tasks + 1,
		task = p_Task,
		time = 0,
		state = AsyncState.Suspended,
		coroutine = nil
	}
	s_Task.coroutine = coroutine.create(function()
		s_Task.state = AsyncState.Running
		s_Task.task()
		s_Task.state = AsyncState.Dead
	end)
	table.insert(self.m_Tasks, s_Task)
end

function Async:OnEngineUpdate(p_Delta)
	local s_TasksToHandle = #self.m_Tasks
	for _, task in pairs(self.m_Tasks) do
		if (task.state == AsyncState.Suspended) then -- If suspended, resume task
			print("Running task")
			coroutine.resume(task.coroutine)
		end
		if (task.state == AsyncState.Running) then -- Task is already running I guess
			coroutine.resume(task.coroutine)
			task.time = task.time + p_Delta
		end
		if (task.state == AsyncState.Dead) then -- Task is dead
			s_TasksToHandle = s_TasksToHandle - 1
		end
	end
	if (#self.m_Tasks > 0 and s_TasksToHandle == 0) then
		print("All tasks are completed. Clearing buffer")
		self.m_Tasks = {}
	end
end

return Async()

