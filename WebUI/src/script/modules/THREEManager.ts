import * as THREE from 'three';
import { ILinearTransform } from '@/script/types/primitives/LinearTransform';
import { GameObject } from '@/script/types/GameObject';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { signals } from '@/script/modules/Signals';

import CameraControlWrapper from '@/script/modules/three/CameraControlWrapper';
import GizmoWrapper from '@/script/modules/three/GizmoWrapper';
import { InputControls } from '@/script/modules/InputControls';
import { Guid } from '@/script/types/Guid';
import { GIZMO_MODE, WORLD_SPACE } from '@/script/types/Enums';
import { Blueprint } from '@/script/types/Blueprint';
import InstanceManager from '@/script/modules/InstanceManager';
import BoxSelectionWrapper from '@/script/modules/three/BoxSelectionWrapper';
import { Intersection } from 'three';

export class THREEManager {
	public scene = new THREE.Scene();
	private renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: true
	});

	public camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

	public cameraControls = new CameraControlWrapper(this.camera, this.renderer.domElement);
	public gizmoControls: GizmoWrapper = new GizmoWrapper(this.camera, this.renderer.domElement, GIZMO_MODE.select);
	public inputControls = new InputControls(this.renderer.domElement);
	public worldSpace = WORLD_SPACE.local;
	public selectionWrapper = new BoxSelectionWrapper(this.renderer.domElement, this.scene, this.camera, this.renderer);

	private gridSnap = false;
	private highlightingEnabled = true;
	public isDragSpawning = false;
	private raycastPlacing = false;
	private lastRaycastTime = new Date();
	private pendingRaycast = false;
	private pendingRender = true;

	private delta = new THREE.Vector3();
	// private box = new THREE.Box3();
	private center = new THREE.Vector3();

	private waitingForControlEnd = false;
	private updatingCamera = false;
	private debugMode = false;
	public gizmoMode = GIZMO_MODE.select;
	public isCameraMoving = false;
	private clock = new THREE.Clock();
	private cameraHasMoved: boolean;
	public miniBrushEnabled: boolean;

	private raycaster = new THREE.Raycaster();

	constructor(debugMode: boolean) {
		this.scene.name = 'scene';
		signals.editor.Ready.connect(this.initialize.bind(this));
		this.registerEvents();
		this.debugMode = debugMode;
	}

	public initialize() {
		const scope = this;
		scope.scene.autoUpdate = false;
		scope.scene.matrixAutoUpdate = false;
		scope.renderer.setPixelRatio(window.devicePixelRatio);
		scope.renderer.setSize(window.innerWidth, window.innerHeight);
		const page = document.getElementById('ViewportContainer');
		if (page !== null) {
			scope.renderer.domElement.setAttribute('id', 'viewport');
			page.appendChild(scope.renderer.domElement);
			scope.renderer.domElement.setAttribute('tabindex', '0');
			scope.renderer.domElement.focus();
		} else {
			console.error('Unable to find ViewPort');
		}
		if (this.debugMode) {
			scope.scene.background = new THREE.Color(0x373737);
			const planeSize = 100;
			const grid = new THREE.GridHelper(planeSize, planeSize, 0x444444, 0x888888);
			const plGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
			const plMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color(0x444444),
				side: THREE.DoubleSide,
				opacity: 0.5,
				transparent: true,
				depthWrite: false
			});
			const planeMesh = new THREE.Mesh(plGeometry, plMaterial);
			planeMesh.name = 'groundPlane';
			planeMesh.rotateX(1.5708);
			scope.scene.add(planeMesh);
			scope.scene.add(grid);
		}
		this.setGizmoMode(GIZMO_MODE.select);
		this.setFov(90);
		this.setPendingRender();
	}

	public RenderLoop() {
		const scope = this;
		const delta = scope.clock.getDelta();
		const hasControlsUpdated = scope.cameraControls.update(delta);
		this.gizmoControls.updateMatrixWorld();
		if (scope.pendingRender) {
			this.scene.updateMatrixWorld();
		}
		if (hasControlsUpdated || scope.pendingRender || scope.cameraHasMoved) {
			scope.render();
			for (const fun of this.nextFramePendingCalls) {
				fun();
			}
			this.nextFramePendingCalls = [];
			scope.cameraHasMoved = false;
		}
		if (scope.waitingForControlEnd && !scope.updatingCamera && !hasControlsUpdated) {
			window.vext.SendEvent('controlEnd');
			scope.waitingForControlEnd = false;
		}
	}

	private nextFramePendingCalls: (() => void)[] = [];

	public nextFrame(handler: (this: this) => void) {
		this.nextFramePendingCalls.push(() => {
			if (handler) {
				try {
					handler.call(this);
				} catch (e) {
					console.error(e, 'nextFrame');
				}
			}
		});
	}

	public registerEvents() {
		// TODO: Drag events don't work in WebUI currently, use them instead when they're fixed.
		this.renderer.domElement.addEventListener('mouseenter', this.onMouseEnter.bind(this));
		this.renderer.domElement.addEventListener('mouseleave', this.onMouseLeave.bind(this));
		this.renderer.domElement.addEventListener('mousemove', this.onMouseOver.bind(this));
		this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
		document.addEventListener('mouseup', this.onMouseUp.bind(this));
		window.addEventListener('resize', this.onWindowResize.bind(this), false);
		signals.objectChanged.connect(this.setPendingRender.bind(this)); // Object changed? setPendingRender!
	}

	public onDragStart(event: any, item: Blueprint) {
		this.isDragSpawning = true;
		editor.editorCore.onPreviewDragStart(item);
	}

	public onDragStop(event: any) {
		if (this.isDragSpawning) {
			editor.editorCore.onPreviewStop();
		}
	}

	public onMouseLeave(event: any) {
		this.onDragStop(event);
	}

	public onMouseEnter(event: any) {
		if (this.isDragSpawning) {
			editor.editorCore.onPreviewStart();
		}
	}

	public onMouseOver(event: any) {
		if (this.isDragSpawning) {
			editor.editorCore.GetMouseToScreenPosition(event);
			editor.editorCore.onPreviewDrag(event);
		}
		if (this.gizmoControls.raycastPlacing) {
			editor.editorCore.GetMouseToScreenPosition(event);
			this.gizmoControls.OnMouseMove(event);
		}
		if (this.miniBrushEnabled) {
			editor.editorCore.GetMouseToScreenPosition(event);
		}
	}

	public onMouseUp(event: MouseEvent) {
		if (this.isDragSpawning) {
			this.isDragSpawning = false;
			editor.editorCore.onPreviewDrop();
			editor.editorCore.onPreviewDragStop();
		}
		this.gizmoControls.OnMouseUp(event);
	}

	public EnableMiniBrushMode() {
		this.miniBrushEnabled = true;
	}

	public DisableMiniBrushMode() {
		this.miniBrushEnabled = false;
	}

	public enableFreecamMovement() {
		this.highlightingEnabled = false;
		window.vext.SendEvent('EnableFreeCamMovement');
		this.cameraControls.enableVextCameraUpdates(false);
		this.OnCameraMoveEnable();

		// Hack to make sure we don't navigate the windows while in freecam.
		(window as any).document.activeElement.blur();
	}

	private OnCameraMoveEnable() {
		this.isCameraMoving = true;
		this.scene.autoUpdate = false;
		this.scene.matrixAutoUpdate = false;
	}

	private OnCameraMoveDisable() {
		this.isCameraMoving = false;
		this.scene.autoUpdate = true;
		this.scene.matrixAutoUpdate = true;
		this.scene.updateMatrix();
		this.setPendingRender();
	}

	public attachToScene(gameObject: THREE.Object3D): void {
		this.scene.attach(gameObject);
	}

	public removeFromScene(gameObject: THREE.Object3D): void {
		this.scene.remove(gameObject);
	}

	public focus(target?: THREE.Object3D) {
		window.vext.SendEvent('controlStart');
		const scope = this;

		if (target === undefined) {
			if (editor.selectionGroup.selectedGameObjects.length !== 1) {
				target = editor.selectionGroup;
			}
			target = editor.selectionGroup.selectedGameObjects[0];
		}

		// TODO: calculate distance from the bounding box of all SpatialEntities' AABBs in target
		const distance = 10;

		scope.center.setFromMatrixPosition(target.matrixWorld);

		scope.delta.set(0, 0, 1);
		scope.delta.applyQuaternion(scope.camera.quaternion);
		scope.delta.multiplyScalar(distance);

		const newPos = scope.center.add(scope.delta);
		scope.cameraControls.moveTo(newPos.x, newPos.y, newPos.z, true);

		if (target instanceof GameObject) {
			const gameObject = target as GameObject;
			signals.objectFocused.emit(gameObject.guid);
		}

		scope.setPendingRender();
	}

	public deleteObject(gameObject: GameObject) {
		if (gameObject.parent !== null) {
			gameObject.parent.remove(gameObject);
		} else {
			this.scene.remove(gameObject);
		}
	}

	public hideGizmo() {
		this.gizmoControls.enabled = false;
		this.gizmoControls.visible = false;
		this.setPendingRender();
	}

	public showGizmo() {
		this.gizmoControls.enabled = true;
		this.gizmoControls.visible = true;
		this.setPendingRender();
	}

	public setPendingRender() {
		this.pendingRender = true;
	}

	private render() {
		if (window.vext.executing) return;
		this.renderer.render(this.scene, this.camera);
		this.pendingRender = false;
	}

	public setFov(fov: number) {
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
	}

	public setGizmoMode(mode: GIZMO_MODE) {
		// console.log('Changing gizmo mode to ' + mode);

		if (mode === GIZMO_MODE.select) {
			this.hideGizmo();
			this.setPendingRender();
			this.gizmoMode = mode;
			signals.gizmoModeChanged.emit(mode);
			return;
		}

		if (!this.gizmoControls.visible && editor.selectionGroup.selectedGameObjects.length !== 0) {
			this.showGizmo();
		}

		this.gizmoControls.setMode(mode);
		this.gizmoMode = mode;

		signals.gizmoModeChanged.emit(mode);
		this.setPendingRender();
	}

	public setWorldSpace(space: WORLD_SPACE) {
		if (space === WORLD_SPACE.local || space === WORLD_SPACE.world) {
			this.gizmoControls.setSpace(space);
			// console.log('Changed worldspace to ' + space);
			this.worldSpace = space;
			signals.worldSpaceChanged.emit(space);
		} else {
			console.error('Tried to set an invalid world space');
		}
	}

	public toggleWorldSpace() {
		if (this.worldSpace === WORLD_SPACE.world) {
			this.setWorldSpace(WORLD_SPACE.local);
		} else {
			this.setWorldSpace(WORLD_SPACE.world);
		}
	}

	public enableGridSnap() {
		this.gridSnap = true;
		this.gizmoControls.setTranslationSnap(0.5);
		this.gizmoControls.setRotationSnap(THREE.MathUtils.degToRad(5));
	}

	public disableGridSnap() {
		this.gridSnap = false;
		this.gizmoControls.setTranslationSnap(null);
		this.gizmoControls.setRotationSnap(null);
	}

	public ToggleGridSnap() {
		if (this.gridSnap) {
			this.disableGridSnap();
		} else {
			this.enableGridSnap();
		}
	}

	public enableCameraControls() {
		if (this.raycastPlacing) {
			this.showGizmo();
			this.raycastPlacing = false;
			this.cameraControls.enabled = true;
		}
	}

	public onMouseDown(selectionEnabled: boolean, multiSelection: boolean, mousePos: Vec2) {
		const scope = this;

		// focus on canvas again
		scope.renderer.domElement.focus();

		if (scope.raycastPlacing) {
			scope.cameraControls.enabled = false;
		} else if (this.gizmoControls.selected) {
			// console.log('Control selected');
		} else if (selectionEnabled && !this.miniBrushEnabled) {
			this.selectWithRaycast(mousePos, multiSelection);
		}

		if (!this.isDragSpawning && this.miniBrushEnabled && selectionEnabled) {
			editor.MiniBrushRandomizedDuplicate();
		}
	}

	// Called from Lua when freecam is disabled.
	public mouseEnabled() {
		this.highlightingEnabled = true;
		// focus on canvas again
		this.renderer.domElement.focus();
		window.vext.SendEvent('controlStart');
		this.cameraControls.enableVextCameraUpdates(true);
		this.OnCameraMoveDisable();
	}

	private getMousePos(event: MouseEvent): Vec2 {
		const mousePos = new Vec2();
		mousePos.x = (event.clientX / window.innerWidth) * 2 - 1;
		mousePos.y = -(event.clientY / window.innerHeight) * 2 + 1;
		return mousePos;
	}

	public highlight(mousePos: Vec2) {
		if (this.highlightingEnabled && !this.miniBrushEnabled) {
			this.highlightWithRaycast(mousePos);
		}
	}

	private selectWithRaycast(mousePos: Vec2, multiSelection: boolean) {
		this.raycastSelection(mousePos).then((guid: Guid | null) => {
			if (guid !== null) {
				editor.Select(guid, multiSelection, true);
			} else {
				editor.Select(Guid.createEmpty(), multiSelection);
			}
		});
	}

	private highlightWithRaycast(mousePos: Vec2) {
		const now = new Date();
		if (now.getTime() - this.lastRaycastTime.getTime() >= 100 && !this.pendingRaycast) {
			this.pendingRaycast = true;
			this.raycastSelection(mousePos).then((guid: Guid | null) => {
				if (guid !== null) {
					editor.editorCore.highlight(guid);
				} else {
					editor.editorCore.unhighlight();
				}
				this.lastRaycastTime = now;
				this.pendingRaycast = false;
				this.setPendingRender();
			});
		}
	}

	// TODO: Clean up
	private async getHitTarget(intersection: Intersection[]) {
		let hitSelf: GameObject | null = null;

		if (intersection.length === 0) {
			return null;
		}

		for (const element of intersection.sort((a, b) => {
			return a.distance - b.distance;
		})) {
			if (element.instanceId === undefined) {
				console.error('Something went wrong, instanceId of intersection is null');
				return null;
			}
			const gameObject = editor.editorCore.getGameObjectFromInstanceId(element.instanceId);

			if (!gameObject.isSelectableWithRaycast()) {
				continue;
			}

			if (editor.selectionGroup.isSelected(gameObject)) {
				hitSelf = gameObject;
				return hitSelf.guid;
			}

			// Select its parent if possible.
			if (gameObject.parent != null) {
				const parent = gameObject.parent;
				// if (!parent.raycastEnabled) {
				// 	continue;
				// }
				if (editor.selectionGroup.isSelected(parent)) {
					console.log('Hit self ' + parent.guid);
					hitSelf = parent;
					continue;
				}

				if (
					parent.enabled &&
					!parent.selected &&
					parent.constructor === GameObject &&
					(parent.blueprintCtrRef.typeName === 'PrefabBlueprint' ||
						parent.blueprintCtrRef.typeName === 'SpatialPrefabBlueprint') &&
					!editor.selectionGroup.isSelected(parent) &&
					parent.name !== 'Gameplay/Logic/ShowRoom' &&
					parent.raycastEnabled
				) {
					return parent.guid;
				}
			}
			// Else we select the GameObject.
			if (
				gameObject.enabled &&
				gameObject.blueprintCtrRef.typeName !== 'WorldPartData' &&
				gameObject.name !== 'Objects/UI_CharacterBackdrop/UI_Menu_BlackCover'
			) {
				return gameObject.guid;
			}
		}
		// A selected GameObject was hit.
		if (hitSelf) {
			return hitSelf.guid;
		} else {
			// Didn't hit any GameObjects
			return null;
		}
	}

	public async raycastSelection(mousePos: Vec2) {
		this.raycaster.setFromCamera(mousePos, this.camera);
		const instanceManager = InstanceManager.getInstance();
		const instancedMesh = instanceManager.instancedMesh;

		// Increase count to cover all SpatialEntities, so it can hit any of them.
		const cachedCount = instancedMesh.count;
		instancedMesh.count = instanceManager.getNumberOfEntities();
		const intersection = this.raycaster.intersectObject(instancedMesh);

		const result = await this.getHitTarget(intersection);

		// Reset count to original value
		instancedMesh.count = cachedCount;
		return result;
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

	public updateCameraTransform(transform: ILinearTransform) {
		this.cameraControls.updateCameraTransform(transform);
		this.cameraHasMoved = true;
	}
}
