import CameraControls from 'camera-controls';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { Guid } from '@/script/types/Guid';
import { GIZMO_MODE, KEYCODE, MOUSE_BUTTONS } from '@/script/types/Enums';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { TeleportMouseMessage } from '@/script/messages/TeleportMouseMessage';
import { signals } from '@/script/modules/Signals';

// TODO Fool: add config keymap

export class InputControls {
	public keys: boolean[] = [];
	constructor(element: HTMLCanvasElement) {
		element.addEventListener('keydown', this.onCanvasKeyDown.bind(this));
		window.addEventListener('keydown', this.onKeyDown.bind(this));
		window.addEventListener('mousemove', this.onMouseMove.bind(this));
		element.addEventListener('keyup', this.onKeyUp.bind(this));
		element.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));
		element.addEventListener('mouseup', this.onMouseUp.bind(this));
		element.addEventListener('mousedown', this.onMouseDown.bind(this));
	}

	public static getMousePos(event: MouseEvent): Vec2 {
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

	onCanvasMouseMove(event: MouseEvent) {
		if (event.buttons === 0) {
			editor.threeManager.highlight(InputControls.getMousePos(event));
		}
	}

	onKeyUp(event: KeyboardEvent) {
		this.keys[event.which] = false;
		// Disable camera rotation
		if (event.which === KEYCODE.ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.NONE;
		}
		if (event.which === KEYCODE.CTRL) {
			editor.threeManager.disableGridSnap();
		}
	}

	// Keys that should only work when the canvas is focused
	onCanvasKeyDown(event: KeyboardEvent) {
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
		if (event.which === KEYCODE.CTRL) {
			editor.threeManager.enableGridSnap();
		}
	}

	onKeyDown(event: KeyboardEvent) {
		this.keys[event.which] = true;

		if (event.which === KEYCODE.KEY_X) {
			editor.threeManager.toggleWorldSpace();
		}
		if (event.which === KEYCODE.KEY_F) {
			editor.threeManager.focus();
		}
		if (event.which === KEYCODE.KEY_P) {
			editor.selectionGroup.selectParent();
		}
		// Enable camera rotation
		if (event.which === KEYCODE.ALT) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.ROTATE;
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
		if (event.which === KEYCODE.KEY_S && event.ctrlKey) { // CTRL + S
			signals.saveRequested.emit();
		}
		if (event.which === KEYCODE.DELETE) {
			editor.DeleteSelected();
		}
		if (event.which === KEYCODE.F1) {
			window.vext.SendEvent('DisableEditorMode');
		}
		if (event.which === KEYCODE.F5) {
			window.location = (window as any).location;
		}
		if (event.which === KEYCODE.ESCAPE) {
			editor.DeselectAll();
		}
	}

	public IsKeyDown(keycode: KEYCODE): boolean {
		return this.keys[keycode] === true; // Can also be undefined
	}
}
