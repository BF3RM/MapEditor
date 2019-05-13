
class GameObject extends THREE.Object3D
{
	constructor(guid, name, transform, parent, children, userData, isVanilla)
	{
		super( );

		this.guid = guid;
		this.type = userData.reference.typeName;
		this.name = name; // name is unused / obsolete
		this.transform = transform;
		this.parentGuid = parent;
		this.userData = userData;
		this.isVanilla = isVanilla;
		this.selected = false;
		this.matrixAutoUpdate = false;
		this.visible = true;
		this.enabled = true;
		this.highlighted = false;

		if (children !== null){
			for (var i = children.length - 1; i >= 0; i--) {
				this.add(children[i]);
			}
		}

		// Update the matrix after initialization.
		this.updateTransform();
		this.updateMatrix();
	}

	getCleanName() {
		return this.userData.name.replace(/^.*[\\\/]/, '');
	}
	
	hasMoved() {
		return !this.transform.toMatrix().equals(this.matrixWorld.elements);
	}



	renderInit()
	{
		this.updateTransform();
	}
	
	getChanges() {
		let scope = this;
		let changes = {};
		// Add more realtime-updates here.
		if(scope.hasMoved()) {
			changes["transform"] = new MoveObjectMessage(scope.guid,  new LinearTransform().setFromMatrix(scope.matrixWorld));
		}

		if(Object.keys(changes).length === 0) {
			return false;
		}
		return changes

	}

	updateTransform()
	{

		let matrix = new THREE.Matrix4();
		matrix.set(
			this.transform.left.x, this.transform.up.x, this.transform.forward.x, this.transform.trans.x,
			this.transform.left.y, this.transform.up.y, this.transform.forward.y, this.transform.trans.y,
			this.transform.left.z, this.transform.up.z, this.transform.forward.z, this.transform.trans.z,
			0, 0, 0, 1);

		// As the position is local, we have to detach the object from its parent first
		let parent = this.parent;

		// remove child from parent and add it to scene
		if (parent !== null){
			THREE.SceneUtils.detach( this, parent, editor.threeManager.scene );
		}

		matrix.decompose( this.position, this.quaternion, this.scale );
		this.updateMatrix();
		// remove child from scene and add it to parent
		if (parent !== null){
			THREE.SceneUtils.attach( this, editor.threeManager.scene, parent );
		}
	}

	updateWorldTransform(updateChild = false)
	{

		this.transform = new LinearTransform().setFromMatrix(this.matrixWorld);


		if(updateChild){
			for(let key in this.children) {
				let child = this.children[key];
				if(child instanceof GameObject) {
					console.log("Updating child")
					child.updateWorldTransform(true);
				}
			};
		}
	}

	update( deltaTime )
	{
		//this.updateTransform( );
	}

	setTransform(linearTransform) {
		this.transform = linearTransform;
		this.userData.transform = linearTransform;
		this.updateTransform();

		for(let key in this.children) {
			let child = this.children[key];
			if(typeof(child) == "GameObject") {
				child.updateWorldTransform();
			}
		}

		editor.threeManager.Render();
		signals.objectChanged.dispatch(this, "transform", linearTransform);

	}
	setName(name) {
		this.name = name;
		this.userData.name = name;
		signals.objectChanged.dispatch(this, "name", name);
	}

	setVariation(key) {
		this.userData.variation = key;
		signals.objectChanged.dispatch(this, "variation", key);
	}

	Clone(guid) {
		if(guid === undefined) {
			guid = GenerateGuid();
		}

		return new GameObject(guid, this.name, this.transform, this.objectParent, this.children, this.userData);
	}

	onMoveStart() {
	}

	onMove() {
		let scope = this;
		if(!scope.hasMoved()) {
			return;
		}
		let transform = new LinearTransform().setFromMatrix(scope.matrixWorld);
		signals.objectChanged.dispatch(this, "transform", transform);
		// Send move message to client
	}
	onMoveEnd() {
		let scope = this;
		if(!scope.hasMoved()) {
			return; // No position change
		}
		let transform = new LinearTransform().setFromMatrix(scope.matrixWorld);
		let command = new SetTransformCommand(this.guid, transform, scope.transform);
		editor.execute(command);
		signals.objectChanged.dispatch(this, "transform", transform);

		// Send move command to server
	}

	Select() {
		this.onSelected();
	}
	Deselect() {
		this.onDeselected();
	}

	Highlight(){
		this.highlighted = true;

		for (var i = 0; i < this.children.length; i++) {
			this.children[i].Highlight();
		}
	}

	Unhighlight(){
		this.highlighted = false;

		for (var i = 0; i < this.children.length; i++) {
			this.children[i].Unhighlight();
		}
	}

	onSelected() {
		if(!this.enabled) {
			LogError("Attempted to select a disabled gameObject");
			return
		}
		for(let key in this.children) {
			let child = this.children[key];
			if(child.constructor.name === "GameObject") {
				child.Select();
			}
		};
		this.selected = true;
	}
	onDeselected() {
		if(!this.enabled) {
			LogError("Attempted to deselect a disabled gameObject");
			return
		}
		for(let key in this.children) {
			let child = this.children[key];
			if(child.constructor.name === "GameObject") {
				child.Deselect();
			}
		};
		this.selected = false;
	}
	Enable() {
		for(let key in this.children) {
			let child = this.children[key];
			if(child.constructor.name === "GameObject") {
				child.Enable();
			} else {
				child.visible = true;
			}
		};
		this.visible = true;
		this.enabled = true;
		signals.objectChanged.dispatch(this, "enabled", this.enabled);
	}

	Disable() {
		for(let key in this.children) {
			let child = this.children[key];
			if(child.constructor.name === "GameObject") {
				child.Disable();
			} else {
				child.visible = false;
			}
		};
		this.visible = false;
		this.enabled = false;
		signals.objectChanged.dispatch(this, "enabled", this.enabled);
	}

	getUserData() {
		return this.userData;
	}

	getNode() {
		return {
			id: this.guid,
			name: this.getCleanName(),
			type: this.type,
			parentGuid: this.parentGuid,
			draggable: true,
			droppable: true,
			children: [],
			state: {
				filtered: this.enabled
			}
		}
	}

}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}