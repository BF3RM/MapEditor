class GameObject {
	constructor(id, name, type, transform, webObject, instance, variation, parent) {
		this.id = id;
		this.name = name;
		this.type = type;
		this.transform = transform;
		this.webObject = webObject;
		this.instance = instance;
		this.parent = parent;
		this.variation = variation;

		if (this.parent == null) {
			editor.rootEntities[this.id] = this;
		}
		else{
			parent.children[this.id] = this;
		}
	}

	Move(x, y, z){
		this.webObject.position.x = x;
		this.webObject.position.y = y;
		this.webObject.position.z = z;
		editor.webGL.Render();

		this.OnMove(true);
	}

	OnMove(noUpdateInspector) {
		let matrix = this.webObject.matrixWorld.toArray().toString();
		let args = this.id + "," + matrix;

		let linearTransform = new LinearTransform().setFromMatrix(this.webObject.matrixWorld);

		this.transform = linearTransform;

		if(!noUpdateInspector) {
			editor.ui.inspector.UpdateInspector(this);
		}

		// Move children if there is any
		if (this.children != null) {

			for (var key in this.children) {
				this.children[key].OnMove(true);
			}

		}
		else{
			vext.SendEvent('DispatchEventLocal', 'MapEditor:SetEntityMatrix', args);
		}
	}

	OnSelected() {
		console.log("Selected")
	}

	OnDeleted() {
		console.log("Deleted")
	}

	Delete() {
		// Deselect this entity 
		editor.DeselectEntity(this);

		// Delete its children
		if (this.children != null) {

			for (var key in this.children) {
				this.children[key].Delete();
			}
		}

		else{
			// Delete the entity on VU
			editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DeleteEntity', this.id)
		}

		// Remove the parent's reference
		if (this.parent != null) {
			delete this.parent.children[this.id];
		}

		// Delete webGL objects associated with the entity
		editor.webGL.DeleteObject(this.webObject);

		// Remove the entity on reference arrays
		delete editor.spawnedEntities[this.id];
		if (editor.rootEntities[this.id] != null) {
			delete editor.rootEntities[this.id];
		}

		// Delete the entity on the hierarchy 
		editor.ui.hierarchy.OnDeleteEntry(this);


	}

}

class Group extends GameObject{
	constructor(id, name, webObject, transform, parent, children) {

		//id, name, type, transform, webObject, instance, variation, parent
		super(id, name, "group", transform, webObject, null, null, parent);
		this.children = children;
	}

	OnAddChild(child){
		// This moves the object too for some reason
		if (this.children.length == null && this.transform.trans.x == 0) {
			// Doesn't have children, set the group transform to the children's
			// this.webObject.position.set(child.webObject.position.x, child.webObject.position.y, child.webObject.position.z);
			this.Move(child.webObject.position.x, child.webObject.position.y, child.webObject.position.z)
			// this.webObject.position.x = child.webObject.position.x;
			// this.webObject.position.y = child.webObject.position.y;
			// this.webObject.position.z = child.webObject.position.z;
			this.transform = child.transform;
			// editor.webGL.Render();

		}
		
		// Update parent
		child.parent = this;
		delete editor.rootEntities[child.id];

		this.children[child.id] = child;

		editor.webGL.AddToGroup(this.webObject, child.webObject);

	}

	OnRemoveChild(child){
		// Update parent
		child.parent = null;
		editor.rootEntities[child.id] = child;

		delete this.children[child.id];
		editor.webGL.RemoveFromGroup(child.webObject);
		// this.children.remove(child.id);
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
		if(!arguments.length) {
			left = new Vec3(1, 0, 0);
			up = new Vec3(0, 1, 0);
			forward = new Vec3(0, 0, 1);
			trans = new Vec3(0, 0, 0);
		}
		this.left = left;
		this.up = up;
		this.forward = forward;
		this.trans = trans;
		return this;
	}

	getMatrix() {
		return [this.left.x, this.left.y, this.left.z, this.up.x, this.up.y, this.up.z, this.forward.x, this.forward.y, this.forward.z, this.trans.x, this.trans.y, this.trans.z];
	}

	setFromString(matrixString) {
		let matrix = matrixString.split(",");
		this.left = new Vec3(
			Number(matrix[0]),
			Number(matrix[1]),
			Number(matrix[2]));
		
		this.up = new Vec3(
			Number(matrix[3]),
			Number(matrix[4]),
			Number(matrix[5]));

		this.forward = new Vec3(
			Number(matrix[6]),
			Number(matrix[7]),
			Number(matrix[8]));

		this.trans = new Vec3(
			Number(matrix[9]),
			Number(matrix[10]),
			Number(matrix[11]));
		return this;
	}
	setFromMatrix(matrix) {
		let matrixArray = matrix.toArray();

		this.left = new Vec3(
			matrixArray[0],
			matrixArray[1],
			matrixArray[2]);
		
		this.up = new Vec3(
			matrixArray[4],
			matrixArray[5],
			matrixArray[6]);

		this.forward = new Vec3(
			matrixArray[8],
			matrixArray[9],
			matrixArray[10]);

		this.trans = new Vec3(
			matrixArray[12],
			matrixArray[13],
			matrixArray[14]);
		return this;
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