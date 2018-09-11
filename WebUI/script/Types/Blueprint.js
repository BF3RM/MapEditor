class Blueprint {
    constructor(partitionGuid, instanceGuid, name, variations) {
        this.partitionGuid = partitionGuid;
        this.instanceGuid = instanceGuid;
        this.type = type;
        this.name = name;
        this.variations = variations;
        this.verified = false;
    }

    isVariationValid () {
	    if (!this.verified  && (this.variations.length == null || this.variations.length === 0)) {
	    	this.verified = false;
		    return false;
	    } else {
	    	return true;
	    }
    }

    fromObject(object) {
        if(object.partitionGuid === null || object.instanceGuid === null || object.name === null ) {
            Editor.error("Failed to register blueprint from object: " + object);
        } else {
            this.partitionGuid = object.partitionGuid;
            this.instanceGuid = object.instanceGuid;
            this.type = object.type;
            this.name = object.name;
            this.variations = object.variations;
            return this;
        }
    }
}