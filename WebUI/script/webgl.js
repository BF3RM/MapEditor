var camera, scene, renderer, control, grid, texture, mesh;

init();

render();

function init() {
	renderer = new THREE.WebGLRenderer( {alpha: true } );

	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	document.body.appendChild( renderer.domElement );
	
	camera = new THREE.PerspectiveCamera( 74, window.innerWidth / window.innerHeight, 0.01, 3000 );
	camera.position.set( 538, 120, 330 );
	
	scene = new THREE.Scene();

	window.addEventListener( 'resize', onWindowResize, false );

	CreateGizmo(507.140625, 115.149216, 261.648438);
}


function CreateGizmo(x, y, z){
	grid = new THREE.GridHelper( 15, 10 )
	scene.add( grid );
	grid.position.set(x, y, z);

	texture = new THREE.TextureLoader().load( 'textures/crate.gif', render );
	texture.mapping = THREE.UVMapping;
	texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
	var geometry = new THREE.BoxBufferGeometry( 0.1, 0.1, 0.1);
	var material = new THREE.MeshLambertMaterial( { map: texture } );
	control = new THREE.TransformControls( camera, renderer.domElement );
	control.addEventListener( 'change', onControlChanged );
	mesh = new THREE.Mesh( geometry, material );
	scene.add( mesh );
	control.attach( mesh );
	scene.add( control );

	mesh.position.set(x, y, z );

	render();
}

function SetGizmoAt(x, y, z){
	grid.position.set(x, y, z);
	mesh.position.set(x, y, z );
	render();
}

function HideGizmo(){
	grid.visible = false;
	control.visible = false;
	mesh.visible = false;

	render();
}

function ShowGizmo(){
	control.visible = true;
	grid.visible = true;
	mesh.visible = true;

	render();
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	render();
}
function render() {
	if (control == null) {return}
	control.update();
	renderer.render( scene, camera );
}

function onControlChanged() {
	if (selectedEntityID < 0 ) {
		return;
	}
	// console.log(control.position.toString());
	let position = control.position;
	let args = selectedEntityID.toString() + ":" + control.position.x.toString() + ":" + control.position.y.toString() + ":" + control.position.z.toString() + ":";
	console.log(args);
	WebUI.Call('DispatchEventLocal', 'MapEditor:SetEntityPos', args);
	render();
}

function UpdateCameraPos(x, y, z){
	camera.position.set(x, y, z);
	camera.position.set(x, y, z);
	// render();
}

function UpdateCameraAngle(lx, ly, lz ,ux ,uy ,uz ,fx ,fy ,fz){
	let m = new THREE.Matrix4();

	m.set( lx, ux, fx, 0,
			   ly, uy, fy, 0,
			   lz, uz, fz, 0,
			   0, 0, 0, 0 );


	camera.setRotationFromMatrix(m);
	render();
}

function setFov(fov) {
	camera.fov = fov;
	camera.updateProjectionMatrix();
}
