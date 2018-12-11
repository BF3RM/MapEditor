class SelectionGroup extends THREE.Group{
	constructor(guid = GenerateGuid(), name = "Selection Group", transform = new LinearTransform())
	{
		super( );

		this.guid = guid
		this.type = "SelectionGroup";
		this.name = name
		this.transform = transform;

		// Update the matrix after initialization.
		this.updateTransform();

	}

	// We move the children but not the group, as it's not synced.

	onMoveStart() {
		// console.log("move start");
	}

	onMove() {
		// console.log("moving");
		let scope = this;
		if(!scope.hasMoved()) {

			return;
		}
		scope.transform = new LinearTransform().setFromMatrix(scope.matrixWorld);

		
		for (var i = 0; i < scope.children.length; i++) {
			scope.children[i].onMove();
		}

		signals.selectionGroupMoved.dispatch();
	}

	onMoveEnd() {
		// console.log("move end");
		let scope = this;
		if(!scope.hasMoved()) {
			return; // No position change
		}
		scope.transform = new LinearTransform().setFromMatrix(scope.matrixWorld);
	
		
		for (var i = 0; i < scope.children.length; i++) {
			scope.children[i].onMoveEnd();
		}

		signals.selectionGroupMoved.dispatch();
	}

	hasMoved() {
		return !this.transform.toMatrix().equals(this.matrixWorld.elements);
	}

	setTransform(linearTransform) {
		this.transform = linearTransform;
		this.updateTransform();
	}

	updateTransform()
	{
		let matrix = new THREE.Matrix4();
		matrix.set(
			this.transform.left.x, this.transform.up.x, this.transform.forward.x, 0,
			this.transform.left.y, this.transform.up.y, this.transform.forward.y, 0,
			this.transform.left.z, this.transform.up.z, this.transform.forward.z, 0,
			this.transform.trans.x, this.transform.trans.y, this.transform.trans.z, 1);
		
		// To move the group without moving the children we have to detach them first
		let temp = [];

		for (var i = this.children.length - 1; i >= 0; i--) {
			//TODO: matrix should be calculated here doing the average of all children's positions, maybe
			temp[i] = this.children[i];
			this.DetachObject(this.children[i]);
		}

		this.matrix.decompose( this.position, this.quaternion, this.scale );
		this.position.set(this.transform.trans.x, this.transform.trans.y, this.transform.trans.z);

		editor.threeManager.Render();

		for (var i = temp.length - 1; i >= 0; i--) {

			this.AttachObject(temp[i]);
		}
		editor.threeManager.Render();

	}

	Select() {
		this.onSelected();
	}
	Deselect() {
		this.onDeselected();
	}

	onSelected() {
		for (let i = this.children.length - 1; i >= 0; i--) {
			this.children[i].Select();
		}
	}

	onDeselected() {
		for (let i = this.children.length - 1; i >= 0; i--) {
			this.children[i].Deselect();
		}
	}

	DetachObject(gameObject){
		if (gameObject.parent != this){
			console.error("Tried to detach a children that is no longer in this group");
		}

		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( gameObject, this, editor.threeManager.scene );
		
		editor.threeManager.Render(); // REMOVE
	}

	AttachObject(gameObject){

		// don't do anything if the target group it the object group already
		if (gameObject.parent === this){
			return;
		}

		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( gameObject, gameObject.parent, editor.threeManager.scene );

		// remove child from scene and add it to parent
		THREE.SceneUtils.attach( gameObject, editor.threeManager.scene, this );

		editor.threeManager.Render(); // REMOVE
	}


	DeselectObject(gameObject){
		if (gameObject.parent === this){
			gameObject.Deselect();
			this.DetachObject(gameObject);
		}
	}

}