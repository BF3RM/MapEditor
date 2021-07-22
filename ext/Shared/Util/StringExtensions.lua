class "StringExtensions"

function string:normalizePath()
	if self == nil then
		return ""
	end

	local s_NormalizedString = self

	s_NormalizedString = string.gsub(s_NormalizedString, "/", "_")
	s_NormalizedString = string.gsub(s_NormalizedString, "-", "_")

	return s_NormalizedString
end

function string:getNormalizedNameFromPath()
	if self == nil then
		return ""
	end

	local s_NormalizedString = self
	s_NormalizedString = string.gsub(s_NormalizedString, "-", "_")
	s_NormalizedString = string.gsub(s_NormalizedString, " ", "_")

	local s_Parts = s_NormalizedString:split("/") -- e.g. Levels/XP3_Shield/XP3_Shield
	return s_Parts[#s_Parts] -- last part
end


function string:split(p_Sep)
	local s_Sep, s_Fields = p_Sep or ":", {}
	local s_Pattern = string.format("([^%s]+)", s_Sep)
	self:gsub(s_Pattern, function(c) s_Fields[#s_Fields+1] = c end)
	return s_Fields
end

function string:startsWith(p_StartOfString)
	return string.sub(self, 1, string.len(p_StartOfString)) == p_StartOfString
end

function string:endsWith(p_EndOfString)
	return p_EndOfString == '' or string.sub(String, -string.len(p_EndOfString)) == p_EndOfString
end

function string:firstToLower(p_String)
	return (p_String:gsub("^%L", string.lower))
end

function string:quote()
	self = self:gsub('"', '\\"')
	self = self:gsub("'", "\\'")
	return self
end

return StringExtensions
