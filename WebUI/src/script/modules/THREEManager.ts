import * as THREE from 'three';
import { ILinearTransform, LinearTransform } from '@/script/types/primitives/LinearTransform';
import { GameObject } from '@/script/types/GameObject';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { signals } from '@/script/modules/Signals';

import CameraControlWrapper from '@/script/modules/three/CameraControlWrapper';
import GizmoWrapper from '@/script/modules/three/GizmoWrapper';
import { InputControls } from '@/script/modules/InputControls';
import { Guid } from '@/script/types/Guid';
import { GIZMO_MODE, LOGLEVEL, WORLD_SPACE } from '@/script/types/Enums';
import { Blueprint } from '@/script/types/Blueprint';
import InstanceManager from '@/script/modules/InstanceManager';
import BoxSelectionWrapper from '@/script/modules/three/BoxSelectionWrapper';
import { Intersection } from 'three';

/**
 * Gameface (Coherent) has NO working WebGL context, so `new THREE.WebGLRenderer()`
 * throws "Error creating WebGL context" and would abort the whole editor boot
 * (this is a field initializer that runs during construction).
 *
 * We keep three.js as the CPU-side math / scene-graph / raycaster (all of which
 * work fine headless) and only lose the *visual* rasterization. When WebGL is
 * unavailable we fall back to a headless stub that still exposes a real DOM
 * `domElement` (so the camera controls, gizmo, box-select and input bindings all
 * get a valid event surface) with no-op render calls. The in-world visuals
 * (selection boxes, gizmo, grid) are instead drawn natively via VEXT's
 * DebugRenderer -- see the NativeRenderer bridge.
 */
export let WEBGL_AVAILABLE = false;

function createRenderer(): THREE.WebGLRenderer {
	try {
		const r = new THREE.WebGLRenderer({ alpha: true, antialias: true });
		WEBGL_AVAILABLE = true;
		return r;
	} catch (e) {
		console.warn(
			'[MapEditor] WebGL unavailable (Gameface) - using headless renderer, drawing via native DebugRenderer.',
			e
		);
		WEBGL_AVAILABLE = false;
		const canvas = document.createElement('canvas');
		// The headless canvas renders nothing (no WebGL) but is still appended to
		// #ViewportContainer at full window size. Make it non-interactive and out of
		// flow so it can't swallow clicks meant for the editor panels / world.
		canvas.style.pointerEvents = 'none';
		canvas.style.position = 'absolute';
		canvas.style.top = '0';
		canvas.style.left = '0';
		canvas.style.zIndex = '-1';
		// Minimal WebGLRenderer surface actually used by the editor: a DOM element
		// (input surface + SelectionHelper anchor) and no-op sizing/render calls.
		const stub: any = {
			domElement: canvas,
			render: () => {},
			setSize: (w: number, h: number) => {
				canvas.width = w;
				canvas.height = h;
				canvas.style.width = w + 'px';
				canvas.style.height = h + 'px';
			},
			setPixelRatio: () => {},
			setClearColor: () => {},
			dispose: () => {},
			getContext: () => null
		};
		return stub as THREE.WebGLRenderer;
	}
}

/**
 * Gameface hard-crashes (native stack overflow) inside the `camera-controls`
 * library constructor. In MapEditor the camera is authoritatively driven by
 * VEXT (the Lua freecam pushes its transform to `updateCameraTransform`), so the
 * mouse-driven camera-controls is unnecessary here. When WebGL is unavailable we
 * swap it for a lightweight stub that just drives the three.js camera from the
 * VEXT transform (needed later for CPU raycasting / screen projection).
 */
function makeCameraControlsStub(camera: THREE.PerspectiveCamera): CameraControlWrapper {
	const stub: any = {
		enabled: false,
		mouseButtons: { left: 0, right: 0, middle: 0, wheel: 0, shiftLeft: 0 },
		update: () => false,
		enableVextCameraUpdates: () => {},
		moveTo: () => {},
		setPosition: () => {},
		setLookAt: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispose: () => {},
		updateCameraTransform: (t: any) => {
			if (!t || !t.trans) return;
			camera.position.set(t.trans.x, t.trans.y, t.trans.z);
			if (t.up) camera.up.set(t.up.x, t.up.y, t.up.z);
			if (t.forward) camera.lookAt(t.trans.x - t.forward.x, t.trans.y - t.forward.y, t.trans.z - t.forward.z);
			camera.updateMatrixWorld();
		}
	};
	return stub as CameraControlWrapper;
}

/**
 * three.js `TransformControls` (the gizmo) builds a large sub-scene and binds
 * many pointer listeners; in Gameface this hard-crashes. Stub it as a plain
 * Object3D exposing the members the editor touches. The real transform gizmo
 * is reimplemented natively via VEXT DebugRenderer in a later phase.
 */
function makeGizmoStub(): GizmoWrapper {
	const stub: any = new THREE.Object3D();
	stub.visible = false;
	stub.selected = false;
	stub.enabled = false;
	stub.raycastPlacing = false;
	stub.axis = null;
	stub.dragging = false;
	stub.setMode = () => {};
	stub.setSpace = () => {};
	stub.setSize = () => {};
	stub.setTranslationSnap = () => {};
	stub.setRotationSnap = () => {};
	stub.attach = () => stub;
	stub.detach = () => stub;
	stub.OnMouseMove = () => {};
	stub.OnMouseUp = () => {};
	stub.SetPosition = () => {};
	return stub as GizmoWrapper;
}

/** SelectionHelper binds pointer events / builds a helper div; stubbed in Gameface. */
function makeSelectionStub(): BoxSelectionWrapper {
	const stub: any = {
		initBoxSelection: () => {},
		onMouseMove: () => {},
		onMouseUp: () => {}
	};
	return stub as BoxSelectionWrapper;
}

export class THREEManager {
	public scene = new THREE.Scene();
	private renderer = createRenderer();

	public camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

