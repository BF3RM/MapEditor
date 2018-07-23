class WebGL {
	constructor() {
		this.camera = null;
		this.scene = null;
		this.renderer = null;
		this.control = null;
		this.texture = null;

		this.worldSpace = "local";
		this.gridSnap = false;

		this._onControlChanged = this.onControlChanged.bind(this);
		this._onWindowResize = this.onWindowResize.bind(this);
		this.Initialize();
		this.RegisterEvents();


	}
	Initialize() {
		this.renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: true
		});
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		$('#page').append(this.renderer.domElement);


		this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 3000);
		this.camera.position.set(10, 10, 10);
		this.camera.lookAt( new THREE.Vector3( 0, 0, 0 ) );
		this.scene = new THREE.Scene();
		this.CreateGizmo();
		this.SetFov(90);
	}

	RegisterEvents() {
		$(this.renderer.domElement).mousedown(function(event) {
			switch (event.which) {
				case 1: // Left mouse
					break;
				case 2:// middle mouse
					break;
				case 3: // right mouse
					EnableFreecam();
					break;
				default:
					alert('You have a strange Mouse!');
			}
		});
		window.addEventListener('resize',this.onWindowResize, false);
	}

	CreateGizmo() {
		if (this.control != null) {
			console.log("Gizmo already exist")
			return
		}

		this.control = new THREE.TransformControls(this.camera, this.renderer.domElement);
		this.control.setSpace("local");
		this.control.addEventListener('change', this._onControlChanged);
		this.control.addEventListener('mouseUp', WebGL.onMouseUp, false);
		this.control.addEventListener('mouseDown', WebGL.onMouseDown, false);

		this.scene.add(this.control);		

		this.HideGizmo();

		this.Render();
	}

	CreateGroup(){
		console.log("creatin group");
		let mesh = new THREE.Group();

		this.scene.add(mesh);
		this.Render();
		return mesh;
	}

	CreateObject(transform){
		let geometry = new THREE.BoxBufferGeometry( 0.5, 0.5, 0.5, 1, 1, 1 );
		let material = new THREE.MeshBasicMaterial( {
			color: 0xff0000,
			visible: true ,
            wireframe: true
		} );
		let mesh = new THREE.Mesh(geometry, material);
		
		this.scene.add(mesh);

		let matrix = new THREE.Matrix4();
		matrix.set(
			transform.left.x, transform.up.x, transform.forward.x, 0,
			transform.left.y, transform.up.y, transform.forward.y, 0,
			transform.left.z, transform.up.z, transform.forward.z, 0,
			0, 0, 0, 1);
		mesh.position.set(transform.trans.x, transform.trans.y, transform.trans.z);
		mesh.setRotationFromMatrix(matrix);

		this.control.attach(mesh);
		this.Render();

		return mesh;
	}

	DeleteObject(mesh){
		this.scene.remove( mesh );
		this.control.detach(mesh);
		this.Render();
		// delete mesh;
	}


	UpdateObject(mesh, transform) {
		// console.log(transform.trans);
		let matrix = new THREE.Matrix4();
		matrix.set(
			transform.left.x, transform.up.x, transform.forward.x, 0,
			transform.left.y, transform.up.y, transform.forward.y, 0,
			transform.left.z, transform.up.z, transform.forward.z, 0,
			0, 0, 0, 1);
		mesh.position.set(transform.trans.x, transform.trans.y, transform.trans.z);
		mesh.setRotationFromMatrix(matrix);

		this.Render();
	}

	AttachGizmoTo(mesh){
		this.control.attach(mesh);
		this.Render();
	}

	HideGizmo() {
		this.control.visible = false;
		// this.mesh.visible = false;
		this.Render();
	}

	ShowGizmo() {
		this.control.visible = true;
		// this.mesh.visible = true;

		this.Render();
	}

	Render() {
		if (this.control == null) {
			return
		}
		this.control.update();
		this.renderer.render(this.scene, this.camera);
	}

	UpdateCameraPos(x, y, z) {
		this.camera.position.set(x, y, z);
		this.camera.position.set(x, y, z);
		this.Render();
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
			return
		}

		if (this.control.visible === false) {
			this.ShowGizmo();
		}
		this.control.setMode(p_Mode);
		console.log("Changed gizmo mode to " + p_Mode)
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
		if(this.worldSpace == "local") {
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

	static onMouseUp(e) {
		$('#page').find('canvas').css("z-index", 0)
	}

	static onMouseDown(e) {
		$('#page').find('canvas').css("z-index", Number.MAX_SAFE_INTEGER)
	}

	onWindowResize() {
		let webGL = this.editor.webGL;

		webGL.camera.aspect = window.innerWidth / window.innerHeight;
		webGL.camera.updateProjectionMatrix();
		webGL.renderer.setSize(window.innerWidth, window.innerHeight);
		webGL.Render();
	}

	onControlChanged() {
		// The gizmo updates the mesh matrix, so we send it to lua.
		
		if (editor.selectedEntity == null) {
			return;
		}

        editor.selectedEntity.OnMove();
		editor.webGL.Render();
	}

	UpdateCameraAngle(lx, ly, lz, ux, uy, uz, fx, fy, fz) {
		let m = new THREE.Matrix4();

		m.set(lx, ux, fx, 0,
			ly, uy, fy, 0,
			lz, uz, fz, 0,
			0, 0, 0, 0);

		this.camera.setRotationFromMatrix(m);
		this.Render();
	}

}