
class GameObject extends THREE.Object3D
{
	constructor(guid, name, transform, parent, children, parameters) 
	{
		super( );

		this.guid = guid;
		this.name = name;
		this.transform = transform;
		this.objectParent = parent;
		this.parameters = parameters;
		this.selected = false;

		for (var i = children - 1; i >= 0; i--) {
			this.add(children[i]);
		}

		// Update the matrix after initialization.
		this.updateTransform();

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
			this.transform.left.x, this.transform.up.x, this.transform.forward.x, 0,
			this.transform.left.y, this.transform.up.y, this.transform.forward.y, 0,
			this.transform.left.z, this.transform.up.z, this.transform.forward.z, 0,
			this.transform.trans.x, this.transform.trans.y, this.transform.trans.z, 1);

		// As the position is local, we have to detach the object from its parent first
		let parent = this.parent;

		// remove child from parent and add it to scene
		if (parent !== null){
			THREE.SceneUtils.detach( this, parent, editor.webGL.scene );
		}

		this.setRotationFromMatrix(matrix);
		// this.scale.setFromMatrixScale(matrix); //This is fucked
		this.position.set(this.transform.trans.x, this.transform.trans.y, this.transform.trans.z);
		editor.webGL.Render();

		// remove child from scene and add it to parent
		if (parent !== null){
			THREE.SceneUtils.attach( this, editor.webGL.scene, parent );
		}
		editor.webGL.Render();

	}


	update( deltaTime )
	{
		//this.updateTransform( );
	}

	setTransform(linearTransform) {
		this.transform = linearTransform;
		this.parameters.transform = linearTransform;
		this.updateTransform();
		signals.objectChanged.dispatch(this, "transform", linearTransform)

	}
	setName(name) {
		this.name = name;
		this.parameters.name = name;
		signals.objectChanged.dispatch(this, "name", name);
	}

	setVariation(key) {
		this.parameters.variation = key;
		signals.objectChanged.dispatch(this, "variation", key);
	}

	Clone(guid) {
		if(guid === undefined) {
			guid = GenerateGuid();
		}

		return new GameObject(guid, this.name, this.transform, this.objectParent, this.children, this.parameters);
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
		signals.objectChanged.dispatch(this, "transform", transform)
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
		signals.objectChanged.dispatch(this, "transform", transform)

		// Send move command to server
	}

	Select() {
		this.onSelected();
	}
	Deselect() {
		this.onDeselected();
	}

	onSelected() {
		this.selected = true;
		this.visible = true;
	}
	onDeselected() {
		this.selected = false;
		this.visible = false;
	}

}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}