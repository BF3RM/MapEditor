class GameEntityData {
    constructor(instanceId, indexInBlueprint, typeName, isSpatial, transform, aabb) {
        this.instanceId = instanceId;
        this.indexInBlueprint = indexInBlueprint;
        this.typeName = typeName;
        this.isSpatial = isSpatial;
        this.transform = transform;
        this.aabb = aabb;
    }

    setFromTable(table) {
        this.instanceId = table.instanceId;
        this.indexInBlueprint = table.indexInBlueprint;
        this.typeName = table.typeName;
        this.isSpatial = table.isSpatial;
        if(table.isSpatial) {
            this.transform = new LinearTransform().setFromTable(table.transform);
            this.aabb = new AABB().setFromTable(table.aabb);
        }
        return this;
    }
}