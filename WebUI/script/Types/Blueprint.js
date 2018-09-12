class Blueprint {
    constructor(partitionGuid, instanceGuid, typeName, name, variations) {
        this.partitionGuid = partitionGuid;
        this.instanceGuid = instanceGuid;
        this.typeName = typeName;
        this.name = name;
        this.variations = variations;
        this.verified = this.isVariationValid();
    }

    isVariationValid () {
	    return !(this.variations === undefined || this.variations.length == null || this.variations.length === 0);
    }

    fromObject(object) {
        if(object.partitionGuid === null || object.instanceGuid === null || object.name === null ) {
            Editor.error("Failed to register blueprint from object: " + object);
        } else {
            this.partitionGuid = object.partitionGuid;
            this.instanceGuid = object.instanceGuid;
            this.typeName = object.typeName;
            this.name = object.name;
            this.variations = object.variations;
            return this;
        }
    }
}