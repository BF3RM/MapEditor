class WebGL {
	constructor() {
		this.camera = null;
		this.scene = null;
		this.renderer = null;
		this.control = null;
		this.texture = null;
		this.mesh = null;

		this._onControlChanged = this.onControlChanged.bind(this);
		this.Initialize();
		this.RegisterEvents();

	}
	Initialize() {
		this.renderer = new THREE.WebGLRenderer({
			alpha: true
		});
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		$('#page').append(this.renderer.domElement);


		this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 3000);
		this.camera.position.set(538, 120, 330);
		this.scene = new THREE.Scene();
		this.CreateGizmo(507.140625, 115.149216, 261.648438);
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
		window.addEventListener('resize', this.onWindowResize, false);
	}

	CreateGizmo(x, y, z) {
		if (this.control != null) {
			console.log("Gizmo already exist")
		}


		let texture = new THREE.TextureLoader().load('textures/crate.gif', this.render);
		texture.mapping = THREE.UVMapping;
		texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
		let geometry = new THREE.BoxBufferGeometry(0.1, 0.1, 0.1);
		let material = new THREE.MeshLambertMaterial({
			map: texture
		});
		this.control = new THREE.TransformControls(this.camera, this.renderer.domElement);
		this.control.setSpace("local");
		this.control.addEventListener('change', this._onControlChanged);
		this.control.addEventListener('mouseUp', WebGL.onMouseUp, false);
		this.control.addEventListener('mouseDown', WebGL.onMouseDown, false);

		this.mesh = new THREE.Mesh(geometry, material);
		this.scene.add(this.mesh);

		this.control.attach(this.mesh);
		this.scene.add(this.control);

		this.mesh.position.set(x, y, z);

		this.HideGizmo();

		this.Render();
	}

	SetGizmoAt(lx, ly, lz, ux, uy, uz, fx, fy, fz, x, y, z) {
		let m = new THREE.Matrix4();

		m.set(lx, ux, fx, 0,
			ly, uy, fy, 0,
			lz, uz, fz, 0,
			0, 0, 0, 0);

		this.mesh.scale.set(1, 1, 1);
		this.mesh.setRotationFromMatrix(m);
		this.mesh.position.set(x, y, z);
		this.Render();
	}

	HideGizmo() {
		this.control.visible = false;
		this.mesh.visible = false;
		this.Render();
	}

	ShowGizmo() {
		this.control.visible = true;
		this.mesh.visible = true;

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
		} else {
			console.error("Tried to set an invalid world space")
		}

	}

	static onMouseUp(e) {
		$('#page').find('canvas').css("z-index", 0)
	}

	static onMouseDown(e) {
		$('#page').find('canvas').css("z-index", 1)
	}

	onWindowResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.render();
	}

	onControlChanged() {
		this.Render();
		//TODO: Invert this method.
		//We should get the matrix and apply it to the mesh, not the other way around.

		let matrix = this.mesh.matrixWorld.toArray().toString();
		let args = selectedEntityID + "," + matrix;
		console.log(args);

		//entityArray[selectedEntityID].matrix = matrix;
		SendEvent('DispatchEventLocal', 'MapEditor:SetEntityMatrix', args);
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