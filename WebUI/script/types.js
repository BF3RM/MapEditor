class GameObject {
	constructor(id, name, type, transform, webObject, instance, variation, parent) {
		this.id = id;
		this.name = name;
		this.type = type;
		this.transform = transform;
		this.initialTransform = transform;
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
		editor.webGL.MoveObject(this.webObject, x, y, z);
		this.OnMove(false);
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
			editor.vext.SendEvent(this.id, 'MapEditor:SetEntityMatrix', args);
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
			editor.vext.SendEvent(this.id, 'MapEditor:DeleteEntity', this.id)
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

	Clone(newParent){

		if( newParent == null){
			newParent = this.parent;
		}

		if( this.type == "group" ){
			let clone = editor.CreateGroup(GenerateGuid(), this.name, this.transform, newParent);

			if (this.children != null) {

				for (var key in this.children) {
					this.children[key].Clone(clone);
				}
			}

			// Move it inside the parent
			if(newParent != null){
				editor.ui.hierarchy.MoveElementsInHierarchy(newParent, clone);
			}
		}
		else if( this.type == "Blueprint"){

			let parentId = "";
			if(newParent != null){
				parentId = newParent.id;
			}
			let args = GenerateGuid() + ":" + this.instance.partitionGuid+ ":" + this.instance.instanceGuid+ ":" + this.variation + ":" + this.transform.getMatrix().toString()+ ":" + parentId;
			console.log(args);
			editor.vext.SendEvent(this.id, 'MapEditor:SpawnInstance', args);
		}
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
			this.Move(child.webObject.position.x, child.webObject.position.y, child.webObject.position.z)
			this.transform = child.transform;

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

	Clone() {
		return new Group(this.id, this.name, this.type, this.transform, this.parent, this.children)
	}
}
class Vec3 {
	constructor(x,y,z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	Clone() {
		return new Vec3(this.x, this.y, this.z)
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
	Clone() {
		return new LinearTransform(this.left, this.up, this.forward, this.trans)
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

class VextMessage {
	constructor(index, id, key, value) {
		this.index = index;
		this.id = id;
		this.key = key;
		this.value = value;
	}
}