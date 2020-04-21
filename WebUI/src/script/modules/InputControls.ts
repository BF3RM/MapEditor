import { GIZMO_MODE } from '@/script/modules/THREEManager';
import CameraControls from 'camera-controls';
import { Vec2 } from '@/script/types/primitives/Vec2';

// TODO Fool: add config keymap

export enum MOUSE_BUTTONS {
	NONE = 0,
	LEFT_CLICK = 1,
	RIGHT_CLICK = 2,
	MIDDLE_CLICK = 4
}

export enum KEYCODE {
	P = 80,
	Q = 81,
	W = 87,
	D = 68,
	E = 69,
	R = 82,
	F = 70,
	Z = 90,
	C = 67,
	V = 86,
	CTRL = 17,
	LEFT_ALT = 18,
	X = 88,
	DEL = 46,
	F2 = 113
}

export class InputControls {
	constructor(element: HTMLCanvasElement) {
		element.addEventListener('keydown', this.onKeyDown.bind(this));
		element.addEventListener('keyup', this.onKeyUp.bind(this));
		element.addEventListener('mousemove', this.onMouseMove.bind(this));
		element.addEventListener('mouseup', this.onMouseUp.bind(this));
		element.addEventListener('mousedown', this.onMouseDown.bind(this));
	}

	private static getMousePos(event: MouseEvent): Vec2 {
		const mousePos = new Vec2();
		mousePos.x = (event.clientX / window.innerWidth) * 2 - 1;
		mousePos.y = -(event.clientY / window.innerHeight) * 2 + 1;
		return mousePos;
	}

	onMouseDown(event: MouseEvent) {
		let selectionEnabled = false;
		let multiSelection = false;

		switch (event.buttons) {
		case MOUSE_BUTTONS.LEFT_CLICK:
			selectionEnabled = !event.altKey; // Alt key is used for rotating camera
			multiSelection = event.ctrlKey;
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

		editor.threeManager.onMouseDown(selectionEnabled, multiSelection, InputControls.getMousePos(event));
	}

	onMouseUp(event: MouseEvent) {
		const scope = this;

		if (event.button === 0) {
			console.log(event.button);
			editor.threeManager.enableCameraControls();
		}
	}

	onMouseMove(event: MouseEvent) {
		if (event.buttons === 0) {
			// editor.threeManager.highlight(InputControls.getMousePos(event));
		}
	}

	onKeyUp(event: KeyboardEvent) {
		// Disable camera rotation
		if (event.which === KEYCODE.LEFT_ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.NONE;
		}
		if (event.which === KEYCODE.CTRL) {
			editor.threeManager.disableGridSnap();
		}
	}

	onKeyDown(event: KeyboardEvent) {
		// Enable camera rotation
		if (event.which === KEYCODE.LEFT_ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.ROTATE;
		}
		if (event.which === KEYCODE.Q) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.select);
		}
		if (event.which === KEYCODE.W) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.translate);
		}
		if (event.which === KEYCODE.E) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.rotate);
		}
		if (event.which === KEYCODE.R) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.scale);
		}
		if (event.which === KEYCODE.F) {
			editor.threeManager.focus();
		}
		if (event.which === KEYCODE.P) {
			editor.selectionGroup.selectParent();
		}
		if (event.which === KEYCODE.Z && event.ctrlKey && event.shiftKey) { // CTRL + Shift + Z
			editor.redo();
			return false;
		} else if (event.which === KEYCODE.Z && event.ctrlKey) { // CTRL + z
			editor.undo();
			return false;
		}

		if (event.which === KEYCODE.D && event.ctrlKey) { // CTRL + D
			editor.Duplicate();
		}
		if (event.which === KEYCODE.C && event.ctrlKey) { // CTRL + C
			editor.Copy();
		}
		if (event.which === KEYCODE.V && event.ctrlKey) { // CTRL + V
			editor.Paste();
		}
		if (event.which === KEYCODE.X && event.ctrlKey) { // CTRL + X
			editor.Cut();
		}
		if (event.which === KEYCODE.CTRL) {
			editor.threeManager.enableGridSnap();
		}
		if (event.which === KEYCODE.X) {
			editor.threeManager.toggleWorldSpace();
		}
		if (event.which === KEYCODE.DEL) {
			editor.DeleteSelected();
		}
		if (event.which === KEYCODE.F2) {
			editor.vext.SendEvent('DisableFreecam');
		}
	}
}
