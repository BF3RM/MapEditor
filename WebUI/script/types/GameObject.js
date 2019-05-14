
class GameObject extends THREE.Object3D
{
	constructor(guid, typeName, name, transform, parentData, blueprint, variation)
	{
		super( );

		this.guid = guid;
		this.typeName = typeName;
		this.name = name;
		this.transform = transform;
		this.parentData = parentData;
		this.blueprint = blueprint;
		this.variation = variation;

		this.selected = false;
		this.matrixAutoUpdate = false;
		this.visible = true;
		this.enabled = true;
		this.highlighted = false;

		// Update the matrix after initialization.
		this.updateTransform();
		this.updateMatrix();
	}

	getCleanName() {
		return this.name.replace(/^.*[\\\/]/, '');
	}
	
	hasMoved() {
		return !this.transform.toMatrix().equals(this.matrixWorld.elements);
	}

	getGameObjectTransferData(key = null){
		if(key != null) {
			let gameObjectTransferData = new GameObjectTransferData({
				"guid": this.guid
			});
			gameObjectTransferData[key] = this[key];
			return gameObjectTransferData;
		}
		return new GameObjectTransferData({
			guid: this.guid,
			name: this.name,
			blueprintCtrRef: this.blueprint.getCtrRef(),
			parentData: this.parentData,
			transform: this.transform,
			variation: this.variation
		});
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
		signals.objectChanged.dispatch(this, "name", name);
	}

	setVariation(key) {
		this.variation = key;
		signals.objectChanged.dispatch(this, "variation", key);
	}

	Clone(guid) {
		if(guid === undefined) {
			guid = GenerateGuid();
		}

		// TODO: Create a new GameObject with a new GUID
		// return new GameObject(guid, this.name, this.transform, this.objectParent, this.children, this.gameObjectTransferData);
	}

	onMoveStart() {
		console.log("move start")
		// TODO: Validate that the object exists
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
		let command = new SetTransformCommand(new GameObjectTransferData({
			"guid": this.guid,
			"transform": this.transform
		}), transform);
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
		console.log(this);
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

	getNode() {
		return {
			id: this.guid,
			name: this.getCleanName(),
			type: this.typeName,
			parentGuid: this.parentData.guid,
			draggable: true,
			droppable: true,
			children: [],
			state: {
				filtered: this.enabled
			}
		}
	}

}
