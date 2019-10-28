import * as THREE from 'three';
import {LinearTransform} from '@/script/types/primitives/LinearTransform';
import {Object3D} from 'three';
import {GameObject} from '@/script/types/GameObject';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls';
import {SetScreenToWorldTransformMessage} from '@/script/messages/SetScreenToWorldTransformMessage';
import {Vec3} from '@/script/types/primitives/Vec3';
import {Vec2} from '@/script/types/primitives/Vec2';
import {signals} from '@/script/modules/Signals';
import CameraControls from 'camera-controls';

export enum WORLDSPACE {
	local = 'local',
	world = 'world',
}
export enum GIZMOMODE {
	select = 'select',
	translate = 'translate',
	rotate = 'rotate',
	scale = 'scale',
}
CameraControls.install( { THREE: THREE } );

export class THREEManager {
		public scene = new THREE.Scene();
		private renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: true,
		});
		private camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);
		private cameraControls = new CameraControls( this.camera, this.renderer.domElement );
		private control: TransformControls = new TransformControls(this.camera, this.renderer.domElement);
		private worldSpace = WORLDSPACE.local;

		private gridSnap = false;
		private highlightingEnabled = true;
		private raycastPlacing = false;
		private controlSelected = false;
		private lastRaycastTime = new Date();

		private delta = new THREE.Vector3();
		private box = new THREE.Box3();
		private center = new THREE.Vector3();

		private waitingForControlEnd = false;
		private updatingCamera = false;

	constructor() {
		this.Initialize();
		this.RegisterEvents();
	}
	public Initialize() {
		const scope = this;

		scope.renderer.setPixelRatio(window.devicePixelRatio);
		scope.renderer.setSize(window.innerWidth, window.innerHeight);

		this.camera.position.set(10, 10, 10);
		this.camera.lookAt( new THREE.Vector3( 0, 0, 0 ) );
		this.CreateGizmo();

		// snip ( init three scene... )

		const clock = new THREE.Clock();

		( function anim() {

			// snip
			const delta = clock.getDelta();
			const hasControlsUpdated = scope.cameraControls.update( delta );

			requestAnimationFrame( anim );

			// you can skip this condition to render though
			if ( hasControlsUpdated ) {
				scope.Render();
			}
			if (scope.waitingForControlEnd && !scope.updatingCamera && !hasControlsUpdated) {
				editor.vext.SendEvent('controlEnd');
				scope.waitingForControlEnd = false;
			}
		} )();
/*
		scope.cameraControls.addEventListener( 'controlstart', function( event ) {
			editor.vext.SendEvent('controlStart');
		} );
		scope.cameraControls.addEventListener( 'controlend', function( event ) {
			scope.waitingForControlEnd = true;
		} );
		scope.cameraControls.addEventListener( 'update', function( event ) {
			if (!scope.updatingCamera) {

				// lx, ly, lz, ux, uy, uz, fx, fy, fz, x, y, z) {
				const transform = new LinearTransform().setFromMatrix(event.target._camera.matrixWorld.elements);
				editor.vext.SendEvent('controlUpdate', {
					transform,
				});
			}
		} );

*/
		this.SetFov(90);

	}

	public Focus(target: Object3D) {
		editor.vext.SendEvent('controlStart');
		const scope = this;
		if (target === undefined) {
			target = editor.selectionGroup;
		}
		if (target === undefined) {
			return;
		}


		let distance;

		scope.box.setFromObject( target );


		scope.center.setFromMatrixPosition( target.matrixWorld );
		distance = 0.1;

		scope.delta.set( 0, 0, 1 );
		scope.delta.applyQuaternion( scope.camera.quaternion );
		scope.delta.multiplyScalar( distance * 4 );

		const newPos = scope.center.add( scope.delta );
		scope.cameraControls.moveTo(newPos.x, newPos.y, newPos.z, true);

		const paddingLeft   = 0;
		const paddingRight  = 0;
		const paddingBottom = 0;
		const paddingTop    = 0;

		const boundingBox: THREE.Box3 = new THREE.Box3().setFromObject( target );

		const size = boundingBox.getSize( target.position );
		const boundingWidth  = size.x + paddingLeft + paddingRight;
		const boundingHeight = size.y + paddingTop  + paddingBottom;
		const boundingDepth  = size.z;


		distance = scope.cameraControls.getDistanceToFit(boundingWidth, boundingHeight, boundingDepth) * 2;
		scope.cameraControls.dollyTo(distance, true);
		const gameObject = target as GameObject;
		signals.objectFocused.emit(gameObject.guid);

		scope.Render();
	}

	public RegisterEvents() {
		this.renderer.domElement.addEventListener('mouseDown', (event: any) => {
			switch (event.which) {
				case 1: // Left mouse
					break;
				case 2: // middle mouse
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
		window.addEventListener('resize', this.onWindowResize, false);

		this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
		this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
		this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));

		this.control.addEventListener('change', this.onControlChanged.bind(this));
		this.control.addEventListener('mouseUp', this.onControlMouseUp.bind(this));
		this.control.addEventListener('mouseDown', this.onControlMouseDown.bind(this));
		this.control.addEventListener('objectChange', this.onObjectChanged.bind(this));
	}

	public CreateGizmo() {
		this.control.setSpace(WORLDSPACE.local as string);

		this.scene.add(this.control);

		this.HideGizmo();

		// this.Render();
	}

	public DeleteObject(gameObject: GameObject) {
		if (gameObject.parent !== null) {
			THREE.SceneUtils.detach( gameObject, gameObject.parent, this.scene );
		}
		this.scene.remove( gameObject );

		// this.Render();
	}

	public AttachGizmoTo(gameObject: GameObject) {
		this.control.attach(gameObject);
		// this.Render();
	}

	public HideGizmo() {
		this.control.visible = false;
		// this.mesh.visible = false;
		// this.Render();
	}

	public ShowGizmo() {
		this.control.visible = true;
		// this.mesh.visible = true;

		// this.Render();
	}

	public Render() {
		if (!editor.vext.executing) {
			this.renderer.clear();
			this.renderer.render( this.scene, this.camera );
		}
	}

	public SetFov(p_Fov: number) {
		this.camera.fov = p_Fov;
		this.camera.updateProjectionMatrix();
	}

	public SetGizmoMode(p_Mode: GIZMOMODE) {
		if (p_Mode === GIZMOMODE.select) {
			this.HideGizmo();
			this.Render();
			return;
		}

		if (this.control.visible === false) {
			this.ShowGizmo();
		}
		this.control.setMode(p_Mode);
		console.log('Changed gizmo mode to ' + p_Mode);
		this.Render();
	}

	public SetWorldSpace(p_Space: WORLDSPACE) {
		if (p_Space === WORLDSPACE.local || p_Space === WORLDSPACE.world) {
			this.control.setSpace(p_Space);
			console.log('Changed worldspace to ' + p_Space);
			this.worldSpace = p_Space;
		} else {
			console.error('Tried to set an invalid world space');
		}
	}

	public ToggleWorldSpace() {
		if (this.worldSpace === WORLDSPACE.world) {
			this.SetWorldSpace(WORLDSPACE.local);
		} else {
			this.SetWorldSpace(WORLDSPACE.world);
		}
	}

	public EnableGridSnap() {
		this.gridSnap = true;
		this.control.setTranslationSnap( 0.5 );
		this.control.setRotationSnap( THREE.Math.degToRad( 15 ) );
	}

	public DisableGridSnap() {
		this.gridSnap = false;
		this.control.translationSnap = null;
		this.control.rotationSnap = null;
	}

	public ToggleGridSnap() {
		if (this.gridSnap) {
			this.DisableGridSnap();
		} else {
			this.EnableGridSnap();
		}
	}


	public onMouseUp(e: MouseEvent) {
		const scope = this;

		if (e.which === 1 && editor.threeManager.raycastPlacing) {
			editor.threeManager.ShowGizmo();
			editor.threeManager.raycastPlacing = false;
			scope.cameraControls.enabled = true;
			editor.onControlMoveEnd();
			scope.Render();

		}
	}

	public onMouseDown(e: MouseEvent) {
		const scope = this;
		if (scope.raycastPlacing) {
			scope.cameraControls.enabled = false;
			editor.onControlMoveStart();
		} else if (this.controlSelected) {
			console.log('Control selected');
		} else if ( e.which === 1) {
			const guid = this.RaycastSelection(e);
			if (guid !== null) {
				editor.Select(guid, undefined, true);
			}
		}
	}

	public MouseEnabled() {
		this.highlightingEnabled = true;
	}

	public onMouseMove(e: MouseEvent) {
		const scope = this;
		if (scope.raycastPlacing) {
			const direction = scope.getMouse3D(e);

			const message = new SetScreenToWorldTransformMessage(new Vec3(direction.x, direction.y, direction.z));
			editor.vext.SendMessage(message);
			if (editor.editorCore.screenToWorldTransform.trans !== new Vec3(0, 0, 0)) {
				editor.setUpdating(true);
				const trans = editor.editorCore.screenToWorldTransform.trans;

				editor.selectionGroup.position.set(trans.x, trans.y, trans.z);
				editor.onControlMove();
				scope.Render();
			}
			// editor.RequestMoveObjectWithRaycast(new THREE.Vector2(mousePos.x, mousePos.y))
		} else if (this.highlightingEnabled && e.which !== 1) {

			const now = new Date();

			if (now.getTime() - this.lastRaycastTime.getTime() >= 100) {
				const guid = scope.RaycastSelection(e);

				if (guid !== null) {
					editor.Highlight(guid);
				} else {
					editor.Unhighlight();
				}

				this.lastRaycastTime = now;
			}
		}
	}



	public RaycastSelection(e: MouseEvent) {
		const mousePos = new Vec2();
		mousePos.x = ( e.clientX / window.innerWidth ) * 2 - 1;
		mousePos.y = - ( e.clientY / window.innerHeight ) * 2 + 1;

		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera( mousePos, this.camera );

		const intersects = raycaster.intersectObjects( Object.values(editor.gameObjects), true );
		const dir = new THREE.Vector3( 1, 2, 0 );

		// normalize the direction vector (convert to vector of length 1)
		dir.normalize();

		if ( intersects.length > 0 ) {
			// console.log("hit "+ (intersects.length) + " objects");

			for (let i = 0; i < intersects.length; i++) {
				const element = intersects[i];

				if (element.object == null || element.object.parent == null || element.object.type === 'LineSegments') {
					continue;
				}
				// TODO: More raycast logic. Select prefab, then select child if prefab is already selected?
				if (element.object.parent.constructor.name === 'GameObject') {
					const parent = element.object.parent as GameObject;
					// console.log("first hit is: "+element.object.parent.guid)
					return parent.guid;
				}
			}
		} else {
			// console.log("no hit")
			return null;
		}
		return null;

	}

	public getMouse3D(e: MouseEvent) {
		const mousePos = new Vec2();
		mousePos.x = ( e.clientX / window.innerWidth ) * 2 - 1;
		mousePos.y = - ( e.clientY / window.innerHeight ) * 2 + 1;

		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera( mousePos, this.camera );
		return raycaster.ray.direction;
	}

	public onControlMouseDown(e: any) {
		// Stop moving
		this.controlSelected = true;
		editor.Unhighlight();
		editor.onControlMoveStart();

		editor.setUpdating(true);
		if (e.target === null) {
			return;
		}
		if (e.target.mode === 'translate' && e.target.axis === 'XYZ') {
			const event = document.createEvent('HTMLEvents');
			event.initEvent('mouseup', true, true); // The custom event that will be created
			editor.threeManager.raycastPlacing = true;
			editor.threeManager.renderer.domElement.dispatchEvent(event);
			editor.threeManager.HideGizmo();
		}

	}
	public onControlChanged() {
		// moving
		editor.onControlMove();
		editor.threeManager.Render();

	}

	public onControlMouseUp(e: any) {
		this.controlSelected = false;
		editor.setUpdating(false);
		editor.onControlMoveEnd();
		// Stop Moving
	}





	public onWindowResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.Render();
	}



	public onObjectChanged(e: any) {
	}

	public UpdateCameraTransform(transform: LinearTransform) {
		this.updatingCamera = true;

		this.camera.setRotationFromMatrix(transform.toMatrix());
		const distance = 10;
		const target = new Vec3(transform.trans.x + (transform.forward.x * -1 * distance), transform.trans.y + (transform.forward.y * -1 * distance), transform.trans.z + (transform.forward.z * -1 * distance));

		this.cameraControls.setLookAt(transform.trans.x, transform.trans.y, transform.trans.z, target.x, target.y, target.z, false);
		this.Render();
		this.updatingCamera = false;

	}

}