	// These were field initializers; moved into the constructor so we can log
	// between each and pinpoint which one triggers the Gameface native crash.
	public cameraControls!: CameraControlWrapper;
	public gizmoControls!: GizmoWrapper;
	public inputControls!: InputControls;
	public worldSpace = WORLD_SPACE.local;
	public selectionWrapper!: BoxSelectionWrapper;

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
	public gizmoMode = GIZMO_MODE.translate;
	public isCameraMoving = false;
	private clock = new THREE.Clock();
	private cameraHasMoved: boolean;
	public miniBrushEnabled = false;

	private raycaster = new THREE.Raycaster();

	// ---- Native gizmo drag (Gameface port) --------------------------------
	// The gizmo is drawn natively (Lua DebugRenderer) but the transform math stays
	// in JS on the synced three.js camera + selectionGroup -- the SAME path the
	// Inspector uses (setPosition -> onClientOnlyMove, commit via onClientOnlyMoveEnd).
	private gizmoDragMode: 'translate' | 'rotate' | 'scale' | null = null;
	private gizmoDragDir = new THREE.Vector3();
	private gizmoDragAxisName: 'X' | 'Y' | 'Z' = 'X';
	private gizmoDragPlane = new THREE.Plane();
	private gizmoDragStartHit = new THREE.Vector3();
	private gizmoDragCenter0 = new THREE.Vector3();
	private gizmoQuatStart = new THREE.Quaternion();
	private gizmoScaleStart = new THREE.Vector3();
	private gizmoScaleUniform = false; // scale drag grabbed the centre box (all axes)
	private gizmoDragStartMouseY = 0; // screen Y at drag start (uniform scale)

	// UE-style Ctrl+drag: move/rotate/scale the selection along an axis chosen by the
	// mouse button (LMB=X, RMB=Y, both=Z), in the current gizmo mode.
	private ctrlDragActive = false;
	private ctrlDragLastX = 0;
	private ctrlDragLastY = 0;

	// Ctrl+LMB is ambiguous: a DRAG = axis move (ctrl-drag), a CLICK = add the clicked
	// object to the multi-selection. We defer on mousedown and decide on move/up.
	private ctrlPending = false;
	private ctrlPendingX = 0;
	private ctrlPendingY = 0;
	private ctrlPendingPos = new Vec2();

	// UE-style Alt+left drag: orbit the camera around the current selection.
	private orbitActive = false;
	private orbitCenter = new THREE.Vector3();
	private orbitLastX = 0;
	private orbitLastY = 0;

	// UE-style Alt+right drag: dolly (zoom) toward/away from the current selection.
	private dollyActive = false;
	private dollyCenter = new THREE.Vector3();
	private dollyLastX = 0;
	private dollyLastY = 0;

	// Gizmo axis basis (world axes, or the selection's local axes in local space).
	// Kept in sync in pushGizmoCenter and used by the drag math + drawn natively.
	private gizmoBasisX = new THREE.Vector3(1, 0, 0);
	private gizmoBasisY = new THREE.Vector3(0, 1, 0);
	private gizmoBasisZ = new THREE.Vector3(0, 0, 1);

	constructor(debugMode: boolean) {
		// The three.js/WebGL viewport wrappers hard-crash Gameface (native stack
		// overflow) because there is no WebGL context; they are replaced by stubs
		// and, later, by native VEXT DebugRenderer drawing. InputControls is plain
		// DOM event binding (safe) so it stays real.
		this.cameraControls = WEBGL_AVAILABLE
			? new CameraControlWrapper(this.camera, this.renderer.domElement)
			: makeCameraControlsStub(this.camera);
		this.gizmoControls = WEBGL_AVAILABLE
			? new GizmoWrapper(this.camera, this.renderer.domElement, GIZMO_MODE.select)
			: makeGizmoStub();
		// Standalone (browser/emulator): there is no Lua freecam to hand the camera to, so let the
		// library drive it with the mouse. In game this stays off -- the freecam is authoritative
		// and pushes its transform in through updateCameraTransform.
		if (debugMode && WEBGL_AVAILABLE) {
			this.cameraControls.enableStandaloneMouse();
			console.log('[MapEditor] standalone camera: right = look, middle = pan, wheel = zoom');
		} else if (debugMode) {
			// Says WHY there is no camera, instead of leaving a dead viewport to guess at.
			console.warn('[MapEditor] standalone camera unavailable: WebGL did not initialise');
		}

		this.inputControls = new InputControls(this.renderer.domElement);
		this.selectionWrapper = WEBGL_AVAILABLE
			? new BoxSelectionWrapper(this.renderer.domElement, this.scene, this.camera, this.renderer)
			: makeSelectionStub();
		this.scene.name = 'scene';
		signals.editor.Ready.connect(this.initialize.bind(this));
		this.registerEvents();
		this.debugMode = debugMode;
		// Bridge for Lua's native-raycast pick result.
		(window as any).__onNativePick = (g: string) => this.onNativePickResult(g);
	}

