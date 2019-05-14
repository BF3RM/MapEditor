class GameEntityData {
    constructor(indexInBlueprint, instanceId, typeName,  transform, aabb) {
        this.indexInBlueprint = indexInBlueprint;
        this.instanceId = instanceId;
        this.typeName = typeName;
        this.transform = transform;
        this.aabb = aabb;
    }

    setFromTable(table) {
        this.indexInBlueprint = table.indexInBlueprint;
        this.instanceId = table.instanceId;
        this.typeName = table.typeName;
        this.transform = new LinearTransform().setFromTable(table.transform);
        this.aabb = new AABB().setFromTable(table.aabb);
    }
}