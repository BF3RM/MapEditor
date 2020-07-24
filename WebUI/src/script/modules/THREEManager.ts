import * as THREE from 'three';
import { ILinearTransform } from '@/script/types/primitives/LinearTransform';
import { GameObject } from '@/script/types/GameObject';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { signals } from '@/script/modules/Signals';

import CameraControlWrapper from '@/script/modules/three/CameraControlWrapper';
import GizmoWrapper from '@/script/modules/three/GizmoWrapper';
import { InputControls } from '@/script/modules/InputControls';
import { MathUtils } from 'three/src/math/MathUtils';
import { Guid } from '@/script/types/Guid';
import { SelectionGroup } from '@/script/types/SelectionGroup';
import { GIZMO_MODE, WORLD_SPACE } from '@/script/types/Enums';
import { Blueprint } from '@/script/types/Blueprint';

export class THREEManager {
	private scene = new THREE.Scene();
	private renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: true
	});

	private camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);

	public cameraControls = new CameraControlWrapper(this.camera, this.renderer.domElement);
	public gizmoControls: GizmoWrapper = new GizmoWrapper(this.camera, this.renderer.domElement);
	private inputControls = new InputControls(this.renderer.domElement);
	public worldSpace = WORLD_SPACE.local;

	private gridSnap = false;
	private highlightingEnabled = true;
	private dragging = false;
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
	public isCameraMoving = false;
	private clock = new THREE.Clock();
	private cameraHasMoved: boolean;

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
		}

		if (this.debugMode) {
			scope.scene.background = new THREE.Color(0x373737);
			const grid = new THREE.GridHelper(100, 100, 0x444444, 0x888888);
			scope.scene.add(grid);
		}
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
			editor.vext.SendEvent('controlEnd');
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
		// TODO: Drag events dont work in WebUI currently
		this.renderer.domElement.addEventListener('mouseenter', this.onMouseEnter.bind(this));
		this.renderer.domElement.addEventListener('mouseleave', this.onMouseLeave.bind(this));
		this.renderer.domElement.addEventListener('mousemove', this.onMouseOver.bind(this));
		this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
		window.addEventListener('resize', this.onWindowResize.bind(this), false);
		signals.objectChanged.connect(this.setPendingRender.bind(this)); // Object changed? setPendingRender!
	}

	public onDragStart(event: any, item: Blueprint) {
		this.dragging = true;
		editor.editorCore.onPreviewDragStart(item);
	}

	public onDragStop(event: any) {
		if (this.dragging) {
			editor.editorCore.onPreviewStop();
			editor.editorCore.onPreviewDragStop();
			this.dragging = false;
		}
	}

	public onMouseLeave(event: any) {
		this.onDragStop(event);
	}

	public onMouseEnter(event: any) {
		if (this.dragging) {
			editor.editorCore.onPreviewStart();
		}
	}

	public onMouseOver(event: any) {
		if (this.dragging) {
			editor.editorCore.onPreviewDrag(event);
		}
	}

	public onMouseUp(event: any) {
		if (this.dragging) {
			this.dragging = false;
			editor.editorCore.onPreviewDrop();
			editor.editorCore.onPreviewDragStop();
		}
	}

	public enableFreecamMovement() {
		this.highlightingEnabled = false;
		editor.vext.SendEvent('EnableFreeCamMovement');
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
		editor.vext.SendEvent('controlStart');
		const scope = this;

		if (target === undefined) {
			if (editor.selectionGroup.selectedGameObjects.length !== 1) {
				return;
			}
			target = editor.selectionGroup.selectedGameObjects[0];
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
		const position = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
		const size = boundingBox.getSize(position);
		const boundingWidth = size.x + paddingLeft + paddingRight;
		const boundingHeight = size.y + paddingTop + paddingBottom;
		const boundingDepth = size.z;

		distance = scope.cameraControls.getDistanceToFit(boundingWidth, boundingHeight, boundingDepth) * 2;
		scope.cameraControls.dollyTo(distance, true);
		const gameObject = target as GameObject;
		signals.objectFocused.emit(gameObject.guid);

		scope.setPendingRender();
	}

	public deleteObject(gameObject: GameObject) {
		if (gameObject.parent !== null) {
			this.scene.attach(gameObject);
		}
		this.scene.remove(gameObject);
		// this.setPendingRender();
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
		if (editor.vext.executing) return;
		this.renderer.render(this.scene, this.camera);
		this.pendingRender = false;
	}

	public setFov(fov: number) {
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
	}

	public setGizmoMode(mode: GIZMO_MODE) {
		console.log('Changing gizmo mode to ' + mode);

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
			console.log('Changed worldspace to ' + space);
			this.worldSpace = space;
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
		this.gizmoControls.setRotationSnap(MathUtils.degToRad(15));
	}

	public disableGridSnap() {
		this.gridSnap = false;
		this.gizmoControls.translationSnap = null;
		this.gizmoControls.rotationSnap = null;
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
			console.log('Control selected');
		} else if (selectionEnabled) {
			this.selectWithRaycast(mousePos, multiSelection);
		}
	}

	// Called from Lua when freecam is disabled.
	public mouseEnabled() {
		this.highlightingEnabled = true;
		// focus on canvas again
		this.renderer.domElement.focus();
		this.OnCameraMoveDisable();
	}

	private getMousePos(event: MouseEvent): Vec2 {
		const mousePos = new Vec2();
		mousePos.x = (event.clientX / window.innerWidth) * 2 - 1;
		mousePos.y = -(event.clientY / window.innerHeight) * 2 + 1;
		return mousePos;
	}

	public highlight(mousePos: Vec2) {
		if (this.highlightingEnabled) {
			this.highlightWithRaycast(mousePos);
		}
	}

	private async selectWithRaycast(mousePos: Vec2, multiSelection: boolean) {
		const guid = await this.raycastSelection(mousePos) as Guid;

		if (guid !== null) {
			editor.Select(guid, multiSelection, true);
		} else {
			editor.Select(Guid.createEmpty(), multiSelection);
		}
	}

	private async highlightWithRaycast(mousePos: Vec2) {
		const now = new Date();
		if ((now.getTime() - this.lastRaycastTime.getTime() >= 100) && !this.pendingRaycast) {
			this.pendingRaycast = true;
			const guid = await this.raycastSelection(mousePos) as Guid;
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

	public raycastSelection(mousePos: Vec2) {
		return new Promise((resolve) => {
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(mousePos, this.camera);
			let hitSelf: GameObject | null = null;
			const intersects = raycaster.intersectObjects(Object.values(editor.gameObjects.values()), true);
			if (intersects.length > 0) {
				// console.log('hit ' + (intersects.length) + ' objects');
				for (const element of intersects.sort((a, b) => {
					return a.distance - b.distance;
				})) {
					if (element.object == null || element.object.parent == null || element.object.type === 'LineSegments') {
						continue;
					}
					if (element.object.parent.constructor === GameObject && element.object.parent.name !== 'Gameplay/Logic/ShowRoom') {
						const gameObject = element.object.parent as GameObject;
						if (editor.selectionGroup.isSelected(gameObject)) {
							hitSelf = gameObject;
							continue;
						}
						// Select its parent if possible.
						if (gameObject.parent != null) {
							const parent = gameObject.parent as GameObject;
							if (editor.selectionGroup.isSelected(parent)) {
								console.log('Hit self ' + parent.guid);
								hitSelf = parent;
								continue;
							}
							if (parent.enabled && !parent.selected && parent.constructor === GameObject &&
								(parent.blueprintCtrRef.typeName === 'PrefabBlueprint' || parent.blueprintCtrRef.typeName === 'SpatialPrefabBlueprint') &&
								!editor.selectionGroup.isSelected(parent) && parent.name !== 'Gameplay/Logic/ShowRoom') {
								resolve(parent.guid);
								return parent.guid;
							}
						}
						// Else we select the GameObject.
						if (gameObject.enabled && gameObject.name !== 'Objects/UI_CharacterBackdrop/UI_Menu_BlackCover') {
							resolve(gameObject.guid);
							return gameObject.guid;
						}
					}
				}
				// A selected GameObject was hit.
				if (hitSelf !== null) {
					resolve(hitSelf.guid);
					return hitSelf.guid;
				} else { // Didn't hit any GameObjects
					resolve(null);
					return null;
				}
			} else {
				// console.log("no hit")
				resolve(null);
				return null;
			}
			resolve(null);
			return null;
		});
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
