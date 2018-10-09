class GameObject extends THREE.Object3D
{
	constructor(guid, name, transform, parent, children, parameters) 
	{
		super( );

        this.guid = guid;
        this.name = name;
        this.transform = transform;
	    this.objectParent = parent;
		this.objectChildren = children;
		this.parameters = parameters;
	}
	

	renderInit()
	{
		let geometry = new THREE.BoxBufferGeometry( 0.5, 0.5, 0.5, 1, 1, 1 );
		let material = new THREE.MeshBasicMaterial( 
		{
			color: 0xff0000,
			visible: true ,
			wireframe: true
		} );


		this.mesh = new THREE.Mesh(geometry, material);
		
		this.updateTransform();

		this.add(this.mesh);
	}

	updateTransform()
	{
		this.mesh.position.set(this.transform.trans.x, this.transform.trans.y, this.transform.trans.z);

		let matrix = new THREE.Matrix4();
		matrix.set(
			this.transform.left.x, this.transform.up.x, this.transform.forward.x, 0,
			this.transform.left.y, this.transform.up.y, this.transform.forward.y, 0,
			this.transform.left.z, this.transform.up.z, this.transform.forward.z, 0,
			this.transform.trans.x, this.transform.trans.y, this.transform.trans.z, 1);

		this.mesh.setRotationFromMatrix(matrix);
	}

	update( deltaTime )
	{
		this.updateTransform( );
	}
	

    Clone(guid) {
    	if(guid === undefined) {
    		guid = GenerateGuid();
	    }
	    return new GameObject(guid, this.name, this.transform, this.objectParent, this.objectChildren, this.parameters);
    }
}

class EntityCreationParams {
	constructor(variation, networked) {
		this.variation = variation;
		this.networked = networked;
	}
}