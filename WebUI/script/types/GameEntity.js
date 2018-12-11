
class GameEntity extends THREE.Object3D
{
	constructor(guid, typeName, transform)
	{
		super( );

		this.guid = guid;
		this.type = "GameEntity";
		this.typeName = typeName;
		this.transform = transform;
		this.aabb = {

		}

		// Update the matrix after initialization.
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

		// As the position is local, we have to detach the object from its parent first
		let parent = this.parent;

		// remove child from parent and add it to scene
		if (parent !== null){
			THREE.SceneUtils.detach( this, parent, editor.threeManager.scene );
		}

		this.matrix.decompose( this.position, this.quaternion, this.scale );
		this.position.set(this.transform.trans.x, this.transform.trans.y, this.transform.trans.z);
		
		editor.threeManager.Render();

		// remove child from scene and add it to parent
		if (parent !== null){
			THREE.SceneUtils.attach( this, editor.threeManager.scene, parent );
		}
		editor.threeManager.Render();

	}
}