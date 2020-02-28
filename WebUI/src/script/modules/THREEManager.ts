import * as THREE from 'three';
import { IJSONLinearTransform, LinearTransform } from '@/script/types/primitives/LinearTransform';
import { GameObject } from '@/script/types/GameObject';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { SetScreenToWorldTransformMessage } from '@/script/messages/SetScreenToWorldTransformMessage';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { signals } from '@/script/modules/Signals';
import CameraControls from 'camera-controls';
import { Controls } from '@/script/modules/Controls';

export enum WORLD_SPACE {
	local = 'local',
	world = 'world',
}

export enum GIZMO_MODE {
	select = 'select',
	translate = 'translate',
	rotate = 'rotate',
	scale = 'scale',
}

CameraControls.install({ THREE });

export class THREEManager {
	public scene = new THREE.Scene();
	private renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: true
	});

	private camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);
	private cameraControls = new CameraControls(this.camera, this.renderer.domElement);
	private controls = new Controls();
	private transformControl: TransformControls = new TransformControls(this.camera, this.renderer.domElement);
	public worldSpace = WORLD_SPACE.local;

	private gridSnap = false;
	private highlightingEnabled = false;
	private raycastPlacing = false;
	private controlSelected = false;
	private lastRaycastTime = new Date();

	private delta = new THREE.Vector3();
	private box = new THREE.Box3();
	private center = new THREE.Vector3();

	private waitingForControlEnd = false;
	private updatingCamera = false;
	private debugMode = false;
	public gizmoMode = GIZMO_MODE.select;

	constructor(debugMode: boolean) {
		signals.editor.Ready.connect(this.Initialize.bind(this));
		this.RegisterEvents();
		this.debugMode = debugMode;
	}

	public Initialize() {
		const scope = this;
		scope.renderer.setPixelRatio(window.devicePixelRatio);
		scope.renderer.setSize(window.innerWidth, window.innerHeight);
		const page = document.getElementById('ViewportContainer');
		if (page !== null) {
			scope.renderer.domElement.setAttribute('id', 'viewport');
			page.appendChild(scope.renderer.domElement);
		}

		this.CreateGizmo();

		if (this.debugMode) {
			scope.scene.background = new THREE.Color(0x373737);
			const grid = new THREE.GridHelper(100, 100, 0x444444, 0x888888);
			scope.scene.add(grid);
		}

		const clock = new THREE.Clock();

		(function anim() {
			// snip
			const delta = clock.getDelta();
			const hasControlsUpdated = scope.cameraControls.update(delta);

			requestAnimationFrame(anim);

			scope.cameraControls.mouseButtons.left = CameraControls.ACTION.ROTATE;
			scope.cameraControls.mouseButtons.right = CameraControls.ACTION.NONE;
			scope.cameraControls.mouseButtons.middle = CameraControls.ACTION.TRUCK;

			// you can skip this condition to render though
			if (hasControlsUpdated) {
				scope.Render();
			}
			if (scope.waitingForControlEnd && !scope.updatingCamera && !hasControlsUpdated) {
				editor.vext.SendEvent('controlEnd');
				scope.waitingForControlEnd = false;
			}
		})();

		scope.cameraControls.addEventListener('controlstart', (event: any) => {
			editor.vext.SendEvent('controlStart');
		});
		scope.cameraControls.addEventListener('controlend', (event: any) => {
			scope.waitingForControlEnd = true;
		});
		scope.cameraControls.addEventListener('update', (event: any) => {
			if (!scope.updatingCamera) {
				// lx, ly, lz, ux, uy, uz, fx, fy, fz, x, y, z) {
				const transform = new LinearTransform().setFromMatrix(event.target._camera.matrixWorld);
				editor.vext.SendEvent('controlUpdate', {
					transform
				});
			}
		});

		this.cameraControls.setPosition(10, 10, 10);
		this.cameraControls.setLookAt(10, 10, 10, 0, 0, 0, false);
		this.SetFov(90);
		this.Render();
	}

	public Focus(target?: THREE.Object3D) {
		editor.vext.SendEvent('controlStart');
		const scope = this;
		if (target === undefined) {
			target = editor.selectionGroup;
		}

		let distance;

		scope.box.setFromObject(target);

		scope.center.setFromMatrixPosition(target.matrixWorld);
		distance = 0.1;

		scope.delta.set(0, 0, 1);
		scope.delta.applyQuaternion(scope.camera.quaternion);
		scope.delta.multiplyScalar(distance * 4);

		const newPos = scope.center.add(scope.delta);
		scope.cameraControls.moveTo(newPos.x, newPos.y, newPos.z, true);

		const paddingLeft = 0;
		const paddingRight = 0;
		const paddingBottom = 0;
		const paddingTop = 0;

		const boundingBox: THREE.Box3 = new THREE.Box3().setFromObject(target);

		const size = boundingBox.getSize(target.position);
		const boundingWidth = size.x + paddingLeft + paddingRight;
		const boundingHeight = size.y + paddingTop + paddingBottom;
		const boundingDepth = size.z;

		distance = scope.cameraControls.getDistanceToFit(boundingWidth, boundingHeight, boundingDepth) * 2;
		scope.cameraControls.dollyTo(distance, true);
		const gameObject = target as GameObject;
		signals.objectFocused.emit(gameObject.guid);

		scope.Render();
	}

	public RegisterEvents() {
		const scope = this;

		this.renderer.domElement.onmousedown = function (event: any) {
			switch (event.which) {
			case 1: // Left mouse
				break;
			case 2: // middle mouse
				break;
			case 3: // right mouse
				scope.controls.EnableFreecamMovement();
				scope.highlightingEnabled = false;
				break;
			default:
				// alert('You have a strange Mouse!');
				break;
			}
		};
		window.addEventListener('resize', this.onWindowResize.bind(this), false);

		this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
		this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
		this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));

		this.transformControl.addEventListener('change', this.onControlChanged.bind(this));
		this.transformControl.addEventListener('mouseUp', this.onControlMouseUp.bind(this));
		this.transformControl.addEventListener('mouseDown', this.onControlMouseDown.bind(this));
		this.transformControl.addEventListener('dragging-changed', (event) => {
			this.cameraControls.enabled = !event.value;
		});

		signals.objectChanged.connect(this.Render.bind(this)); // Object changed? Render!
	}

	public CreateGizmo() {
		this.transformControl.setSpace(WORLD_SPACE.local as string);

		this.scene.add(this.transformControl);

		this.HideGizmo();

		// this.Render();
	}

	public DeleteObject(gameObject: GameObject) {
		if (gameObject.parent !== null) {
			this.scene.attach(gameObject);
		}
		this.scene.remove(gameObject);

		// this.Render();
	}

	public AttachGizmoTo(gameObject: GameObject) {
		this.transformControl.attach(gameObject);
		// this.Render();
	}

	public HideGizmo() {
		this.transformControl.visible = false;
		// this.mesh.visible = false;
		// this.Render();
	}

	public ShowGizmo() {
		this.transformControl.visible = true;
		// this.mesh.visible = true;

		// this.Render();
	}

	public Render() {
		if (!editor.vext.executing) {
			this.renderer.clear();
			this.renderer.render(this.scene, this.camera);
		}
	}

	public SetFov(fov: number) {
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
	}

	public SetGizmoMode(mode: GIZMO_MODE) {
		console.log('Changing gizmo mode to ' + mode);

		if (mode === GIZMO_MODE.select) {
			this.HideGizmo();
			this.Render();
			this.gizmoMode = mode;
			signals.gizmoModeChanged.emit(mode);
			return;
		}

		if (this.transformControl.visible === false) {
			this.ShowGizmo();
		}

		this.transformControl.setMode(mode);
		this.gizmoMode = mode;

		signals.gizmoModeChanged.emit(mode);
		this.Render();
	}

	public SetWorldSpace(space: WORLD_SPACE) {
		if (space === WORLD_SPACE.local || space === WORLD_SPACE.world) {
			this.transformControl.setSpace(space);
			console.log('Changed worldspace to ' + space);
			this.worldSpace = space;
		} else {
			console.error('Tried to set an invalid world space');
		}
	}

	public ToggleWorldSpace() {
		if (this.worldSpace === WORLD_SPACE.world) {
			this.SetWorldSpace(WORLD_SPACE.local);
		} else {
			this.SetWorldSpace(WORLD_SPACE.world);
		}
	}

	public EnableGridSnap() {
		this.gridSnap = true;
		this.transformControl.setTranslationSnap(0.5);
		this.transformControl.setRotationSnap(THREE.MathUtils.degToRad(15));
	}

	public DisableGridSnap() {
		this.gridSnap = false;
		this.transformControl.translationSnap = null;
		this.transformControl.rotationSnap = null;
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
		} else if (e.which === 1) {
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
		mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
		mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(mousePos, this.camera);

		const intersects = raycaster.intersectObjects(Object.values(editor.gameObjects.values()), true);
		const dir = new THREE.Vector3(1, 2, 0);

		// normalize the direction vector (convert to vector of length 1)
		dir.normalize();

		if (intersects.length > 0) {
			// console.log("hit "+ (intersects.length) + " objects");

			for (const element of intersects) {
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
		mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
		mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(mousePos, this.camera);
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
		// TODO: Check for shift key using new controls system
		// TODO: new Controls system
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

	public onControlMouseUp() {
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

	public UpdateCameraTransform(transform: IJSONLinearTransform) {
		const linearTransform = LinearTransform.setFromTable(transform);
		const distance = 10;
		const target = new Vec3(
			linearTransform.trans.x + (linearTransform.forward.x * -1 * distance),
			linearTransform.trans.y + (linearTransform.forward.y * -1 * distance),
			linearTransform.trans.z + (linearTransform.forward.z * -1 * distance)
		);

		this.cameraControls.setLookAt(linearTransform.trans.x, linearTransform.trans.y, linearTransform.trans.z, target.x, target.y, target.z, false);
		this.Render();
	}
}