	public initialize() {
		const scope = this;
		scope.scene.matrixWorldAutoUpdate = false;
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
		// Default the gizmo to translate (so a selected/just-spawned object shows the
		// move gizmo immediately). Safe here: initialize() runs on editor.Ready, after
		// selectionGroup + vext exist.
		this.setGizmoMode(GIZMO_MODE.translate);
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

		// Gameface port: the viewport WebGL canvas is stubbed (pointer-events:none),
		// so drive picking from document-level mouse events instead. Raycasting is
		// pure CPU (three.js Raycaster vs the AABB InstancedMesh) and works headless;
		// the hit guid is pushed to Lua, which draws the box via DebugRenderer.
		// Only pick when the cursor is over the (click-through) viewport, NOT over a
		// UI panel/toolbar/divider -- otherwise clicking Scene Instances etc. would
		// also raycast-select a box behind the panel.
		const overUi = (e: MouseEvent): boolean => {
			let t = e.target as HTMLElement | null;
			// Walk up manually (Gameface's closest() is unreliable with :not()): if the
			// cursor is over the toolbar, a divider, or any panel that ISN'T the
			// (click-through) viewport, this is a UI click -> don't pick.
			while (t) {
				const id = t.id;
				const cls = t.className && typeof t.className === 'string' ? t.className : '';
				// Any real UI surface -> never raycast-select an object behind it:
				// toolbar/menus, dock dividers, modal windows + backdrops, and the dock
				// columns / their backgrounds (fx-right/fx-bottom/fx-hierarchy) incl. gaps.
				if (
					id === 'toolbar' ||
					cls.indexOf('fx-divider') !== -1 ||
					cls.indexOf('window-wrapper') !== -1 ||
					cls.indexOf('overlay') !== -1 ||
					cls.indexOf('window') !== -1 ||
					cls.indexOf('fx-right') !== -1 ||
					cls.indexOf('fx-bottom') !== -1 ||
					cls.indexOf('fx-hierarchy') !== -1
				) {
					return true;
				}
				if (cls.indexOf('EditorComponent') !== -1) {
					return id !== 'viewport-component';
				}
				// The click-through 3D viewport background (fx-viewport is pointer-events:
				// none, so viewport clicks land on fx-top / fx-main / glHolder) -> this is a
				// genuine world click, allow picking.
				if (
					cls.indexOf('fx-viewport') !== -1 ||
					cls.indexOf('fx-top') !== -1 ||
					cls.indexOf('fx-main') !== -1 ||
					id === 'glHolder'
				) {
					return false;
				}
				t = t.parentElement;
			}
			return false;
		};
		document.addEventListener('mousemove', (e: MouseEvent) => {
			if (this.orbitActive) {
				this.updateOrbit(e);
				return;
			}
			if (this.dollyActive) {
				this.updateDolly(e);
				return;
			}
			// Deferred Ctrl+LMB: if the cursor moves, it's an axis DRAG (not a click-add).
			if (this.ctrlPending) {
				if (Math.abs(e.clientX - this.ctrlPendingX) + Math.abs(e.clientY - this.ctrlPendingY) > 4) {
					this.ctrlPending = false;
					this.ctrlDragActive = true;
					this.ctrlDragLastX = this.ctrlPendingX;
					this.ctrlDragLastY = this.ctrlPendingY;
					window.vext.SendEvent('controlStart');
					this.updateCtrlDrag(e);
				}
				return;
			}
			if (this.ctrlDragActive) {
				this.updateCtrlDrag(e);
				return;
			}
			// A gizmo drag keeps going even if the cursor slides over a panel.
			if (this.gizmoDragMode !== null) {
				this.updateGizmoDrag(e);
				return;
			}
			if (overUi(e)) return;
			if (this.highlightingEnabled && !this.miniBrushEnabled) {
				this.highlight(this.getMousePos(e));
			}
		});
		document.addEventListener('mousedown', (e: MouseEvent) => {
			if (overUi(e)) return;
			// UE-style Alt + left drag = orbit the camera around the current selection.
			if (e.altKey && e.button === 0 && editor.selectionGroup.selectedGameObjects.length > 0) {
				this.beginOrbit(e);
				e.preventDefault();
				return;
			}
			// UE-style Alt + right drag = dolly (zoom) toward/away from the selection.
			if (e.altKey && e.button === 2 && editor.selectionGroup.selectedGameObjects.length > 0) {
				this.beginDolly(e);
				e.preventDefault();
				return;
			}
			// UE-style Ctrl + drag (any button): move/rotate/scale the selection along
			// an axis (LMB=X, RMB=Y, both=Z) in the current gizmo mode.
			if (
				e.ctrlKey &&
				this.gizmoMode !== GIZMO_MODE.select &&
				editor.selectionGroup.selectedGameObjects.length > 0
			) {
				this.ctrlPending = true;
				this.ctrlPendingX = e.clientX;
				this.ctrlPendingY = e.clientY;
				this.ctrlPendingPos = this.getMousePos(e);
				e.preventDefault();
				return;
			}
			if (e.button === 0 && this.highlightingEnabled) {
				// Grab a gizmo axis first; if we do, drag instead of selecting.
				if (this.tryBeginGizmoDrag(e)) {
					return;
				}
				// Ctrl/Shift = add to the multi-selection (covers 'select' mode + first pick).
				this.onMouseDown(true, e.shiftKey || e.ctrlKey, this.getMousePos(e));
			}
		});
		// Space cycles the gizmo mode (translate -> rotate -> scale). Only in the
		// editor cursor mode (not while flying the freecam, where Space = up), and
		// never while typing into an input.
		document.addEventListener('keydown', (e: KeyboardEvent) => {
			const isSpace = e.code === 'Space' || e.key === ' ';
			// F = focus the camera on the current selection (like Unreal Engine).
			const isF = e.code === 'KeyF' || e.key === 'f' || e.key === 'F';
			if (!isSpace && !isF) return;
			if (!this.highlightingEnabled) return;
			const el = document.activeElement as HTMLElement | null;
			if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
			e.preventDefault();
			if (isSpace) {
				this.cycleGizmoMode();
			} else if (isF) {
				if (editor.selectionGroup.selectedGameObjects.length > 0) {
					this.focus();
				}
			}
		});
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
		if (this.orbitActive) {
			this.endOrbit();
		}
		if (this.dollyActive) {
			this.endDolly();
		}
		// Deferred Ctrl+LMB released without dragging = a click -> add the object under the
		// cursor to the multi-selection (the pivot stays on the first-selected object).
		if (this.ctrlPending) {
			this.ctrlPending = false;
			this.pendingPickMulti = true;
			this.selectWithRaycast(this.ctrlPendingPos, true);
		}
		if (this.ctrlDragActive && event.buttons === 0) {
			this.ctrlDragActive = false;
			editor.selectionGroup.onClientOnlyMoveEnd();
			window.vext.SendEvent('controlEnd');
		}
		if (this.gizmoDragMode !== null) {
			this.endGizmoDrag();
		}
		if (this.isDragSpawning) {
			this.isDragSpawning = false;
			editor.editorCore.onPreviewDrop();
			editor.editorCore.onPreviewDragStop();
		}
		this.gizmoControls.OnMouseUp(event);
	}

