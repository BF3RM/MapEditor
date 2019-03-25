
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
		this.matrixAutoUpdate = false;
		this.updateMatrix();	
		// Update the matrix after initialization.
		this.updateTransform();
		this.updateMatrix();	
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
}