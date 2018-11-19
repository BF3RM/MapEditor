
class GameEntity extends THREE.Object3D
{
	constructor(guid, typeName, localTransform)
	{
		super( );

		this.guid = guid;
		this.typeName = typeName;
		this.localTransform = localTransform;
		this.aabb = {

		}

		// Update the matrix after initialization.
		this.updateTransform();

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
}