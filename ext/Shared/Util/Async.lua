class 'Async'
asyncStates = {
	"scheduled",
	"suspended",
	"running",
	"dead"
}

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

function Async:yield()
	coroutine.yield()
end

function Async:Start(task)
	local task = {
		id = #self.m_Tasks + 1,
		task = task,
		time = 0,
		state = asyncStates[2],
		coroutine = nil
	}
	task.coroutine = coroutine.create(function()
		task.state = asyncStates[3] -- Set to running
		task.task()
		task.state = asyncStates[4] -- Set to dead after executing
	end)
	table.insert(self.m_Tasks, task)
end

function Async:OnEngineUpdate(p_Delta)
	local tasksToHandle = #self.m_Tasks
	for _, task in pairs(self.m_Tasks) do
		if(task.state == asyncStates[2]) then -- If suspended, resume task
			print("Running task")
			coroutine.resume(task.coroutine)
		end
		if(task.state == asyncStates[3]) then -- Task is already running I guess
			coroutine.resume(task.coroutine)
			task.time = task.time + p_Delta
		end
		if(task.state == asyncStates[4]) then -- Task is dead
			tasksToHandle = tasksToHandle - 1
		end
	end
	if(#self.m_Tasks > 0 and tasksToHandle == 0) then
		print("All tasks are completed. Clearing buffer")
		self.m_Tasks = {}
	end
end

return Async()

