---@class EditorCommon
EditorCommon = class 'EditorCommon'

local m_Logger = Logger("EditorCommon", false)

function EditorCommon:__init()
	m_Logger:Write("Initializing EditorCommon")
end

function EditorCommon:OnLevelLoadResources(p_ProjectHeader)
	if p_ProjectHeader == nil then
		return
	end

	if p_ProjectHeader.requiredSuperBundles == nil then
		return
	end

	local s_SortedSuperBundles = {}

	for l_SuperBundle, l_IsRequired in pairs(p_ProjectHeader.requiredSuperBundles) do
		if l_IsRequired then
			if l_SuperBundle:match("chunks") then
				table.insert(s_SortedSuperBundles, 1, l_SuperBundle)
			else
				table.insert(s_SortedSuperBundles, l_SuperBundle)
			end
		end
	end

	for _, l_SuperBundle in pairs(s_SortedSuperBundles) do
		print("MountSuperBundle: " .. l_SuperBundle)
		ResourceManager:MountSuperBundle(l_SuperBundle)
	end
end

function EditorCommon:OnTerrainLoad(p_HookCtx, p_AssetName, p_ProjectHeader)
	if p_ProjectHeader == nil then
		return
	end

	if p_ProjectHeader.terrainLevelName == nil then
		return
	end

	if not p_AssetName:match(p_ProjectHeader.terrainLevelName) then
		p_HookCtx:Return()
	end
end

function EditorCommon:OnLoadBundles(p_Hook, p_Bundles, p_Compartment, p_ProjectHeader)
	local s_Bundles = {}

	if p_ProjectHeader == nil then
		return s_Bundles
	end

	if p_ProjectHeader.requiredBundles == nil then
		return s_Bundles
	end

	if not self:IsLevelBundle(p_Bundles) then
		return s_Bundles
	end


	for _, p_Bundle in pairs(p_Bundles) do
		table.insert(s_Bundles, p_Bundle)
	end

	for l_Bundle, l_IsRequired in pairs(p_ProjectHeader.requiredBundles) do
		if l_IsRequired then
			if not self:IsBundleInList(s_Bundles, l_Bundle) then
				print("Add to bundle: " .. l_Bundle)
				table.insert(s_Bundles, 1, l_Bundle)
			end
		end
	end

	print("Pass bundles")
	return s_Bundles
end

function EditorCommon:IsLevelBundle(p_Bundles)
	for _, l_Bundle in pairs(p_Bundles) do
		if l_Bundle == SharedUtils:GetLevelName() then
			return true
		end
	end

	return false
end

function EditorCommon:IsBundleInList(p_Bundles, p_BundleToCheck)
	for _, l_Bundle in pairs(p_Bundles) do
		if l_Bundle == p_BundleToCheck then
			return true
		end
	end

	return false
end


return EditorCommon
