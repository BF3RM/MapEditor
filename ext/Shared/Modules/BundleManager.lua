---@class BundleManager
BundleManager = class 'BundleManager'

local m_Logger = Logger("BundleManager", true)

function BundleManager:__init(p_Realm)
	m_Logger:Write("Initializing BundleManager: " .. tostring(p_Realm))
	self.m_Realm = p_Realm
	self.m_LoadedCompartments = {}

	Events:Subscribe('ResourceManager:ClearCompartment', function(p_Compartment)
		m_Logger:Write('Unloading compartment ' .. p_Compartment)
		self.m_LoadedCompartments[p_Compartment] = {}
	end)
end

function BundleManager:GetLoadedBundles()
	local s_LoadedBundles = {}

	for _, l_BundlesInCompartment in pairs(self.m_LoadedCompartments) do
		for l_BundleName, _ in pairs(l_BundlesInCompartment) do
			s_LoadedBundles[l_BundleName] = true
		end
	end

	return s_LoadedBundles
end

function BundleManager:OnLoadBundles(p_Hook, p_Bundles, p_Compartment)
	m_Logger:Write('Loading compartment ' .. p_Compartment)
	for _, l_Bundle in pairs(p_Bundles) do
		m_Logger:Write('Loading bundle ' .. l_Bundle)
		if not self.m_LoadedCompartments[p_Compartment] then
			self.m_LoadedCompartments[p_Compartment] = {}
		end

		self.m_LoadedCompartments[p_Compartment][l_Bundle] = true
	end
end

if SharedUtils:IsClientModule() then
	BundleManager = BundleManager(Realm.Realm_Client)
else
	BundleManager = BundleManager(Realm.Realm_Server)
end

return BundleManager
