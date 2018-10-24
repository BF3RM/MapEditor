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
		if(scope.hasVariation()) {
			return this.variations[0];
		} else {
			return 0;
		}
	}

    hasVariation () {
	    return !(this.variations === undefined || Object.keys(this.variations).length == null || Object.keys(this.variations).length === 0);
    }
    isVariationValid(variation) {
        let scope = this;
        return (scope.hasVariation() /* && scope.getVariation(variation) !== undefined */);
		// Always returns 0
    }

    getVariation(hash) {
        let scope = this;
        return scope.variations[hash];
        //tsk tsk tsk
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
	    return new ReferenceObject(scope.typeName, scope.name, scope.partitionGuid, scope.instanceGuid);
    }

}