	public EnableMiniBrushMode() {
		window.Log(LOGLEVEL.VERBOSE, 'Minibrush Mode enabled');
		this.miniBrushEnabled = true;
	}

	public DisableMiniBrushMode() {
		window.Log(LOGLEVEL.VERBOSE, 'Minibrush Mode disabled');
		this.miniBrushEnabled = false;
	}

	public enableFreecamMovement() {
		// Browser/emulator: there is no Lua to hand the camera to, and no way back.
		//
		// This hands control to the Lua freecam and disables selection until Lua calls
		// mouseEnabled() again. In the emulator that call never comes, so the FIRST right-click
		// permanently killed click-to-select, right-drag look, and every other control -- while
		// the real camera-controls library is sitting right there, fully functional, because the
		// browser does have WebGL (only Gameface gets the stub).
		//
		// So in debug mode: change nothing, and let camera-controls drive the camera as it did
		// before the Gameface port introduced the handoff.
		if (editor.debug) {
			return;
		}

		this.highlightingEnabled = false;
		editor.editorCore.unhighlight();
		window.vext.SendEvent('EnableFreeCamMovement');
		this.cameraControls.enableVextCameraUpdates(false);
		this.OnCameraMoveEnable();

		// Hack to make sure we don't navigate the windows while in freecam.
		(window as any).document.activeElement.blur();
	}

	private OnCameraMoveEnable() {
		this.isCameraMoving = true;
		this.scene.matrixWorldAutoUpdate = false;
		this.scene.matrixAutoUpdate = false;
	}

