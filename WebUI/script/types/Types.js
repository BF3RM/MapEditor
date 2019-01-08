class Camera {
	constructor(transform, fov) {
		this.transform = transform;
		this.fov = fov;
	}

	SetFov(fov) {
		this.fov = fov
		//Update the three stuff
	}

	SetTransform(transform) {
		this.transform = transform
		//Update the three stuff
	}
}

class VextEvents {
	constructor() {
		this.sortedEvents = [];
		this.events = [];
	}

	AddEvent(index, id, key, value) {
		var message =  new VextMessage(index, id, key, value);
		if(this.events[id] == null) {
			this.events[id] = [];
		}
		this.events[id][key] = message;
	}

	Sort() {
		for( let id in this.events) {
			for( let type in this.events[id]) {
				let message = this.events[id][type];
				this.sortedEvents[message.index] = this.events[id][type];
			}
		}
	}

}
class VextCommand {
	constructor(guid, type, userData) {
		this.guid = guid;
		this.type = type;
		this.userData = userData;
	}
}
class VextMessage {
	constructor(index, id, key, value) {
		this.index = index;
		this.id = id;
		this.key = key;
		this.value = value;
	}
}

var LOGLEVEL = {
	NONE: 0,
	DEBUG: 1,
	VERBOSE: 2
};


class ReferenceObject {
	constructor(typeName, name,  partitionGuid, instanceGuid) {
		this.typeName = typeName;
		this.name = name;
		this.partitionGuid = partitionGuid;
		this.instanceGuid = instanceGuid;
	}
}

class ReferenceObjectParameters {
	constructor(reference, guid, variation, name, transform) {
		this.reference = reference;
		this.guid = guid;
		this.variation = variation;
		this.name = name;
		this.transform = transform;
	}
}