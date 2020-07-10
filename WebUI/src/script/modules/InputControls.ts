import { GIZMO_MODE } from '@/script/modules/THREEManager';
import CameraControls from 'camera-controls';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { Guid } from '@/script/types/Guid';
import { KEYCODE, MOUSE_BUTTONS } from '@/script/types/Enums';

// TODO Fool: add config keymap

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
		if (event.which === KEYCODE.ESCAPE) {
			editor.Select(Guid.createEmpty(), false); // Deselects everything.
		}
	}
}
