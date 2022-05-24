import CameraControls from 'camera-controls';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { GIZMO_MODE, KEYCODE, MOUSE_BUTTONS } from '@/script/types/Enums';
import { TeleportMouseMessage } from '@/script/messages/TeleportMouseMessage';
import { signals } from '@/script/modules/Signals';

// TODO Fool: add config keymap

export class InputControls {
	public keys: boolean[] = [];
	private wasMKeyDown: boolean = false;

	constructor(element: HTMLCanvasElement) {
		element.addEventListener('keydown', this.onCanvasKeyDown.bind(this));
		window.addEventListener('keydown', this.onKeyDown.bind(this));
		window.addEventListener('mousemove', this.onMouseMove.bind(this));
		element.addEventListener('keyup', this.onKeyUp.bind(this));
		element.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));
		element.addEventListener('mouseup', this.onMouseUp.bind(this));
		element.addEventListener('mousedown', this.onMouseDown.bind(this));
	}

	public static getMousePos(e: MouseEvent): Vec2 {
		const mousePos = new Vec2();
		mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
		mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
		return mousePos;
	}

	onMouseDown(e: MouseEvent) {
		let selectionEnabled = false;
		let multiSelection = false;

		switch (e.buttons) {
		case MOUSE_BUTTONS.LEFT_CLICK:
			if (e.shiftKey) {
				// Box selection
				editor.threeManager.selectionWrapper.initBoxSelection(e);
				return;
			}
			selectionEnabled = !e.altKey; // Alt key is used for rotating camera
			multiSelection = e.ctrlKey;
			break;
		case MOUSE_BUTTONS.MIDDLE_CLICK:
			break;
		case MOUSE_BUTTONS.RIGHT_CLICK:
			editor.threeManager.enableFreecamMovement();
			break;
		default:
			// alert('You have a strange Mouse!');
			break;
		}

		editor.threeManager.onMouseDown(selectionEnabled, multiSelection, InputControls.getMousePos(e));
	}

	onMouseUp(e: MouseEvent) {
		const scope = this;
		if (e.button === 0) {
			editor.threeManager.enableCameraControls();
		}
	}

	prevX = 0;
	prevY = 0;

	public movementX = 0;
	public movementY = 0;
	// Mouse is teleporting to the other side
	isTeleporting = false;

	onMouseMove(e: MouseEvent) {
		if (!this.isTeleporting) {
			this.movementX = (this.prevX ? e.screenX - this.prevX : 0);
			this.movementY = (this.prevY ? e.screenY - this.prevY : 0);
			this.prevX = e.screenX;
			this.prevY = e.screenY;
		}
	}

	public TeleportMouse(e: MouseEvent, direction: string) {
		const message = new TeleportMouseMessage(new Vec2(e.clientX, e.clientY), direction);
		if (direction === 'right') {
			this.prevX = e.screenX - 5;
			this.movementX = 0;
		}
		if (direction === 'left') {
			this.prevX = 5;
			this.movementX = 0;
		}
		this.isTeleporting = true;
		setTimeout(() => {
			this.isTeleporting = false;
		}, 1);
		window.vext.SendMessage(message);
	}

	onCanvasMouseMove(e: MouseEvent) {
		if (e.buttons === 0) {
			editor.threeManager.highlight(InputControls.getMousePos(e));
		}
	}

	onKeyUp(e: KeyboardEvent) {
		this.keys[e.which] = false;
		// Disable camera rotation
		if (e.which === KEYCODE.ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.NONE;
		}
		if (e.which === KEYCODE.CTRL) {
			editor.threeManager.disableGridSnap();
		}
		if (e.which === KEYCODE.KEY_M) {
			this.wasMKeyDown = false;
			editor.threeManager.DisableMiniBrushMode();
		}
	}

	// Keys that should only work when the canvas is focused
	onCanvasKeyDown(e: KeyboardEvent) {
		if (e.which === KEYCODE.KEY_Q) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.select);
		}
		if (e.which === KEYCODE.KEY_W) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.translate);
		}
		if (e.which === KEYCODE.KEY_E) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.rotate);
		}
		if (e.which === KEYCODE.KEY_R) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.scale);
		}
		if (e.which === KEYCODE.CTRL) {
			editor.threeManager.enableGridSnap();
		}
	}

	onKeyDown(e: KeyboardEvent) {
		const element = e.target as HTMLElement;
		if (element && element.tagName && (element.tagName.toUpperCase() === 'INPUT' || element.tagName.toUpperCase() === 'TEXTAREA')) {
			return;
		}

		this.keys[e.which] = true;

		if (e.which === KEYCODE.KEY_X) {
			editor.threeManager.toggleWorldSpace();
		}
		if (e.which === KEYCODE.KEY_F) {
			editor.threeManager.focus();
		}
		if (e.which === KEYCODE.KEY_P) {
			editor.selectionGroup.selectParent();
		}
		// Enable camera rotation
		if (e.which === KEYCODE.ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.ROTATE;
		}
		if (e.which === KEYCODE.KEY_Z && e.ctrlKey && e.shiftKey) { // CTRL + Shift + Z
			editor.redo();
			return false;
		} else if (e.which === KEYCODE.KEY_Z && e.ctrlKey) { // CTRL + z
			editor.undo();
			return false;
		}
		if (e.which === KEYCODE.KEY_D && e.ctrlKey) { // CTRL + D
			editor.Duplicate();
		}
		if (e.which === KEYCODE.KEY_C && e.ctrlKey) { // CTRL + C
			editor.Copy();
		}
		if (e.which === KEYCODE.KEY_V && e.ctrlKey) { // CTRL + V
			editor.Paste();
		}
		if (e.which === KEYCODE.KEY_X && e.ctrlKey) { // CTRL + X
			editor.Cut();
		}
		if (e.which === KEYCODE.KEY_S && e.ctrlKey) { // CTRL + S
			signals.saveRequested.emit();
		}
		if (e.which === KEYCODE.DELETE) {
			editor.DeleteSelected();
		}
		if (e.which === KEYCODE.F1) {
			window.vext.SendEvent('DisableEditorMode');
		}
		if (e.which === KEYCODE.F5) {
			window.location = (window as any).location;
		}
		if (e.which === KEYCODE.ESCAPE) {
			editor.DeselectAll();
		}
		if (e.which === KEYCODE.KEY_M) {
			if (!this.wasMKeyDown) {
				this.wasMKeyDown = true;
				editor.threeManager.EnableMiniBrushMode();
			}
		}
	}

	public IsKeyDown(keycode: KEYCODE): boolean {
		return this.keys[keycode] === true; // Can also be undefined
	}
}
