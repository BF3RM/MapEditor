import CameraControls from 'camera-controls';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { GIZMO_MODE, KEYCODE, MOUSE_BUTTONS } from '@/script/types/Enums';
import { TeleportMouseMessage } from '@/script/messages/TeleportMouseMessage';
import { signals } from '@/script/modules/Signals';
import { Hotkey, HOTKEY_TYPE } from './Hotkey';
import { HOTKEYS } from './HotkeyConfig';

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
		const element = e.target as HTMLElement;
		if (element && element.tagName && (element.tagName.toUpperCase() === 'INPUT' || element.tagName.toUpperCase() === 'TEXTAREA')) {
			return;
		}

		this.keys[e.which] = false;

		HOTKEYS.filter((hotkey: Hotkey) => hotkey.type === HOTKEY_TYPE.Up).forEach((hotkey: Hotkey) => {
			if (e.which === hotkey.key && (hotkey.needsCtrl ? e.ctrlKey : true) && (hotkey.needsShift ? e.shiftKey : true)) {
				hotkey.callback();
			}
		});
	}

	// Keys that should only work when the canvas is focused
	onCanvasKeyDown(e: KeyboardEvent) {
		HOTKEYS.filter((hotkey: Hotkey) => hotkey.type === HOTKEY_TYPE.CanvasOnlyDown).forEach((hotkey: Hotkey) => {
			if (e.which === hotkey.key && (hotkey.needsCtrl ? e.ctrlKey : true) && (hotkey.needsShift ? e.shiftKey : true)) {
				hotkey.callback();
			}
		});
	}

	onKeyDown(e: KeyboardEvent) {
		const element = e.target as HTMLElement;
		if (element && element.tagName && (element.tagName.toUpperCase() === 'INPUT' || element.tagName.toUpperCase() === 'TEXTAREA')) {
			return;
		}

		this.keys[e.which] = true;

		HOTKEYS.filter((hotkey: Hotkey) => hotkey.type === HOTKEY_TYPE.Down).every((hotkey: Hotkey) => {
			if (e.which === hotkey.key && (hotkey.needsCtrl ? e.ctrlKey : true) && (hotkey.needsShift ? e.shiftKey : true)) {
				hotkey.callback();
				return false;
			}
			return true;
		});
	}

	public IsKeyDown(keycode: KEYCODE): boolean {
		if (typeof keycode === 'string') {
			return false;
		}
		return this.keys[keycode] === true; // Can also be undefined
	}
}
