
class SpatialGameEntity extends THREE.Mesh
{
    constructor(instanceId, transform, aabb)
    {
        let pointsGeom = new THREE.Geometry();
        pointsGeom.vertices.push(
            aabb.min,
            aabb.max
        );


        let center = new THREE.Vector3().copy(pointsGeom.vertices[0]).add(pointsGeom.vertices[1]).multiplyScalar(0.5);


        let pointsdebug = new THREE.Geometry();
        pointsdebug.vertices.push(
            center,
            transform.trans
        );

        let points = new THREE.Points(pointsdebug, new THREE.PointsMaterial({
            color: "red",
            size: 0.05
        }));



        let vmax = aabb.max;
        let vmin = aabb.min;

        let boxGeom = new THREE.BoxGeometry(
            vmax.x - vmin.x,
            vmax.y - vmin.y,
            vmax.z - vmin.z
        );

        //boxGeom.translate( center.x - transform.trans.x, center.y - transform.trans.y, center.z - transform.trans.z );
        boxGeom.translate( center.x, center.y, center.z);

        super(boxGeom, new THREE.MeshBasicMaterial({
            color: "aqua",
            wireframe: true,
            visible: true
        }));

        let	color = 0xFF0000;

        let indices = new Uint16Array( [ 0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7 ] );
        let positions = new Float32Array( 8 * 3 );

        let geometry = new THREE.BufferGeometry();
        geometry.setIndex( new THREE.BufferAttribute( indices, 1 ) );
        geometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );

        this.aabb = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial( { color: color } ));
        this.add(this.aabb);

        this.instanceId = instanceId;
        this.transform = transform;
        this.matrixAutoUpdate = false;
        this.updateMatrix();
        // Update the matrix after initialization.
        this.updateTransform();
        this.updateMatrix();

        this.box = null;

        this.add(points);
        this.box = new THREE.Box3(
            aabb.min,
            aabb.max,
            0xFF0000);

        this.matrixAutoUpdate = false;
        this.updateMatrix();
        this.update();
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

        var position = this.aabb.geometry.attributes.position;
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

        //this.aabb.geometry.computeBoundingBox();
    }

    Highlight(){
        this.SetColor(0x999999);
    }

    Unhighlight(){
        this.SetColor(0xFF0000);
    }
    SetColor(color){
        this.aabb.material.color.setHex(color);
        editor.threeManager.Render();
    }
}