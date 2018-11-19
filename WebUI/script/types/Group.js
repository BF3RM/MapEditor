
class Group extends THREE.Object3D
{
	constructor(guid, typeName, localTransform)
	{
		super( );

		// this.guid = guid;
		// this.typeName = typeName;
		// this.localTransform = localTransform;
		// this.aabb = {
			this.selected = false;
		// }

		// Update the matrix after initialization.
		// this.updateTransform();

	}


	updateTransform()
	{
		let matrix = new THREE.Matrix4();
		matrix.set(
			this.localTransform.left.x, this.localTransform.up.x, this.localTransform.forward.x, 0,
			this.localTransform.left.y, this.localTransform.up.y, this.localTransform.forward.y, 0,
			this.localTransform.left.z, this.localTransform.up.z, this.localTransform.forward.z, 0,
			0, 0, 0, 1);

		this.setRotationFromMatrix(matrix);
		this.scale.setFromMatrixScale(matrix);

		this.position.set(this.localTransform.trans.x, this.localTransform.trans.y, this.localTransform.trans.z);
		//editor.webGL.Render();

	}

	Select() {
		this.onSelected();
	}
	Deselect() {
		this.onDeselected();
	}

	onSelected() {
		for (var i = 0; i < this.children.length; i++) {
			let child = this.children[i];
			child.selected = true;
			child.visible = true;
		}
		this.selected = true;
		this.visible = true;
	}
	
	onDeselected() {
		for (var i = 0; i < this.children.length; i++) {
			let child = this.children[i];
			child.selected = false;
			child.visible = false;
			this.DetachObject(this.children[i]);
			//reattach children to original parent
		}
		this.selected = false;
		this.visible = false;
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