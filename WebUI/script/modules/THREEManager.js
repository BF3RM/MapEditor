class THREEManager {
	constructor() {
		this.camera = null;
		this.cameraControls = null;
		this.scene = null;
		this.renderer = null;
		this.control = null;
		this.texture = null;

		this.worldSpace = "local";
		this.gridSnap = false;
		this.highlightingEnabled = true;

		this.Initialize();
		this.RegisterEvents();

		this.raycastPlacing = false;
		this.controlSelected = false;
		this.lastRaycastTime = new Date();

		this.delta = new THREE.Vector3();
		this.box = new THREE.Box3();
        this.sphere = new THREE.Sphere();
        this.center = new THREE.Vector3();

        this.waitingForControlEnd = false;
        this.updatingCamera = false;
	}
	Initialize() {
		let scope = this;

		scope.renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: true
		});
		scope.renderer.setPixelRatio(window.devicePixelRatio);
		scope.renderer.setSize(window.innerWidth, window.innerHeight);
		$('#page').append(scope.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);
		this.camera.position.set(10, 10, 10);
		this.camera.lookAt( new THREE.Vector3( 0, 0, 0 ) );
		this.scene = new THREE.Scene();
        this.CreateGizmo();

        if(debugMode) {
            scope.scene.background = new THREE.Color(0x373737);
            let grid = new THREE.GridHelper(100, 100, 0x444444, 0x888888);
            scope.scene.add(grid);
        }


        // snip ( init three scene... )
        CameraControls.install( { THREE: THREE } );

        const clock = new THREE.Clock();
        scope.cameraControls = new CameraControls( scope.camera, scope.renderer.domElement );

        ( function anim () {

            // snip
            const delta = clock.getDelta();
            const hasControlsUpdated = scope.cameraControls.update( delta );

            requestAnimationFrame( anim );

            // you can skip this condition to render though
            if ( hasControlsUpdated ) {
                scope.Render()
            }
            if(scope.waitingForControlEnd && !scope.updatingCamera && !hasControlsUpdated) {
                editor.vext.SendEvent("controlEnd");
                scope.waitingForControlEnd = false;
            }
        } )();

        scope.cameraControls.addEventListener( 'controlstart', function( event ) {
            editor.vext.SendEvent("controlStart");
        } );
        scope.cameraControls.addEventListener( 'controlend', function( event ) {
            scope.waitingForControlEnd = true;
        } );
        scope.cameraControls.addEventListener( 'update', function( event ) {
            if(!scope.updatingCamera) {

                //lx, ly, lz, ux, uy, uz, fx, fy, fz, x, y, z) {
                let transform = new LinearTransform().setFromMatrix(event.target._camera.matrixWorld.elements);
                editor.vext.SendEvent("controlUpdate", {
                    transform: transform,
                });
            };
        } );


        this.control.addEventListener( 'dragging-changed', function ( event ) {

            scope.cameraControls.enabled = ! event.value;

        } );

		this.SetFov(90);

	}

	Focus(target) {
        editor.vext.SendEvent("controlStart");
        let scope = this;
        if(target === undefined) {
            target = editor.selectionGroup;
        }
        if(target === undefined) {
            return;
        }


        let distance;

        scope.box.setFromObject( target );


        scope.center.setFromMatrixPosition( target.matrixWorld );
        distance = 0.1;

        scope.delta.set( 0, 0, 1 );
        scope.delta.applyQuaternion( scope.camera.quaternion );
        scope.delta.multiplyScalar( distance * 4 );

        let newPos = scope.center.add( scope.delta );
        scope.cameraControls.moveTo(newPos.x,newPos.y,newPos.z, true);

        const paddingLeft   = 0;
        const paddingRight  = 0;
        const paddingBottom = 0;
        const paddingTop    = 0;

        const boundingBox = target.isBox3 ? target.clone() : new THREE.Box3().setFromObject( target );

        const size = boundingBox.getSize( _v3A );
        const boundingWidth  = size.x + paddingLeft + paddingRight;
        const boundingHeight = size.y + paddingTop  + paddingBottom;
        const boundingDepth  = size.z;


        distance = scope.cameraControls.getDistanceToFit(boundingWidth, boundingHeight, boundingDepth) * 2;
        scope.cameraControls.dollyTo(distance, true);

        scope.Render();
    }

	RegisterEvents() {
		$(this.renderer.domElement).mousedown(function(event) {
			switch (event.which) {
				case 1: // Left mouse
					break;
				case 2:// middle mouse
					break;
				case 3: // right mouse
					EnableFreecamMovement();
					this.highlightingEnabled = false;
					break;
				default:
					// alert('You have a strange Mouse!');
					break;
			}
		});
		window.addEventListener('resize',this.onWindowResize, false);

		this.renderer.domElement.addEventListener('mousemove',this.onMouseMove.bind(this));
		this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
		this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));

		this.control.addEventListener('change', this.onControlChanged.bind(this));
		this.control.addEventListener('mouseUp', this.onControlMouseUp.bind(this));
		this.control.addEventListener('mouseDown', this.onControlMouseDown.bind(this));
		this.control.addEventListener('objectChange', this.onObjectChanged.bind(this));
	}

	CreateGizmo() {
		if (this.control != null) {
			console.log("Gizmo already exist");
			return
		}

		this.control = new THREE.TransformControls(this.camera, this.renderer.domElement);
		this.control.setSpace("local");

		this.scene.add(this.control);

		this.HideGizmo();

		//this.Render();
	}

	CreateGroup(transform){
		console.log("creatin group");

		let geometry = new THREE.BoxBufferGeometry( 0.5, 0.5, 0.5, 1, 1, 1 );
		let material = new THREE.MeshBasicMaterial( {
			color: 0xff0000,
			visible: true ,
			wireframe: true
		} );
		// THREE.group?
		let mesh = new THREE.Mesh(geometry, material);

		this.scene.add(mesh);
		if (transform != null) {
			let matrix = new THREE.Matrix4();
			matrix.set(
				transform.left.x, transform.up.x, transform.forward.x, 0,
				transform.left.y, transform.up.y, transform.forward.y, 0,
				transform.left.z, transform.up.z, transform.forward.z, 0,
				0, 0, 0, 1);
			mesh.position.set(transform.trans.x, transform.trans.y, transform.trans.z);
			mesh.setRotationFromMatrix(matrix);
		}
		//this.Render();
		return mesh;
	}

	AddToGroup(groupObject, webObject){

		// don't do anything if the target group it the object group already
		if (webObject.parent === groupObject){
			return;
		}

		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( webObject, webObject.parent, this.scene );

		// remove child from scene and add it to parent
		THREE.SceneUtils.attach( webObject, this.scene, groupObject );

		//this.Render();
	}
	RemoveFromGroup(webObject){
		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( webObject, webObject.parent, this.scene );
		
		//this.Render();
	}


	CreateObject(transform){
		let geometry = new THREE.BoxBufferGeometry( 0.5, 0.5, 0.5, 1, 1, 1 );
		let material = new THREE.MeshBasicMaterial( {
			color: 0xff0000,
			visible: true ,
			wireframe: true
		} );
		let mesh = new THREE.Mesh(geometry, material);
		
		// this.scene.add(mesh);

		let matrix = new THREE.Matrix4();
		matrix.set(
			transform.left.x, transform.up.x, transform.forward.x, 0,
			transform.left.y, transform.up.y, transform.forward.y, 0,
			transform.left.z, transform.up.z, transform.forward.z, 0,
			0, 0, 0, 1);
		mesh.position.set(transform.trans.x, transform.trans.y, transform.trans.z);
		mesh.setRotationFromMatrix(matrix);

		//this.Render();

		return mesh;
	}

	MoveObject(webObject, x, y, z){
		if(webObject == null){
			return;
		}		

		
		// As the position is local, we have to detach the object from its parent first
		let parent = webObject.parent;
		// remove child from parent and add it to scene
		THREE.SceneUtils.detach( webObject, parent, this.scene );

		webObject.position.set(x,y,z);

		//this.Render();

		// remove child from scene and add it to parent
		THREE.SceneUtils.attach( webObject, this.scene, parent );

		//this.Render();
	}

	DeleteObject(webObject){
		THREE.SceneUtils.detach( webObject, webObject.parent, this.scene );
		this.scene.remove( webObject );
		
		//this.Render();
	}

