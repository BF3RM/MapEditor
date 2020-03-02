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
	E = 69,
	R = 82,
	F = 70,
	CTRL = 17,
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
		switch (event.buttons) {
		case MOUSE_BUTTONS.LEFT_CLICK:
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

		const selectionEnabled = event.buttons === MOUSE_BUTTONS.LEFT_CLICK && !event.ctrlKey;
		editor.threeManager.onMouseDown(selectionEnabled, InputControls.getMousePos(event));
	}

	onMouseUp(event: MouseEvent) {
		const scope = this;

		if (event.button === 0) {
			console.log(event.button);
			editor.threeManager.enableCameraControls();
		}
	}

	onMouseMove(event: MouseEvent) {
		// TODO Fool: reimplement
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
		// if (scope.highlightingEnabled && event.buttons === 0) {
		if (event.buttons === 0) {
			editor.threeManager.highlight(InputControls.getMousePos(event));
		}
	}

	onKeyUp(event: KeyboardEvent) {
		if (event.which === KEYCODE.CTRL) {
			editor.threeManager.cameraControls.mouseButtons.left = CameraControls.ACTION.NONE;
		}
	}

	onKeyDown(event: KeyboardEvent) {
		// if (keysdown[e.which]) {
		// 	return;
		// }
		// if($(document.activeElement)[0].tagName == "INPUT") {
		// 	return;
		// }
		// keysdown[e.which] = true;
		if (event.which === KEYCODE.CTRL) {
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
		// if(event.which == 71) { // G
		//
		// }
		// if(event.which == 112) { // F1
		//
		// }
		// if(event.which === KEYCODE.P) { // P
		// 	// editor.SelectParent();
		// }
		// if( keysdown[17] && e.which == 68) { // CTRL + D
		// 	editor.Duplicate()
		// }
		// if( keysdown[17] && e.which == 67) { // CTRL + C
		// 	editor.Copy()
		// }
		// if( keysdown[17] && e.which == 86) { // CTRL + V
		// 	editor.Paste(); // Paste entity
		// }
		// if( keysdown[17] && e.which == 88) { // CTRL + X
		// 	editor.Cut(); // Paste entity
		// }

		// if( keysdown[17] && keysdown[16] && e.which == 90) { // CTRL + Shift + Z
		// 	editor.redo();
		// 	return false;
		// } else if( keysdown[17] && e.which == 90) { // CTRL + z
		// 	editor.undo();
		// 	return false;
		// }

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

// function EnableKeyboard() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:EnableKeyboard')
// }

// function DisableKeyboard() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DisableKeyboard')
// }

// function DisableFreeView() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DisableFreeview')
// }

// function ToggleFreeView() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:ToggleFreeview')
// }

/*
$(document).keyup(function(e){
	// Remove this key from the map
	delete keysdown[e.which];
	if(e.which == 17) { // CTRL
		editor.threeManager.disableGridSnap()
	}
});
*/
