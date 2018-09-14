class GameObject {
    constructor(guid, name, typeName, transform, object, parent, parameters) {
        this.guid = guid;
        this.name = name;
        this.transform = transform;
	    this.parameters = parameters;
	    this.parent = parent;
    }

    Clone(guid) {
    	if(guid === undefined) {
    		guid = GenerateGuid();
	    }
	    return new GameObject(guid, this.name, this.transform, this.parameters, this.parent);
    }
}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}