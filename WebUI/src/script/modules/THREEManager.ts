import * as THREE from 'three';
import { IJSONLinearTransform } from '@/script/types/primitives/LinearTransform';
import { GameObject } from '@/script/types/GameObject';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { signals } from '@/script/modules/Signals';

import CameraControlWrapper from '@/script/modules/three/CameraControlWrapper';
import GizmoWrapper from '@/script/modules/three/GizmoWrapper';
import { InputControls } from '@/script/modules/InputControls';
import { MathUtils } from 'three/src/math/MathUtils';
import { Guid } from '@/script/types/Guid';

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

export class THREEManager {
	private scene = new THREE.Scene();
	private renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: true
	});

	private camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);

	public cameraControls = new CameraControlWrapper(this.camera, this.renderer.domElement);
	private gizmoControls: GizmoWrapper = new GizmoWrapper(this.camera, this.renderer.domElement);
	private inputControls = new InputControls(this.renderer.domElement);
	public worldSpace = WORLD_SPACE.local;

	private gridSnap = false;
	private highlightingEnabled = true;
	private raycastPlacing = false;
	private lastRaycastTime = new Date();
	private pendingRaycast = false;
	private pendingRender = true;

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

			// you can skip this condition to render though
			if (hasControlsUpdated || scope.pendingRender) {
				scope.render();
			}

			if (scope.waitingForControlEnd && !scope.updatingCamera && !hasControlsUpdated) {
				editor.vext.SendEvent('controlEnd');
				scope.waitingForControlEnd = false;
			}
		})();

		this.SetFov(90);
		this.setPendingRender();
	}

	public RegisterEvents() {
		window.addEventListener('resize', this.onWindowResize.bind(this), false);

		this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
		this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
		this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));

		signals.objectChanged.connect(this.setPendingRender.bind(this)); // Object changed? setPendingRender!
	}

	private EnableFreecamMovement() {
		editor.vext.SendEvent('EnableFreeCamMovement');

		// Hack to make sure we don't navigate the windows while in freecam.
		// document.activeElement.blur();
	}

	public AttachToScene(gameObject: THREE.Object3D): void {
		this.scene.attach(gameObject);
	}

	public RemoveFromScene(gameObject: THREE.Object3D): void {
		this.scene.remove(gameObject);
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

		scope.setPendingRender();
	}

	public DeleteObject(gameObject: GameObject) {
		if (gameObject.parent !== null) {
			this.scene.attach(gameObject);
		}
		this.scene.remove(gameObject);

		// this.setPendingRender();
	}

	public onSelectGameObject(gameObject: GameObject) {
		this.gizmoControls.Select(gameObject);
	}

	public HideGizmo() {
		this.gizmoControls.visible = false;
		// this.mesh.visible = false;
		// this.setPendingRender();
	}

	public ShowGizmo() {
		this.gizmoControls.visible = true;
		// this.mesh.visible = true;

		// this.setPendingRender();
	}

	public setPendingRender() {
		this.pendingRender = true;
		// if (!editor.vext.executing) {
		// 	// this.renderer.clear();
		// 	this.renderer.render(this.scene, this.camera);
		// }
	}

	private render() {
		if (editor.vext.executing) return;
		this.renderer.render(this.scene, this.camera);
		this.pendingRender = false;
	}

	public SetFov(fov: number) {
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
	}

	public SetGizmoMode(mode: GIZMO_MODE) {
		console.log('Changing gizmo mode to ' + mode);

		if (mode === GIZMO_MODE.select) {
			this.HideGizmo();
			this.setPendingRender();
			this.gizmoMode = mode;
			signals.gizmoModeChanged.emit(mode);
			return;
		}

		if (!this.gizmoControls.visible && editor.selectedGameObjects.length !== 0) {
			this.ShowGizmo();
		}

		this.gizmoControls.setMode(mode);
		this.gizmoMode = mode;

		signals.gizmoModeChanged.emit(mode);
	}

	public SetWorldSpace(space: WORLD_SPACE) {
		if (space === WORLD_SPACE.local || space === WORLD_SPACE.world) {
			this.gizmoControls.setSpace(space);
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
		this.gizmoControls.setTranslationSnap(0.5);
		this.gizmoControls.setRotationSnap(MathUtils.degToRad(15));
	}

	public DisableGridSnap() {
		this.gridSnap = false;
		this.gizmoControls.translationSnap = null;
		this.gizmoControls.rotationSnap = null;
	}

	public ToggleGridSnap() {
		if (this.gridSnap) {
			this.DisableGridSnap();
		} else {
			this.EnableGridSnap();
		}
	}

	public onMouseUp(event: MouseEvent) {
		const scope = this;

		if (event.button === 0 && editor.threeManager.raycastPlacing) {
			editor.threeManager.ShowGizmo();
			editor.threeManager.raycastPlacing = false;
			scope.cameraControls.enabled = true;
		}
	}

	public onMouseDown(event: MouseEvent) {
		const scope = this;
		switch (event.button) {
		case 0: // Left mouse
			break;
		case 1: // middle mouse
			break;
		case 2: // right mouse
			this.EnableFreecamMovement();
			this.highlightingEnabled = false;
			break;
		default:
			// alert('You have a strange Mouse!');
			break;
		}

		if (scope.raycastPlacing) {
			scope.cameraControls.enabled = false;
		} else if (this.gizmoControls.selected) {
			console.log('Control selected');
		} else if (event.buttons === 1) {
			this.SelectWithRaycast(this.getMousePos(event));
			// const guid = this.RaycastSelection(event);
			// if (guid !== null) {
			// 	editor.Select(guid);
			// }
		}
	}

	/**
	* Called from Lua when freecam is disabled.
	* */
	public MouseEnabled() {
		this.highlightingEnabled = true;
	}

	private getMousePos(event: MouseEvent): Vec2 {
		const mousePos = new Vec2();
		mousePos.x = (event.clientX / window.innerWidth) * 2 - 1;
		mousePos.y = -(event.clientY / window.innerHeight) * 2 + 1;
		return mousePos;
	}

	public onMouseMove(e: MouseEvent) {
		const scope = this;
		// if (scope.raycastPlacing) {
		// 	const direction = scope.getMouse3D(e);
		//
		// 	const message = new SetScreenToWorldTransformMessage(new Vec3(direction.x, direction.y, direction.z));
		// 	editor.vext.SendMessage(message);
		// 	if (editor.editorCore.screenToWorldTransform.trans !== new Vec3(0, 0, 0)) {
		// 		editor.setUpdating(true);
		// 		const trans = editor.editorCore.screenToWorldTransform.trans;
		// 	}
		// 	// editor.RequestMoveObjectWithRaycast(new THREE.Vector2(mousePos.x, mousePos.y))
		// } else
		if (this.highlightingEnabled && e.buttons === 0) {
			scope.HighlightWithRaycast(this.getMousePos(e));
		}
	}

	private async SelectWithRaycast(mousePos: Vec2) {
		const guid = await this.RaycastSelection(mousePos) as Guid;

		if (guid !== null) {
			editor.Select(guid);
		}
	}

	private async HighlightWithRaycast(mousePos: Vec2) {
		const now = new Date();
		if ((now.getTime() - this.lastRaycastTime.getTime() >= 100) && !this.pendingRaycast) {
			this.pendingRaycast = true;
			const guid = this.RaycastSelection(mousePos) as Guid;
			if (guid !== null) {
				editor.editorCore.highlight(guid);
			} else {
				editor.editorCore.unhighlight();
			}
			this.lastRaycastTime = now;
			this.pendingRaycast = false;
			this.setPendingRender();
		}
	}

	public RaycastSelection(mousePos: Vec2) {
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(mousePos, this.camera);

		const intersects = raycaster.intersectObjects(Object.values(editor.gameObjects.values()), true);
		const dir = new THREE.Vector3(1, 2, 0);

		// normalize the direction vector (convert to vector of length 1)
		dir.normalize();

		if (intersects.length > 0) {
			// console.log('hit ' + (intersects.length) + ' objects');

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

	public onWindowResize() {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.setPendingRender();
	}

	public UpdateCameraTransform(transform: IJSONLinearTransform) {
		this.cameraControls.UpdateCameraTransform(transform);
	}
}
