
class GameObjectParentData
{
    constructor(guid, typeName, primaryInstanceGuid, partitionGuid, resolveType)
    {
        this.guid = guid;
        this.typeName = typeName;
        this.primaryInstanceGuid = primaryInstanceGuid;
        this.partitionGuid = partitionGuid;
        this.resolveType = resolveType;
    }

    setFromTable(table) {
        this.guid = table.guid;
        this.typeName = table.typeName;
        this.primaryInstanceGuid = table.primaryInstanceGuid;
        this.partitionGuid = table.partitionGuid;
        this.resolveType = table.resolveType;
    }
}