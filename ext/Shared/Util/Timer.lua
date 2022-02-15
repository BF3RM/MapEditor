---@class Timer
Timer = class "Timer"

local m_Logger = Logger("Timer", false)

local m_CurrentTime = 0
local m_LastDelta = 0
local m_Timers = {}

function Timer:__init()
	m_Logger:Write("Timer init.")
end

function Timer:OnResetData()
	m_CurrentTime = 0
	m_LastDelta = 0
	m_Timers = {}
end

-- this local function has to be above in the code of where its getting called. Don't move it down.
local function xpcall_callback(err)
	return m_Logger:Write(tostring(err))
end

function Timer:GetTimers()
	return m_Timers
end

function Timer:GetTimer(p_TimerName)
	if not p_TimerName then
		m_Logger:Error('Timer:GetTimer() - argument timerName was nil')
		return
	end

	return m_Timers[p_TimerName]
end

function Timer:OnEngineUpdate(p_DeltaTime, p_SimDelta)
	m_LastDelta = m_LastDelta + p_DeltaTime

	if m_LastDelta < 0.01 then -- add check: or round hasnt started yet
		return
	end

	m_CurrentTime = m_CurrentTime + m_LastDelta

	m_LastDelta = 0

	Timer:Check()
end

function Timer:GetTimeLeft(p_TimerName)
	local s_Timer = m_Timers[p_TimerName]
	return s_Timer.lastExec + s_Timer.delay - m_CurrentTime
end

function Timer:GetNewRandomString()
	if m_CurrentTime == 0 then
		m_Logger:Error('CurrentTime was 0, that means the OnEngineUpdate didnt start yet. No way you should be spawning stuff already.')
		return
	end

	local s_Pseudorandom = nil

	while(true) do
		s_Pseudorandom = MathUtils:GetRandomInt(10000000, 99999999)

		if m_Timers[s_Pseudorandom] == nil then
			break
		end
	end

	m_Logger:Write("Timer:GetNewRandomString() - got a new random timer name: " .. tostring(s_Pseudorandom))
	return tostring(s_Pseudorandom)
end

function Timer:Simple(p_Delay, p_Func)
	Timer:CreateInternal(Timer:GetNewRandomString(), p_Delay, 1, p_Func, false)
end

function Timer:Create(p_Name, p_Delay, p_Reps, p_Func)
	Timer:CreateInternal(p_Name, p_Delay, p_Reps, p_Func, false)
end

function Timer:CreateRepetitive(p_Name, p_Delay, p_Func)
	Timer:CreateInternal(p_Name, p_Delay, 0, p_Func, true)
end

function Timer:CreateInternal(p_Name, p_Delay, p_Reps, p_Func, p_IsRepetitive) -- call one of the above not this one
	if p_Name ~= nil and type(p_Name) ~= "string" then
		m_Logger:Error("Invalid timer name: "..tostring(p_Name))
		return
	end

	if type(p_Delay) ~= "number" or p_Delay < 0 then
		m_Logger:Error("Invalid timer delay: "..tostring(p_Delay))
		return
	end

	if type(p_Reps) ~= "number" or p_Reps < 0 or math.floor(p_Reps) ~= p_Reps then
		m_Logger:Error("Invalid timer reps: "..tostring(p_Reps))
		return
	end

	if p_Func ~= nil and type(p_Func) ~= "function" and not (getmetatable(p_Func) and getmetatable(p_Func).__call) then
		m_Logger:Error("Invalid timer function: "..tostring(p_Func))
		return
	end

	p_Name = p_Name or Timer:GetNewRandomString()

	m_Timers[p_Name] = {
		name = p_Name,
		delay = p_Delay,
		reps = p_Reps == 0 and -1 or p_Reps,
		func = p_Func,
		on = false,
		lastExec = 0,
		isRepetitive = false or p_IsRepetitive,
	}

	m_Logger:Write("Timer:CreateInternal() - timer name: " .. p_Name .. ' delay: ' .. p_Delay)
	Timer:Start(p_Name)
end

function Timer:Check()
	local t = m_CurrentTime

	for l_Name, l_Timer in pairs(m_Timers) do
		if l_Timer.lastExec + l_Timer.delay <= t and l_Timer.on then
			if l_Timer.func ~= nil then
				l_Timer.func()
			end

			l_Timer.lastExec = t

			if not l_Timer.isRepetitive then
				l_Timer.reps = l_Timer.reps - 1

				if l_Timer.reps == 0 then
					m_Timers[l_Name] = nil
				end
			end
		end
	end
end

function Timer:Start(name)
	m_Logger:Write('Timer:Start() - Starting timer: ' .. name)
	local t = m_Timers[name]

	if not t then
		m_Logger:Error("Tried to start nonexistant timer: "..tostring(name))
		return
	end

	t.on = true
	t.timeDiff = nil
	t.lastExec = m_CurrentTime
	return true
end

function Timer:Stop(name)
	m_Logger:Write('Timer:Stop() - Stopping timer: ' .. name)
	local t = m_Timers[name]

	if not t then
		m_Logger:Error("Tried to stop nonexistant timer: "..tostring(name))
		return
	end

	t.on = false
	t.timeDiff = nil
	--timers[name] = nil
	return true
end

function Timer:Pause(name)
	m_Logger:Write('Timer:Pause() - Pausing timer: ' .. name)
	local t = m_Timers[name]

	if not t then
		m_Logger:Error("Tried to pause nonexistant timer: "..tostring(name))
		return
	end

	t.on = false
	t.timeDiff = m_CurrentTime - t.lastExec
	return true
end

function Timer:UnPause(name)
	m_Logger:Write('Timer:UnPause() - Unpausing timer: ' .. name)
	local t = m_Timers[name]

	if not t or not t.timeDiff then
		m_Logger:Error("Tried to unpause nonexistant timer: "..tostring(name))
		return
	end

	if not t.timeDiff then
		m_Logger:Error("Tried to unpause nonpaused timer: "..tostring(name))
		return
	end

	t.on = true
	t.lastExec = m_CurrentTime - t.timeDiff
	t.timeDiff = nil
	return true
end

function Timer:Adjust(name, delay, reps, func, isRepetitive)
	m_Logger:Write('Timer:Adjust() - Adjusting timer: ' .. name)
	local t = m_Timers[name]

	-- if not t or not t.timeDiff then
	if not t then
		m_Logger:Error("Tried to adjust nonexistant timer: "..tostring(name))
		return
	end

	if type(delay) ~= "number" or delay < 0 then
		m_Logger:Error("Invalid timer delay: "..tostring(delay))
		return
	end

	if type(reps) ~= "number" or reps < 0 or math.floor(reps) ~= reps then
		m_Logger:Error("Invalid timer reps: "..tostring(reps))
		return
	end

	t.delay = delay
	-- t.reps = reps
	t.reps = reps + 1 -- for some reason this has to be + 1 to work as you'd expect it to
	t.isRepetitive = isRepetitive

	if func ~= nil and type(func) ~= "function" and not (getmetatable(func) and getmetatable(func).__call) then
		m_Logger:Error("Invalid timer function: "..tostring(func))
		return
	end

	t.func = func
	return true
end

function Timer:Delete(name)
	if name == nil or type(name) ~= "string" then
		return
	end

	m_Logger:Write('Timer:Delete() - Delete timer: ' .. name)

	if m_Timers[name] ~= nil then
		m_Timers[name] = nil
	end
end
-- Timer.Remove = Timer.Delete -- whats this for?

-- Singleton.
if g_Timer == nil then
	g_Timer = Timer()
end

return g_Timer
