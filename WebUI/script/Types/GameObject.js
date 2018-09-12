class GameObject {
    constructor(guid, name, typeName, transform, object, parent, entityCreationParams) {
        this.guid = guid;
        this.name = name;
        this.typeName = typeName;
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