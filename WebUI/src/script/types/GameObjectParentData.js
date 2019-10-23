
export class GameObjectParentData
{
    constructor(guid, typeName, primaryInstanceGuid, partitionGuid)
    {
        this.guid = guid;
        this.typeName = typeName;
        this.primaryInstanceGuid = primaryInstanceGuid;
        this.partitionGuid = partitionGuid;
    }

    setFromTable(table) {
        this.guid = table.guid;
        this.typeName = table.typeName;
        this.primaryInstanceGuid = table.primaryInstanceGuid;
        this.partitionGuid = table.partitionGuid;

        return this;
    }
}