/*
	UpdateObject(webObject, transform) {
		// console.log(transform.trans);
		let matrix = new THREE.Matrix4();
		matrix.set(
			transform.left.x, transform.up.x, transform.forward.x, 0,
			transform.left.y, transform.up.y, transform.forward.y, 0,
			transform.left.z, transform.up.z, transform.forward.z, 0,
			0, 0, 0, 1);
		webObject.position.set(transform.trans.x, transform.trans.y, transform.trans.z);
		webObject.setRotationFromMatrix(matrix);

		//this.Render();
	}*/

	AttachGizmoTo(webObject){
		this.control.attach(webObject);
		//this.Render();
	}



	HideGizmo() {
		this.control.visible = false;
		// this.mesh.visible = false;
		// this.Render();
	}

	ShowGizmo() {
		this.control.visible = true;
		// this.mesh.visible = true;

		//this.Render();
	}

	Render() {
		if(!editor.vext.executing) {
			this.renderer.clear();
			this.renderer.render( this.scene, this.camera );
		}
	}

	SetFov(p_Fov) {
		this.camera.fov = p_Fov;
		this.camera.updateProjectionMatrix();
	}

	SetGizmoMode(p_Mode) {
		let radio = $('#tools #' + p_Mode);
		radio[0].checked = true;
		$('#tools').find('input').button("refresh");

		if (p_Mode === "select") {
			this.HideGizmo();
			this.Render();
			return
		}

		if (this.control.visible === false) {
			this.ShowGizmo();
		}
		this.control.setMode(p_Mode);
		console.log("Changed gizmo mode to " + p_Mode);
		this.Render();
	}

	SetWorldSpace(p_Space) {
		if (p_Space === "local" || p_Space === "world") {
			this.control.setSpace(p_Space);
			var radio = $('#worldSpace #' + p_Space);
			radio[0].checked = true;
			$('#worldSpace').find('input').button("refresh");
			console.log("Changed worldspace to " + p_Space);
			this.worldSpace = p_Space;
		} else {
			console.error("Tried to set an invalid world space")
		}
	}

	ToggleWorldSpace() {
		if(this.worldSpace === "local") {
			this.SetWorldSpace("world")
		} else {
			this.SetWorldSpace("local")
		}
	}

	EnableGridSnap() {
		this.gridSnap = true;
		this.control.setTranslationSnap( 0.5 );
		this.control.setRotationSnap( THREE.Math.degToRad( 15 ) )
	}

	DisableGridSnap() {
		this.gridSnap = false;
		this.control.translationSnap = null;
		this.control.rotationSnap = null;
	}

	ToggleGridSnap() {
		if(this.gridSnap) {
			this.DisableGridSnap();
		} else {
			this.EnableGridSnap();
		}
	}


	onMouseUp(e) {
		let scope = this;

		if(e.which === 1 && editor.threeManager.raycastPlacing) {
			editor.threeManager.ShowGizmo();
			editor.threeManager.raycastPlacing = false;
            scope.cameraControls.enabled = true;
            editor.onControlMoveEnd();
			scope.Render();

		}
	}

	onMouseDown(e) {
		let scope = this;
		if (scope.raycastPlacing) {
            scope.cameraControls.enabled = false;
			editor.onControlMoveStart();
		} else if(this.controlSelected) {
			console.log("Control selected")
		} else if( e.which === 1){
            let guid = this.RaycastSelection(e);
            if (guid !== null) {
                editor.Select(guid, undefined, true);
            }
        }
	}

	MouseEnabled(){
		this.highlightingEnabled = true;
	}

	onMouseMove(e) {
		let scope = this;
		if(scope.raycastPlacing) {
			let direction = scope.getMouse3D(e);

			let message = new SetScreenToWorldTransformMessage(direction);
			editor.vext.SendMessage(message);
			if(editor.editorCore.screenToWorldTransform.trans !== new Vec3(0,0,0)) {
				editor.setUpdating(true);
				let trans = editor.editorCore.screenToWorldTransform.trans;

				editor.selectionGroup.position.set(trans.x, trans.y, trans.z);
				editor.onControlMove();
				scope.Render();
			}
			//editor.RequestMoveObjectWithRaycast(new THREE.Vector2(mousePos.x, mousePos.y))
		}


		
		if (this.highlightingEnabled && e.which !== 1){

			let now = new Date();

			if(now.getTime() - this.lastRaycastTime.getTime() >= 100){
				let guid = scope.RaycastSelection(e);

				if (guid !== null) {
					editor.Highlight(guid);
				}else{
					editor.Unhighlight();
				}

				this.lastRaycastTime = now;
			}
		}
	}



	RaycastSelection(e){ 
		let mousePos = [];
		mousePos.x = ( e.clientX / window.innerWidth ) * 2 - 1;
		mousePos.y = - ( e.clientY / window.innerHeight ) * 2 + 1;

		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera( mousePos, this.camera );

		let intersects = raycaster.intersectObjects( Object.values(editor.gameObjects), true );
		let dir = new THREE.Vector3( 1, 2, 0 );

		//normalize the direction vector (convert to vector of length 1)
		dir.normalize();
		
		if ( intersects.length > 0 ) {
			//console.log("hit "+ (intersects.length) + " objects");
			
			for (let i = 0; i < intersects.length; i++) {
				const element = intersects[i];

				if (element.object == null || element.object.parent == null || element.object.type === "LineSegments"){
					continue;
				}
				//TODO: More raycast logic. Select prefab, then select child if prefab is already selected?
				if (element.object.parent !== undefined && element.object.parent.type === "Object3D"){
					let parent = element.object.parent;
					// console.log("first hit is: "+element.object.parent.guid)
					return parent.guid;
				}
			}
		}
		else {
			// console.log("no hit")
			return null;
		}
		return null;

	}

	getMouse3D(e) {
		let mousePos = [];
		mousePos.x = ( e.clientX / window.innerWidth ) * 2 - 1;
		mousePos.y = - ( e.clientY / window.innerHeight ) * 2 + 1;

		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera( mousePos, this.camera );
		return raycaster.ray.direction;
	}

	onControlMouseDown(e) {
		//Stop moving
		this.controlSelected = true;
		editor.onControlMoveStart();

		editor.setUpdating(true);

		if(keysdown[16] === true && e.target.mode === "translate" && e.target.axis === "XYZ") {
			let event = document.createEvent("HTMLEvents");
			event.initEvent("mouseup", true, true); // The custom event that will be created
			editor.threeManager.raycastPlacing = true;
			editor.threeManager.renderer.domElement.dispatchEvent(event);
			editor.threeManager.HideGizmo();
		}

	}
	onControlChanged() {
		//moving
		editor.onControlMove();
		editor.threeManager.Render();

	}

	onControlMouseUp(e) {
		this.controlSelected = false;
		editor.setUpdating(false);
		editor.onControlMoveEnd();
		//Stop Moving
	}





	onWindowResize() {
		let threeManager = this.editor.threeManager;

		threeManager.camera.aspect = window.innerWidth / window.innerHeight;
		threeManager.camera.updateProjectionMatrix();
		threeManager.renderer.setSize(window.innerWidth, window.innerHeight);
		threeManager.Render();
	}



	onObjectChanged(e) {
		if (editor.selectedGameObject == null) {
			return;
		}

		// editor.threeManager.Render();
	}

	UpdateCameraTransform(lx, ly, lz, ux, uy, uz, fx, fy, fz, x, y, z) {
	    this.updatingCamera = true;
		let m = new THREE.Matrix4();

		m.set(lx, ux, fx, 0,
			ly, uy, fy, 0,
			lz, uz, fz, 0,
			0, 0, 0, 0);

		this.camera.setRotationFromMatrix(m);
		this.camera.position.set(x, y, z);
        let distance = 10;
        let target = new Vec3(x + (fx * -1 * distance), y + (fy * -1 * distance), z + (fz * -1 * distance));

        this.cameraControls.setLookAt(x,y,z, target.x, target.y, target.z, false);
		this.Render();
        this.updatingCamera = false;

    }

}
