class GameObject {
    constructor(guid, name, type, transform, object, parent, entityCreationParams) {
        this.guid = guid;
        this.name = name;
        this.type = type;
        this.transform = transform;
        this.object = object;
	    this.parent = parent;
	    this.entityCreationParams = entityCreationParams;
    }
}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}