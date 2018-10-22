class "Util"
    function Util:isSpatial(ti)
        if(ti == nil) then
            print("TypeInfo is nil. This shouldn't happen.")
            return false
        end
        if(ti.name == "SpatialEntity") then
            return true
        elseif(ti.super == nil) then
            return false
        else
            return self:isSpatial(ti.super)
        end
    end

return Util