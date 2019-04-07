class 'Commands'

function Commands:__init(p_Realm)
    self.m_Realm = p_Realm
    self:RegisterVars()
end
function Commands:RegisterVars()
    self.m_Commands = {
        SpawnBlueprintCommand = Backend.SpawnBlueprint,
        DestroyBlueprintCommand = Backend.DestroyBlueprint,
        SetTransformCommand = Backend.SetTransform,
        SelectGameObjectCommand = Backend.SelectGameObject,
        CreateGroupCommand = Backend.CreateGroup,
        EnableBlueprintCommand = Backend.EnableBlueprint,
        DisableBlueprintCommand = Backend.DisableBlueprint
    }
end

return Commands

