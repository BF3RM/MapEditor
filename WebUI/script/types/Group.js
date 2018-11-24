
class Group extends THREE.Group
{
	constructor(guid = GenerateGuid(), name = "New Group", transform = new LinearTransform())
	{
		super( );

		this.guid = guid
		this.type = "Group";
		this.name = name
		this.transform = transform;
		this.selected = false;

		// Update the matrix after initialization.
		this.updateTransform();

	}
	hasMoved() {
		return !this.transform.toMatrix().equals(this.matrixWorld.elements);
	}

	setTransform(linearTransform) {
		this.transform = linearTransform;
		this.updateTransform();
		signals.objectChanged.dispatch(this, "transform", linearTransform);

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

	setTransform(linearTransform) {
		this.transform = linearTransform;
		this.updateTransform();
		signals.objectChanged.dispatch(this, "transform", linearTransform);

	}

	onMoveStart() {
		// console.log("move start");
		// TODO: Validate that the object exists
	}

	onMove() {
		// console.log("moving");
		let scope = this;
		if(!scope.hasMoved()) {
			return;
		}
		let transform = new LinearTransform().setFromMatrix(scope.matrixWorld);
		// signals.objectChanged.dispatch(this, "transform", transform);
		// Send move message to client
	}
	onMoveEnd() {
		// console.log("move end");
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
		for (let i = this.children.length - 1; i >= 0; i--) {
			this.children[i].Select();
		}
		this.selected = true;
	}

	onDeselected() {
		for (let i = this.children.length - 1; i >= 0; i--) {
			this.children[i].Deselect();
		}
		this.selected = false;
	}



	DetachObject(gameObject){
		if (gameObject.parent != this){
			console.error("Tried to detach a children that is no longer in this group");
		}

		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( gameObject, this, editor.webGL.scene );

		// TODO: Reattach object to its original parent if it has one
		// gameObject.objectParent.AttachObject(gameObject);
		
		editor.webGL.Render(); // REMOVE
	}

	AttachObject(gameObject){

		// don't do anything if the target group it the object group already
		if (gameObject.parent === this){
			return;
		}

		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( gameObject, gameObject.parent, editor.webGL.scene );

		// remove child from scene and add it to parent
		THREE.SceneUtils.attach( gameObject, editor.webGL.scene, this );

		editor.webGL.Render(); // REMOVE
	}

}

class SelectionGroup extends Group{
  constructor(){
		super(null, "Selection Group")
	}

	// We move the children but not the group, as it's not synced.

	/**
   * @override
   */
	onMoveStart() {
		// console.log("move start");
	}

	/**
   * @override
   */
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

	/**
   * @override
   */
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

	DeselectObject(gameObject){
		if (gameObject.parent === this){
			gameObject.Deselect();
			super.DetachObject(gameObject);
		}
	}

	setTransform(linearTransform) {
		this.transform = linearTransform;
		this.updateTransform();

	}
}