-- Update a level BF3 ships, in place, from a mod.
--
-- Build the superbundle with TWO bundles (Rime):
--
--     build_sb Win32/UsdPatch/Patch Frostbite2_0 "<mod>/sb"
--     build_bundle Win32/UsdPatch/PatchPart
--     add_json_partition <the game's partition name> "<edited>.json"
--     build
--     build_bundle Win32/UsdPatch/PatchRes
--     replace_resource <the game's resource name> 1 "<edited>.bin"
--     build
--     build
--
-- `build_sb` NESTS: the last `build` closes the SUPERBUNDLE and without it the builder reports
-- success and writes no file at all. `replace_resource` keeps the original type, meta and id, so an
-- override never has to guess a meta.
--
-- Two bundles because the engine resolves the two namespaces from opposite ends of the list, which
-- was measured four ways (docs/usd-parity.md):
--
--     an EBX PARTITION comes from the FIRST bundle in the list that holds the name
--     a RESOURCE       comes from the LAST
--
-- One bundle can therefore only ever override one of them, and the other half fails silently.
-- Neither bundle is requested twice, which is the arrangement that wedges the load.
local TAG = '[UsdPatch] '
local SUPERBUNDLE = 'usdpatch/patch'
local PART_BUNDLE = 'usdpatch/patchpart'
local RES_BUNDLE = 'usdpatch/patchres'

local m_Mounted = false

Events:Subscribe('Level:LoadResources', function()
	local s_Ok, s_Err = pcall(function() ResourceManager:MountSuperBundle(SUPERBUNDLE) end)
	m_Mounted = s_Ok
	-- MountSuperBundle returns ok for names that do not exist, so this line is a trace and never
	-- a verification. What proves the bundle arrived is reading an edited value back.
	print(TAG .. 'MountSuperBundle ' .. SUPERBUNDLE .. ' ok=' .. tostring(s_Ok) .. ' ' .. tostring(s_Err))
end)

Hooks:Install('ResourceManager:LoadBundles', 100, function(p_Hook, p_Bundles, p_Compartment)
	if not m_Mounted then return end

	local s_Level = tostring(SharedUtils:GetLevelName()):lower()
	local s_HasLevel, s_HasOurs = false, false

	for _, l_B in ipairs(p_Bundles) do
		if tostring(l_B):lower() == s_Level then s_HasLevel = true end
		if tostring(l_B):lower() == PART_BUNDLE then s_HasOurs = true end
	end

	-- Only the level's OWN list. This event also fires for the game-mode bundle, and adding our
	-- bundles there would request them twice.
	if not s_HasLevel or s_HasOurs then return end

	local s_New = { PART_BUNDLE }
	for _, l_B in ipairs(p_Bundles) do s_New[#s_New + 1] = l_B end
	s_New[#s_New + 1] = RES_BUNDLE

	print(TAG .. 'prepending ' .. PART_BUNDLE .. ', appending ' .. RES_BUNDLE
		.. ' around ' .. tostring(#p_Bundles) .. ' bundle(s)')
	p_Hook:Pass(s_New, p_Compartment)
end)
