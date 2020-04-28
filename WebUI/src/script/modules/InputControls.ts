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

// TODO Fool: Move to enum file
export enum KEYCODE {
	BACKSPACE = 8,
	TAB = 9,
	ENTER = 13,
	SHIFT = 16,
	CTRL = 17,
	ALT = 18,
	PAUSE = 19,
	CAPS_LOCK = 20,
	ESCAPE = 27,
	SPACE = 32,
	PAGE_UP = 33,
	PAGE_DOWN = 34,
	END = 35,
	HOME = 36,
	LEFT_ARROW = 37,
	UP_ARROW = 38,
	RIGHT_ARROW = 39,
	DOWN_ARROW = 40,
	INSERT = 45,
	DELETE = 46,
	KEY_0 = 48,
	KEY_1 = 49,
	KEY_2 = 50,
	KEY_3 = 51,
	KEY_4 = 52,
	KEY_5 = 53,
	KEY_6 = 54,
	KEY_7 = 55,
	KEY_8 = 56,
	KEY_9 = 57,
	KEY_A = 65,
	KEY_B = 66,
	KEY_C = 67,
	KEY_D = 68,
	KEY_E = 69,
	KEY_F = 70,
	KEY_G = 71,
	KEY_H = 72,
	KEY_I = 73,
	KEY_J = 74,
	KEY_K = 75,
	KEY_L = 76,
	KEY_M = 77,
	KEY_N = 78,
	KEY_O = 79,
	KEY_P = 80,
	KEY_Q = 81,
	KEY_R = 82,
	KEY_S = 83,
	KEY_T = 84,
	KEY_U = 85,
	KEY_V = 86,
	KEY_W = 87,
	KEY_X = 88,
	KEY_Y = 89,
	KEY_Z = 90,
	LEFT_META = 91,
	RIGHT_META = 92,
	SELECT = 93,
	NUMPAD_0 = 96,
	NUMPAD_1 = 97,
	NUMPAD_2 = 98,
	NUMPAD_3 = 99,
	NUMPAD_4 = 100,
	NUMPAD_5 = 101,
	NUMPAD_6 = 102,
	NUMPAD_7 = 103,
	NUMPAD_8 = 104,
	NUMPAD_9 = 105,
	MULTIPLY = 106,
	ADD = 107,
	SUBTRACT = 109,
	DECIMAL = 110,
	DIVIDE = 111,
	F1 = 112,
	F2 = 113,
	F3 = 114,
	F4 = 115,
	F5 = 116,
	F6 = 117,
	F7 = 118,
	F8 = 119,
	F9 = 120,
	F10 = 121,
	F11 = 122,
	F12 = 123,
	NUM_LOCK = 144,
	SCROLL_LOCK = 145,
	SEMICOLON = 186,
	EQUALS = 187,
	COMMA = 188,
	DASH = 189,
	PERIOD = 190,
	FORWARD_SLASH = 191,
	GRAVE_ACCENT = 192,
	OPEN_BRACKET = 219,
	BACK_SLASH = 220,
	CLOSE_BRACKET = 221,
	SINGLE_QUOTE = 222
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
			editor.threeManager.highlight(InputControls.getMousePos(event));
		}
	}

	onKeyUp(event: KeyboardEvent) {
		// Disable camera rotation
		if (event.which === KEYCODE.ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.NONE;
		}
		if (event.which === KEYCODE.CTRL) {
			editor.threeManager.disableGridSnap();
		}
	}

	onKeyDown(event: KeyboardEvent) {
		// Enable camera rotation
		if (event.which === KEYCODE.ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.ROTATE;
		}
		if (event.which === KEYCODE.KEY_Q) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.select);
		}
		if (event.which === KEYCODE.KEY_W) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.translate);
		}
		if (event.which === KEYCODE.KEY_E) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.rotate);
		}
		if (event.which === KEYCODE.KEY_R) {
			editor.threeManager.setGizmoMode(GIZMO_MODE.scale);
		}
		if (event.which === KEYCODE.KEY_F) {
			editor.threeManager.focus();
		}
		if (event.which === KEYCODE.KEY_P) {
			editor.selectionGroup.selectParent();
		}
		if (event.which === KEYCODE.KEY_Z && event.ctrlKey && event.shiftKey) { // CTRL + Shift + Z
			editor.redo();
			return false;
		} else if (event.which === KEYCODE.KEY_Z && event.ctrlKey) { // CTRL + z
			editor.undo();
			return false;
		}

		if (event.which === KEYCODE.KEY_D && event.ctrlKey) { // CTRL + D
			editor.Duplicate();
		}
		if (event.which === KEYCODE.KEY_C && event.ctrlKey) { // CTRL + C
			editor.Copy();
		}
		if (event.which === KEYCODE.KEY_V && event.ctrlKey) { // CTRL + V
			editor.Paste();
		}
		if (event.which === KEYCODE.KEY_X && event.ctrlKey) { // CTRL + X
			editor.Cut();
		}
		if (event.which === KEYCODE.CTRL) {
			editor.threeManager.enableGridSnap();
		}
		if (event.which === KEYCODE.KEY_X) {
			editor.threeManager.toggleWorldSpace();
		}
		if (event.which === KEYCODE.DELETE) {
			editor.DeleteSelected();
		}
		if (event.which === KEYCODE.F2) {
			editor.vext.SendEvent('DisableFreecam');
		}
	}
}
