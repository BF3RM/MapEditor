
class GameObject extends THREE.Object3D
{
	constructor(guid, name, transform, parentPartition, children, userData)
	{
		super( );

		this.guid = guid;
		this.type = "GameObject";
		this.name = name;
		this.transform = transform;
		this.parentPartition = parentPartition;
		this.userData = userData;
		this.selected = false;
		this.visible = false;
		this.matrixAutoUpdate  = false;
		this.updateMatrix();		
		for (var i = children - 1; i >= 0; i--) {
			this.add(children[i]);
		}

		// Update the matrix after initialization.
		this.updateTransform();
		this.updateMatrix();	
	}
	
	hasMoved() {
		return !this.transform.toMatrix().equals(this.matrixWorld.elements);
	}



	renderInit()
	{
		/*
		let geometry = new THREE.BoxBufferGeometry( 0.5, 0.5, 0.5, 1, 1, 1 );
		let material = new THREE.MeshBasicMaterial( 
		{
			color: 0xff0000,
			visible: true ,
			wireframe: true
		} );


		this.mesh = new THREE.Mesh(geometry, material);
		this.add(this.mesh);

		*/
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

		editor.threeManager.Render();

		// remove child from scene and add it to parent
		if (parent !== null){
			THREE.SceneUtils.attach( this, editor.threeManager.scene, parent );
		}
		editor.threeManager.Render();

	}


	update( deltaTime )
	{
		//this.updateTransform( );
	}

	setTransform(linearTransform) {
		this.transform = linearTransform;
		this.userData.transform = linearTransform;
		this.updateTransform();
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

	onSelected() {
		console.log("Selected");
		console.log(this);
		for(let key in this.children) {
			let child = this.children[key].visible = true;
		};
		this.selected = true;
		this.visible = true;
	}
	onDeselected() {
		console.log("Deselected");
		for(let key in this.children) {
			let child = this.children[key].visible = false;
		};
		this.selected = false;
		this.visible = false;
	}

	getUserData() {
		return this.userData;
	}

	getNode() {
		return {
			id: this.guid,
			name: this.name,
			type: this.type,
			parentId: this.parentPartition,
			draggable: true,
			droppable: true,
			children: [],
			state: {}
		}
	}

}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}