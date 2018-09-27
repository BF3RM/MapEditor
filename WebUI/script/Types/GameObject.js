class GameObject {
    constructor(guid, name, transform, parent, children, parameters) {
        this.guid = guid;
        this.name = name;
        this.transform = transform;
	    this.parent = parent;
		this.children = children;
		this.parameters = parameters;
    }

    Clone(guid) {
    	if(guid === undefined) {
    		guid = GenerateGuid();
	    }
	    return new GameObject(guid, this.name, this.transform, this.parent, this.children, this.parameters);
    }
}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}