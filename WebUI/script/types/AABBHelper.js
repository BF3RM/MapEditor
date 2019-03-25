
class AABBHelper extends THREE.LineSegments
{
	constructor( box, color )
	{
		if ( color === undefined )
			color = 0xff0000;

		var indices = new Uint16Array( [ 0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7 ] );
		var positions = new Float32Array( 8 * 3 );

		var geometry = new THREE.BufferGeometry();
		geometry.setIndex( new THREE.BufferAttribute( indices, 1 ) );
		geometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );

		super( geometry, new THREE.LineBasicMaterial( { color: color } ) );

		this.box = box;

		this.matrixAutoUpdate = false;
		this.updateMatrix();	
		this.update();
		this.updateMatrix();	
	}

	update()
	{
		if ( this.box === undefined )
			console.warn( 'AABBHelper: box is undefined!' );



		if ( this.box.isEmpty() )
			return;

		var min = this.box.min;
		var max = this.box.max;

		/*
		  5____4
		1/___0/|
		| 6__|_7
		2/___3/
		0: max.x, max.y, max.z
		1: min.x, max.y, max.z
		2: min.x, min.y, max.z
		3: max.x, min.y, max.z
		4: max.x, max.y, min.z
		5: min.x, max.y, min.z
		6: min.x, min.y, min.z
		7: max.x, min.y, min.z
		*/

		var position = this.geometry.attributes.position;
		var array = position.array;

		array[ 0 ] = max.x; array[ 1 ] = max.y; array[ 2 ] = max.z;
		array[ 3 ] = min.x; array[ 4 ] = max.y; array[ 5 ] = max.z;
		array[ 6 ] = min.x; array[ 7 ] = min.y; array[ 8 ] = max.z;
		array[ 9 ] = max.x; array[ 10 ] = min.y; array[ 11 ] = max.z;
		array[ 12 ] = max.x; array[ 13 ] = max.y; array[ 14 ] = min.z;
		array[ 15 ] = min.x; array[ 16 ] = max.y; array[ 17 ] = min.z;
		array[ 18 ] = min.x; array[ 19 ] = min.y; array[ 20 ] = min.z;
		array[ 21 ] = max.x; array[ 22 ] = min.y; array[ 23 ] = min.z;

		position.needsUpdate = true;

		this.geometry.computeBoundingSphere();
	}
}