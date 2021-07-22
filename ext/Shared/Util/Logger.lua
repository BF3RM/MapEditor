class "Logger"


function Logger:__init(p_ClassName, p_ActivateLogging)
	if type(p_ClassName) ~= "string" then
		error("Logger: Wrong arguments creating object, className is not a string. ClassName: "..tostring(p_ClassName))
		return
	elseif type(p_ActivateLogging) ~= "boolean" then
		error("Logger: Wrong arguments creating object, ActivateLogging is not a boolean. ActivateLogging: " ..tostring(p_ActivateLogging))
		return
	end

	-- print("Creating object with: "..p_ClassName..", "..tostring(p_ActivateLogging))
	self.debug = p_ActivateLogging
	self.className = p_ClassName
end

function Logger:Write(p_Message)
	if not ME_CONFIG.LOGGER_ENABLED then
		return
	end

	if ME_CONFIG.LOGGER_PRINT_ALL == true and self.className ~= nil then
		goto continue
	elseif self.debug == false or
		 self.debug == nil or
		 self.className == nil then
		return
	end

	::continue::

	if type(p_Message) == 'table' then
		print("["..self.className.."]")
		print(p_Message)
	else
		print("["..self.className.."] " .. tostring(p_Message))
	end
end

function Logger:WriteTable(p_Table)
	for l_Key, l_Value in pairs(p_Table) do
		self:Write(tostring(l_Key) .. " - " .. tostring(l_Value))
	end
end

function Logger:Warning(p_Message)
	if self.className == nil then
		return
	end

	print("["..self.className.."] WARNING: " .. tostring(p_Message))
end

function Logger:Error(p_Message)
	if self.className == nil then
		return
	end

	print("["..self.className.."] ERROR: " .. tostring(p_Message))
end

return Logger
