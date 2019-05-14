class CtrRef {
    constructor(typeName, name,  partitionGuid, instanceGuid) {
        this.typeName = typeName;
        this.name = name;
        this.partitionGuid = partitionGuid;
        this.instanceGuid = instanceGuid;
    }

    setFromTable(table) {
        this.typeName = table.typeName;
        this.name = table.name;
        this.partitionGuid = table.partitionGuid;
        this.instanceGuid = table.instanceGuid;
    }

    clone() {
        return new CtrRef(this.typeName, this.name, this.partitionGuid, this.instanceGuid);
    }
}