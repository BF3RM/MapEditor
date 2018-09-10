class Blueprint {
    constructor(partitionGuid, instanceGuid, name, variations) {
        this.partitionGuid = partitionGuid;
        this.instanceGuid = instanceGuid;
        this.name = name;
        this.variations = variations;
        this.verified = false;
    }

    isValid () {
	    if (!this.verified  && (this.variations.length == null || this.variations.length === 0)) {
	    	this.verified = false;
		    return false;
	    } else {
	    	this.verified = true;
	    	return true;
	    }
    }
}