	private OnCameraMoveDisable() {
		this.isCameraMoving = false;
		this.scene.matrixWorldAutoUpdate = true;
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

	// Combined world-space bounding sphere of all selected objects, from their spatial
	// entities' AABBs (GameObjects have no mesh; SpatialGameEntity holds AABBScale +
	// AABBTransformMatrix). Transforms the 8 AABB corners by each entity's world matrix so
	// rotation/scale are accounted for. Returns null if the selection has no AABB entities.
	private computeSelectionBounds(): { center: THREE.Vector3; radius: number } | null {
		const box = new THREE.Box3();
		let has = false;
		const corner = new THREE.Vector3();
		const half = new THREE.Vector3();
		const localCenter = new THREE.Vector3();
		for (const go of editor.selectionGroup.selectedGameObjects) {
			go.updateMatrixWorld(true);
			go.traverse((child: any) => {
				if (child.type !== 'SpatialGameEntity' || !child.AABBScale) {
					return;
				}
				child.updateMatrixWorld(true);
				half.copy(child.AABBScale).multiplyScalar(0.5);
				localCenter.setFromMatrixPosition(child.AABBTransformMatrix);
				for (let sx = -1; sx <= 1; sx += 2) {
					for (let sy = -1; sy <= 1; sy += 2) {
						for (let sz = -1; sz <= 1; sz += 2) {
							corner.set(
								localCenter.x + sx * half.x,
								localCenter.y + sy * half.y,
								localCenter.z + sz * half.z
							);
							corner.applyMatrix4(child.matrixWorld);
							box.expandByPoint(corner);
							has = true;
						}
					}
				}
			});
		}
		if (!has) {
			return null;
		}
		const center = new THREE.Vector3();
		box.getCenter(center);
		const sphere = new THREE.Sphere();
		box.getBoundingSphere(sphere);
		return { center, radius: sphere.radius };
	}

	public focus(target?: THREE.Object3D) {
		const scope = this;

		if (target === undefined) {
			if (editor.selectionGroup.selectedGameObjects.length !== 1) {
				target = editor.selectionGroup;
			}
			target = editor.selectionGroup.selectedGameObjects[0];
		}
		if (!target) {
			return;
		}

		// Frame the SELECTION BOUNDS (like Unreal's "Frame Selected"): use the combined
		// world-space bounding SPHERE of all selected objects (not the pivot) so framing is
		// correct regardless of object size or an offset pivot.
		const bounds = this.computeSelectionBounds();
		const center = new THREE.Vector3();
		let radius: number;
		if (bounds) {
			center.copy(bounds.center);
			radius = bounds.radius;
		} else {
			center.setFromMatrixPosition(target.matrixWorld);
			radius = 1.5; // no AABB entities -> pivot + small default
		}

		// Distance for the whole sphere to fit inside the narrower of the vertical/horizontal
		// FOV, plus a framing margin, clamped.
		const vFov = THREE.MathUtils.degToRad(this.camera.fov || 55);
		const aspect = this.camera.aspect || window.innerWidth / window.innerHeight;
		const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
		const usedFov = Math.min(vFov, hFov);
		let distance = (radius / Math.tan(usedFov / 2)) * 1.3;
		distance = THREE.MathUtils.clamp(distance, 1.5, 600);

		// Move along the CURRENT view direction (preserves the viewing angle) and re-centre
		// on the bounds centre.
		const forward = new THREE.Vector3();
		this.camera.getWorldDirection(forward);
		if (forward.lengthSq() < 1e-6) {
			forward.set(0, 0, -1);
		}
		const newPos = center.clone().addScaledVector(forward, -distance);

		// Target camera orientation (look at the object, upright/no roll).
		scope.camera.position.copy(newPos);
		scope.camera.up.set(0, 1, 0); // keep upright (no roll), like Unreal
		scope.camera.lookAt(center);
		scope.camera.updateMatrixWorld();

		// Glide the real freecam to the target over `duration` seconds. The interpolation
		// runs in LUA (per game frame): doing it in JS piled up controlUpdate events that
		// Lua applied in one batch -> teleport. We still move the headless three.js camera
		// to the target now so gizmo/raycast math is immediately correct.
		const transform = new LinearTransform().setFromMatrix(scope.camera.matrixWorld);
		window.vext.SendEvent('FocusCamera', { transform, duration: 0.26 });

		if (target instanceof GameObject) {
			const gameObject = target as GameObject;
			signals.objectFocused.emit(gameObject.guid);
		}

		scope.setPendingRender();
	}

	// Center of the current selection (average of the selected objects' world positions).
	private selectionCenter(): THREE.Vector3 {
		const sel = editor.selectionGroup.selectedGameObjects;
		const c = new THREE.Vector3();
		if (sel.length === 0) {
			return c;
		}
		const tmp = new THREE.Vector3();
		for (const go of sel) {
			tmp.setFromMatrixPosition(go.matrixWorld);
			c.add(tmp);
		}
		c.divideScalar(sel.length);
		return c;
	}

	private beginOrbit(e: MouseEvent) {
		this.orbitActive = true;
		this.orbitCenter = this.selectionCenter();
		this.orbitLastX = e.clientX;
		this.orbitLastY = e.clientY;
		window.vext.SendEvent('controlStart');
	}

	private beginDolly(e: MouseEvent) {
		this.dollyActive = true;
		this.dollyCenter = this.selectionCenter();
		this.dollyLastX = e.clientX;
		this.dollyLastY = e.clientY;
		window.vext.SendEvent('controlStart');
	}

	// Dolly: move the camera toward/away from the selection along the line to it (drag
	// right/up = zoom in), keeping it aimed at the object. Same controlUpdate bridge.
	private updateDolly(e: MouseEvent) {
		if (e.buttons === 0) {
			this.endDolly();
			return;
		}
		const dx = e.clientX - this.dollyLastX;
		const dy = e.clientY - this.dollyLastY;
		this.dollyLastX = e.clientX;
		this.dollyLastY = e.clientY;

		const center = this.dollyCenter;
		const offset = this.camera.position.clone().sub(center);
		const dist = offset.length();
		if (dist < 0.0001) {
			return;
		}
		// Drag right or up = zoom in (proportional so it eases as you approach).
		const move = dx - dy;
		let newDist = dist * (1 - move * 0.004);
		if (newDist < 0.5) newDist = 0.5;
		const newPos = center.clone().add(offset.normalize().multiplyScalar(newDist));
		this.camera.position.copy(newPos);
		this.camera.up.set(0, 1, 0);
		this.camera.lookAt(center);
		this.camera.updateMatrixWorld();

		const transform = new LinearTransform().setFromMatrix(this.camera.matrixWorld);
		window.vext.SendEvent('controlUpdate', { transform });
		this.setPendingRender();
	}

	private endDolly() {
		if (!this.dollyActive) {
			return;
		}
		this.dollyActive = false;
		window.vext.SendEvent('controlEnd');
	}

	// Orbit the camera around the selection on a sphere: horizontal drag = azimuth,
	// vertical drag = elevation, radius (distance to the object) kept constant. The game
	// freecam is driven through the same controlUpdate bridge focus() uses.
	private updateOrbit(e: MouseEvent) {
		if (e.buttons === 0) {
			this.endOrbit();
			return;
		}
		const dx = e.clientX - this.orbitLastX;
		const dy = e.clientY - this.orbitLastY;
		this.orbitLastX = e.clientX;
		this.orbitLastY = e.clientY;

		const center = this.orbitCenter;
		const offset = this.camera.position.clone().sub(center);
		const radius = offset.length();
		if (radius < 0.0001) {
			return;
		}
		let theta = Math.atan2(offset.x, offset.z); // azimuth around +Y
		let phi = Math.acos(THREE.MathUtils.clamp(offset.y / radius, -1, 1)); // polar from +Y

		const sens = 0.01;
		theta -= dx * sens;
		phi -= dy * sens;
		const eps = 0.05;
		phi = THREE.MathUtils.clamp(phi, eps, Math.PI - eps);

		const sinPhi = Math.sin(phi);
		const newOffset = new THREE.Vector3(
			radius * sinPhi * Math.sin(theta),
			radius * Math.cos(phi),
			radius * sinPhi * Math.cos(theta)
		);
		this.camera.position.copy(center.clone().add(newOffset));
		// Keep the camera upright (no roll) like Unreal — the freecam's synced up can be
		// slightly tilted, which would roll lookAt().
		this.camera.up.set(0, 1, 0);
		this.camera.lookAt(center);
		this.camera.updateMatrixWorld();

		const transform = new LinearTransform().setFromMatrix(this.camera.matrixWorld);
		window.vext.SendEvent('controlUpdate', { transform });
		this.setPendingRender();
	}

	private endOrbit() {
		if (!this.orbitActive) {
			return;
		}
		this.orbitActive = false;
		window.vext.SendEvent('controlEnd');
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

		// Gameface port: the gizmo is drawn natively via DebugRenderer, so tell Lua
		// which mode is active ('select' hides it). Mirrors the SetSelection bridge.
		window.vext.SendEvent('SetGizmoMode', mode);

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
			// Gameface port: forward to the native gizmo (see setGizmoMode) + re-push
			// the basis so the gizmo re-orients between world and local immediately.
			window.vext.SendEvent('SetWorldSpace', space);
			this.pushGizmoCenter();
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

	private pendingPickMulti = false;

	private selectWithRaycast(mousePos: Vec2, multiSelection: boolean) {
		this.pendingPickMulti = multiSelection;
		// Browser/emulator (no VEXT/Lua): there is no native physics raycast, so fall
		// back to the original three.js AABB pick against the instanced meshes and feed
		// the resulting guid through the same result handler as the native path.
		if (editor.debug) {
			this.raycastSelection(mousePos).then((guid) => {
				this.onNativePickResult(guid ? guid.toString() : '');
			});
			return;
		}
		// Precise picking: instead of raycasting the overlapping AABB boxes (which
		// often grabs a far object whose bounding box is bigger), send the world ray
		// to Lua for a NATIVE physics raycast against the real collision geometry.
		// Lua maps the hit point back to a GameObject guid and calls onNativePickResult.
		this.raycaster.setFromCamera(mousePos as any, this.camera);
		const o = this.raycaster.ray.origin;
		const d = this.raycaster.ray.direction;
		window.vext.SendEvent('NativePick', { ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z });
	}

	// Called from Lua (window.__onNativePick) with the hit guid string ('' = miss).
	public onNativePickResult(guidStr: string) {
		const multi = this.pendingPickMulti;
		try {
			if (guidStr && guidStr.length > 4) {
				editor.Select(new Guid(guidStr), multi, true);
			} else {
				editor.Select(Guid.createEmpty(), multi);
			}
			this.syncNativeSelection();
		} catch (e) {
			console.error('onNativePickResult', e);
		}
	}

	// Push the current selection to Lua so it draws the native selection boxes + the
	// gizmo. Selecting from the 3D pick does this; the hierarchy tree needs it too,
	// otherwise a tree click selects in JS but nothing shows in the world.
	public syncNativeSelection() {
		// Browser/emulator: there is no native side to draw selection boxes / the gizmo.
		// The JS selection already colours the instanced meshes (SpatialGameEntity.onSelect),
		// so skip the native push (which would otherwise log NotImplemented in the emulator).
		if (editor.debug) {
			return;
		}
		const guids = editor.selectionGroup.selectedGameObjects.map((go: GameObject) => go.guid.toString());
		window.vext.SendEvent('SetSelection', guids);
		this.pushGizmoCenter();
	}

	private highlightWithRaycast(mousePos: Vec2) {
		const now = new Date();
		if (now.getTime() - this.lastRaycastTime.getTime() >= 80) {
			this.lastRaycastTime = now;
			// Browser/emulator (no VEXT/Lua): use the original three.js AABB raycast and the
			// JS highlight path (SpatialGameEntity.onHighlight colours the instanced mesh).
			if (editor.debug) {
				this.raycastSelection(mousePos).then((guid) => {
					if (guid) {
						editor.editorCore.highlight(guid);
					} else {
						editor.editorCore.unhighlight();
					}
				});
				return;
			}
			// Native physics raycast (precise). Lua sets its own hover box directly, so
			// only the exact object under the cursor highlights (no overlapping AABBs).
			this.raycaster.setFromCamera(mousePos as any, this.camera);
			const o = this.raycaster.ray.origin;
			const d = this.raycaster.ray.direction;
			window.vext.SendEvent('NativeHighlight', { ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z });
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

	public updateCameraTransform(transform: ILinearTransform, fov?: number) {
		// Keep the picking camera's FOV in sync with the game's REAL render FOV (per-user,
		// 55 * fovMultiplier, sent from Lua). The pick ray is built from this camera, so a
		// stale/hardcoded FOV made hover/click land on the wrong object away from centre.
		if (typeof fov === 'number' && fov > 0 && Math.abs(fov - this.camera.fov) > 0.01) {
			this.setFov(fov);
		}
		this.cameraControls.updateCameraTransform(transform);
		this.cameraHasMoved = true;
	}

	// gizmoScale in world units, matching NativeViewport.lua exactly.
	private gizmoWorldScale(center: THREE.Vector3): number {
		const dist = this.camera.position.distanceTo(center);
		const factor = dist * Math.min(1.9 * Math.tan((Math.PI * this.camera.fov) / 360), 7);
		return (factor * 0.8) / 4;
	}

	private worldToScreen(v: THREE.Vector3): { x: number; y: number } {
		const p = v.clone().project(this.camera);
		return {
			x: (p.x * 0.5 + 0.5) * window.innerWidth,
			y: (-p.y * 0.5 + 0.5) * window.innerHeight
		};
	}

	// Shortest distance (px) from point P to segment AB.
	private distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
		const dx = bx - ax;
		const dy = by - ay;
		const len2 = dx * dx + dy * dy;
		let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
		t = Math.max(0, Math.min(1, t));
		const cx = ax + t * dx;
		const cy = ay + t * dy;
		return Math.hypot(px - cx, py - cy);
	}

	// Push the current gizmo centre (selectionGroup world origin, like the original
	// TransformControls attach point) to Lua so the native gizmo is drawn exactly
	// where the JS hit-test expects it. Empty selection clears it.
	public pushGizmoCenter() {
		const group = editor.selectionGroup;
		if (group.selectedGameObjects.length === 0) {
			window.vext.SendEvent('SetGizmoCenter', []);
			return;
		}
		group.updateMatrixWorld(true);
		const p = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
		// Basis: world axes, or (local space, single selection) the object's local axes.
		if (this.worldSpace === WORLD_SPACE.local && group.selectedGameObjects.length === 1) {
			const q = new THREE.Quaternion();
			group.selectedGameObjects[0].getWorldQuaternion(q);
			this.gizmoBasisX.set(1, 0, 0).applyQuaternion(q).normalize();
			this.gizmoBasisY.set(0, 1, 0).applyQuaternion(q).normalize();
			this.gizmoBasisZ.set(0, 0, 1).applyQuaternion(q).normalize();
		} else {
			this.gizmoBasisX.set(1, 0, 0);
			this.gizmoBasisY.set(0, 1, 0);
			this.gizmoBasisZ.set(0, 0, 1);
		}
		window.vext.SendEvent('SetGizmoCenter', [p.x, p.y, p.z]);
		window.vext.SendEvent('SetGizmoBasis', [
			this.gizmoBasisX.x,
			this.gizmoBasisX.y,
			this.gizmoBasisX.z,
			this.gizmoBasisY.x,
			this.gizmoBasisY.y,
			this.gizmoBasisY.z,
			this.gizmoBasisZ.x,
			this.gizmoBasisZ.y,
			this.gizmoBasisZ.z
		]);
	}

	// Axes for the drag/hit-test in the current space (world or the object's local).
	private currentAxes(): { name: 'X' | 'Y' | 'Z'; dir: THREE.Vector3 }[] {
		return [
			{ name: 'X', dir: this.gizmoBasisX },
			{ name: 'Y', dir: this.gizmoBasisY },
			{ name: 'Z', dir: this.gizmoBasisZ }
		];
	}

	// Two unit vectors spanning the plane perpendicular to a world axis (used to
	// sample the rotate rings, matching NativeViewport.lua's DrawArc bases).
	private axisPerps(dir: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
		const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
		const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
		const v = new THREE.Vector3().crossVectors(dir, u).normalize();
		return [u, v];
	}

	private readonly gizmoAxes: { name: 'X' | 'Y' | 'Z'; dir: THREE.Vector3 }[] = [
		{ name: 'X', dir: new THREE.Vector3(1, 0, 0) },
		{ name: 'Y', dir: new THREE.Vector3(0, 1, 0) },
		{ name: 'Z', dir: new THREE.Vector3(0, 0, 1) }
	];

	// Pick the axis whose LINE (translate/scale: -0.5..+0.5) is under the cursor.
	private axisLineHitTest(center: THREE.Vector3, g: number, mx: number, my: number) {
		let best = null;
		let bestDist = 9;
		for (const a of this.currentAxes()) {
			const tp = this.worldToScreen(center.clone().addScaledVector(a.dir, 0.5 * g));
			const tn = this.worldToScreen(center.clone().addScaledVector(a.dir, -0.5 * g));
			const d = this.distToSegment(mx, my, tn.x, tn.y, tp.x, tp.y);
			if (d < bestDist) {
				bestDist = d;
				best = a;
			}
		}
		return best;
	}

	// Pick the axis whose RING (rotate: circle r0.5 perpendicular to the axis) is
	// under the cursor.
	private ringHitTest(center: THREE.Vector3, g: number, mx: number, my: number) {
		let best = null;
		let bestDist = 9;
		for (const a of this.currentAxes()) {
			const [u, v] = this.axisPerps(a.dir);
			let prev: { x: number; y: number } | null = null;
			for (let i = 0; i <= 32; i++) {
				const ang = (i / 32) * Math.PI * 2;
				const p = center
					.clone()
					.addScaledVector(u, Math.cos(ang) * 0.5 * g)
					.addScaledVector(v, Math.sin(ang) * 0.5 * g);
				const s = this.worldToScreen(p);
				if (prev) {
					const d = this.distToSegment(mx, my, prev.x, prev.y, s.x, s.y);
					if (d < bestDist) {
						bestDist = d;
						best = a;
					}
				}
				prev = s;
			}
		}
		return best;
	}

	// Returns true if the click grabbed a gizmo handle (a drag has begun), so the
	// caller skips the normal select/deselect. Handles translate/rotate/scale, all
	// reusing the Inspector's selectionGroup path (onClientOnlyMove -> ...MoveEnd).
	private tryBeginGizmoDrag(e: MouseEvent): boolean {
		const mode = this.gizmoMode;
		if (mode !== GIZMO_MODE.translate && mode !== GIZMO_MODE.rotate && mode !== GIZMO_MODE.scale) {
			return false;
		}
		const group = editor.selectionGroup;
		if (group.selectedGameObjects.length === 0) return false;

		group.updateMatrixWorld(true);
		const center = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
		this.camera.updateMatrixWorld();
		const g = this.gizmoWorldScale(center);
		const mx = e.clientX;
		const my = e.clientY;

		// Scale: grabbing the centre box scales all three axes uniformly.
		this.gizmoScaleUniform = false;
		if (mode === GIZMO_MODE.scale) {
			const cs = this.worldToScreen(center);
			if (Math.hypot(mx - cs.x, my - cs.y) < 14) {
				this.gizmoScaleUniform = true;
			}
		}

		const best = this.gizmoScaleUniform
			? { name: 'X' as const, dir: new THREE.Vector3(1, 0, 0) } // placeholder; unused for uniform
			: mode === GIZMO_MODE.rotate
			? this.ringHitTest(center, g, mx, my)
			: this.axisLineHitTest(center, g, mx, my);
		if (!best) return false;

		if (mode === GIZMO_MODE.rotate || this.gizmoScaleUniform) {
			// Rotate drag plane: parallel to the camera (normal towards the camera).
			const normal = new THREE.Vector3().subVectors(this.camera.position, center).normalize();
			this.gizmoDragPlane.setFromNormalAndCoplanarPoint(normal, center);
		} else {
			// Translate/scale drag plane: contains the axis, faces the camera.
			const viewDir = new THREE.Vector3();
			this.camera.getWorldDirection(viewDir);
			const cross = new THREE.Vector3().crossVectors(best.dir, viewDir);
			let normal = new THREE.Vector3().crossVectors(cross, best.dir);
			if (normal.lengthSq() < 1e-6) normal = viewDir.clone();
			normal.normalize();
			this.gizmoDragPlane.setFromNormalAndCoplanarPoint(normal, center);
		}

		this.raycaster.setFromCamera(this.getMousePos(e) as any, this.camera);
		const hit = new THREE.Vector3();
		if (!this.raycaster.ray.intersectPlane(this.gizmoDragPlane, hit)) return false;

		this.gizmoDragMode = mode === GIZMO_MODE.rotate ? 'rotate' : mode === GIZMO_MODE.scale ? 'scale' : 'translate';
		this.gizmoDragDir = best.dir;
		this.gizmoDragAxisName = best.name;
		this.gizmoDragStartHit.copy(hit);
		this.gizmoDragCenter0.copy(center);
		this.gizmoQuatStart.copy(group.quaternion);
		this.gizmoScaleStart.copy(group.scale);
		this.gizmoDragStartMouseY = e.clientY;
		window.vext.SendEvent('controlStart');
		return true;
	}

	private updateGizmoDrag(e: MouseEvent) {
		// Self-heal a dropped mouseup so the drag can't get stuck and eat later clicks.
		if (e.buttons === 0) {
			this.endGizmoDrag();
			return;
		}
		this.raycaster.setFromCamera(this.getMousePos(e) as any, this.camera);
		const hit = new THREE.Vector3();
		if (!this.raycaster.ray.intersectPlane(this.gizmoDragPlane, hit)) return;
		const group = editor.selectionGroup;
		const dir = this.gizmoDragDir;

		if (this.gizmoDragMode === 'translate') {
			const along = hit.clone().sub(this.gizmoDragStartHit).dot(dir);
			const nc = this.gizmoDragCenter0.clone().addScaledVector(dir, along);
			group.setPosition(nc.x, nc.y, nc.z);
		} else if (this.gizmoDragMode === 'scale') {
			if (this.gizmoScaleUniform) {
				// Centre box: uniform scale on all axes by VERTICAL mouse movement --
				// drag up = bigger, drag down = smaller. Factor 1 at grab time.
				const dy = this.gizmoDragStartMouseY - e.clientY; // up (smaller Y) => positive
				let factor = 1 + dy / 200;
				if (factor < 0.01) factor = 0.01;
				group.scale.copy(this.gizmoScaleStart).multiplyScalar(factor);
			} else {
				// Per-axis: factor = (end . axis) / (start . axis), relative to centre.
				const startProj = this.gizmoDragStartHit.clone().sub(this.gizmoDragCenter0).dot(dir);
				const endProj = hit.clone().sub(this.gizmoDragCenter0).dot(dir);
				let factor = Math.abs(startProj) > 1e-4 ? endProj / startProj : 1;
				if (factor < 0.01) factor = 0.01;
				const ns = this.gizmoScaleStart.clone();
				if (this.gizmoDragAxisName === 'X') ns.x *= factor;
				else if (this.gizmoDragAxisName === 'Y') ns.y *= factor;
				else ns.z *= factor;
				group.scale.copy(ns);
			}
			group.onClientOnlyMove();
		} else if (this.gizmoDragMode === 'rotate') {
			// Linear screen-drag -> angle model, matching TransformControls exactly:
			// angle = offset . (axis x eye) * (2 / dist(camera, centre)).
			const offset = hit.clone().sub(this.gizmoDragStartHit);
			const eye = new THREE.Vector3().subVectors(this.camera.position, this.gizmoDragCenter0).normalize();
			const speed = 2 / this.camera.position.distanceTo(this.gizmoDragCenter0);
			const tangent = new THREE.Vector3().crossVectors(dir, eye).normalize();
			const angle = offset.dot(tangent) * speed;
			const q = new THREE.Quaternion().setFromAxisAngle(dir, angle);
			group.quaternion.copy(q).multiply(this.gizmoQuatStart).normalize();
			group.onClientOnlyMove();
		}
		this.pushGizmoCenter();
	}

	private endGizmoDrag() {
		this.gizmoDragMode = null;
		editor.selectionGroup.onClientOnlyMoveEnd();
		window.vext.SendEvent('controlEnd');
	}

	public get isGizmoDragging(): boolean {
		return this.gizmoDragMode !== null;
	}

	// UE-style Ctrl+drag: axis from mouse buttons (LMB=X, RMB=Y, both=Z), amount from
	// horizontal movement, transform type from the current gizmo mode.
	private updateCtrlDrag(e: MouseEvent) {
		const b = e.buttons; // 1=LMB, 2=RMB, 3=both
		if (b === 0) {
			// Self-heal a dropped mouseup.
			this.ctrlDragActive = false;
			editor.selectionGroup.onClientOnlyMoveEnd();
			window.vext.SendEvent('controlEnd');
			return;
		}
		// By colour: LMB = red (X=0), RMB = blue (Z=2), both = green (Y=1).
		const idx = b === 3 ? 1 : b === 2 ? 2 : 0;
		const axis = (idx === 0 ? this.gizmoBasisX : idx === 1 ? this.gizmoBasisY : this.gizmoBasisZ).clone();
		const group = editor.selectionGroup;

		// Project the axis into SCREEN space and move by the mouse displacement ALONG that
		// screen direction, so a drag always follows the axis as seen from the current camera
		// angle (it no longer inverts when the axis is viewed from the opposite side).
		const center = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
		const c2 = center.clone().project(this.camera);
		const t2 = center.clone().add(axis).project(this.camera);
		const sx = t2.x - c2.x;
		const sy = -(t2.y - c2.y); // NDC is y-up; screen/client Y is y-down
		const mdx = e.clientX - this.ctrlDragLastX;
		const mdy = e.clientY - this.ctrlDragLastY;
		this.ctrlDragLastX = e.clientX;
		this.ctrlDragLastY = e.clientY;
		const slen = Math.hypot(sx, sy);
		if (slen < 1e-5) return; // axis points almost straight at/away from the camera
		const delta = (mdx * sx + mdy * sy) / slen;
		if (delta === 0) return;

		if (this.gizmoMode === GIZMO_MODE.translate) {
			group.position.addScaledVector(axis, delta * 0.02);
		} else if (this.gizmoMode === GIZMO_MODE.rotate) {
			const q = new THREE.Quaternion().setFromAxisAngle(axis, delta * 0.01);
			group.quaternion.premultiply(q).normalize();
		} else if (this.gizmoMode === GIZMO_MODE.scale) {
			const f = 1 + delta * 0.005;
			if (idx === 0) group.scale.x = Math.max(0.01, group.scale.x * f);
			else if (idx === 1) group.scale.y = Math.max(0.01, group.scale.y * f);
			else group.scale.z = Math.max(0.01, group.scale.z * f);
		}
		group.onClientOnlyMove();
		this.pushGizmoCenter();
	}

	// Space cycles the gizmo mode translate -> rotate -> scale -> translate.
	public cycleGizmoMode() {
		const order = [GIZMO_MODE.translate, GIZMO_MODE.rotate, GIZMO_MODE.scale];
		const i = order.indexOf(this.gizmoMode);
		this.setGizmoMode(order[(i + 1) % order.length]);
	}
}
