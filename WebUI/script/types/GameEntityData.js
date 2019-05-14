class GameEntityData {
    constructor(instanceId, indexInBlueprint, typeName,  transform, aabb) {
        this.instanceId = instanceId;
        this.indexInBlueprint = indexInBlueprint;
        this.typeName = typeName;
        this.transform = transform;
        this.aabb = aabb;
    }

    setFromTable(table) {
        this.instanceId = table.instanceId;
        this.indexInBlueprint = table.indexInBlueprint;
        this.typeName = table.typeName;
        this.transform = new LinearTransform().setFromTable(table.transform);
        this.aabb = new AABB().setFromTable(table.aabb);

        return this;
    }
}