class Blueprint {
    constructor(partitionGuid, instanceGuid, typeName, name, variations) {
        this.partitionGuid = partitionGuid;
        this.instanceGuid = instanceGuid;
        this.typeName = typeName;
        this.name = name;
        this.variations = variations;
    }

	getDefaultVariation() {
		let scope = this;
		if(scope.isVariationValid()) {
			return this.variations[0];
		} else {
			return 0;
		}
	}

    hasVariation () {
	    return !(this.variations === undefined || this.variations.length == null || this.variations.length === 0);
    }
    isVariationValid(variation) {
        let scope = this;
        return (scope.hasVariation() && scope.getVariation(variation) !== undefined);

    }

    getVariation(hash) {
        let scope = this;
        return scope.variations[hash];
    }

    fromObject(object) {
        if(object.partitionGuid === null || object.instanceGuid === null || object.name === null ) {
            editor.error("Failed to register blueprint from object: " + object);
        } else {
            this.partitionGuid = object.partitionGuid;
            this.instanceGuid = object.instanceGuid;
            this.typeName = object.typeName;
            this.name = object.name;
            this.variations = object.variations;
            return this;
        }
    }

    getReference() {
        let scope = this;
	    return {
	        "partitionGuid": scope.partitionGuid,
	        "instanceGuid": scope.instanceGuid,
	        "name": scope.name
        };
    }

}