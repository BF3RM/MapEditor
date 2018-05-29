class GameObject {
	constructor(id, type, transform, instance) {
		this.id = id;
		this.type = type;
		this.transform = transform;
		this.instance = instance;
	}
}

class Vec3 {
	constructor(x,y,z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}

class Blueprint {
	constructor(partitionGuid, instanceGuid, name, variations) {
		this.partitionGuid = partitionGuid;
		this.instanceGuid = instanceGuid;
		this.name = name;
		this.variations = variations;
	}
}

class LinearTransform {
	constructor(left, up, forward, trans) {
		this.left = left;
		this.up = up;
		this.forward = forward;
		this.trans = trans;
	}

	getMatrix() {
		return [this.left.x, this.left.y, this.left.z, this.up.x, this.up.y, this.up.z, this.forward.x, this.forward.y, this.forward.z, this.trans.x, this.trans.y, this.trans.z];
	}

	setMatrix(matrixString) {
		//TODO split!
		this.left.x = matrix[0];
		this.left.y = matrix[1];
		this.left.z = matrix[2];
		
		this.up.x = matrix[3];
		this.up.y = matrix[4];
		this.up.z = matrix[5];
		
		this.forward.x = matrix[6];
		this.forward.y = matrix[7];
		this.forward.z = matrix[8];

		this.trans.x = matrix[9];
		this.trans.y = matrix[10];
		this.trans.z = matrix[11];
	}
}


class Variation {
	constructor(name, nameHash) {
		this.name = name;
		this.nameHash = nameHash;
	}
}


class Camera {
	constructor(transform, fov) {
		self.transform = transform;
		self.fov = fov;
	}

	SetFov(fov) {
		self.fov = fov
		//Update the three stuff
	}

	SetTransform(transform) {
		this.transform = transform
		//Update the three stuff
	}
}