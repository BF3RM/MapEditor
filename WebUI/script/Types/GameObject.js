class GameObject {
    constructor(guid, name, transform, parent, children) {
        this.guid = guid;
        this.name = name;
        this.transform = transform;
	    this.parent = parent;
	    this.children = children;
    }

    Clone(guid) {
    	if(guid === undefined) {
    		guid = GenerateGuid();
	    }
	    return new GameObject(guid, this.name, this.transform, this.parent, this.children);
    }
}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}