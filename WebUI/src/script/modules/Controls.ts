import { GIZMO_MODE } from '@/script/modules/THREEManager';
import * as THREE from 'three';
export enum KEYCODES {
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

export class Controls {
	constructor() {
		window.addEventListener('keydown', (event: any) => {
			// if (keysdown[e.which]) {
			// 	return;
			// }
			// if($(document.activeElement)[0].tagName == "INPUT") {
			// 	return;
			// }
			// keysdown[e.which] = true;
			if (event.which === KEYCODES.Q) {
				editor.threeManager.SetGizmoMode(GIZMO_MODE.select);
			}
			if (event.which === KEYCODES.W) {
				editor.threeManager.SetGizmoMode(GIZMO_MODE.translate);
			}
			if (event.which === KEYCODES.E) {
				editor.threeManager.SetGizmoMode(GIZMO_MODE.rotate);
			}
			if (event.which === KEYCODES.R) {
				editor.threeManager.SetGizmoMode(GIZMO_MODE.scale);
			}
			if (event.which === KEYCODES.F) {
				editor.threeManager.Focus();
			}
			// if(event.which == 71) { // G
			//
			// }
			// if(event.which == 112) { // F1
			//
			// }
			// if(event.which === KEYCODES.P) { // P
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

			if (event.which === KEYCODES.CTRL) {
				editor.threeManager.EnableGridSnap();
			}
			if (event.which === KEYCODES.X) {
				editor.threeManager.ToggleWorldSpace();
			}
			if (event.which === KEYCODES.DEL) {
				editor.DeleteSelected();
			}
			if (event.which === KEYCODES.F2) {
				editor.vext.SendEvent('DisableFreecam');
			}
		});
	}

	EnableFreecamMovement() {
		editor.vext.SendEvent('EnableFreeCamMovement');

		// Hack to make sure we don't navigate the windows while in freecam.
		// document.activeElement.blur();
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
$(document).keydown(function(e) {

	if (keysdown[e.which]) {
		return;
	}
	if($(document.activeElement)[0].tagName == "INPUT") {
		return;
	}
	console.log(e.which);
	keysdown[e.which] = true;
	if(e.which == 81) { // Q
		editor.threeManager.SetGizmoMode("select")
	}
	if(e.which == 87) { // W
		editor.threeManager.SetGizmoMode("translate")
	}
	if(e.which == 69) { // E
		editor.threeManager.SetGizmoMode("rotate")
	}
	if(e.which == 82) { // R
		editor.threeManager.SetGizmoMode("scale")
	}
	if(e.which == 70) { // F
        editor.Focus();
	}
	if(e.which == 71) { // G

	}
	if(e.which == 112) { // F1

	}
	if(e.which == 80) { // P
		editor.SelectParent();
	}
	if( keysdown[17] && e.which == 68) { // CTRL + D
		editor.Duplicate()
	}
	if( keysdown[17] && e.which == 67) { // CTRL + C
		editor.Copy()
	}
	if( keysdown[17] && e.which == 86) { // CTRL + V
		editor.Paste(); // Paste entity
	}
	if( keysdown[17] && e.which == 88) { // CTRL + X
		editor.Cut(); // Paste entity
	}

	if( keysdown[17] && keysdown[16] && e.which == 90) { // CTRL + Shift + Z
		editor.redo();
		return false;
	} else if( keysdown[17] && e.which == 90) { // CTRL + z
		editor.undo();
		return false;
	}
	if(e.which == 17) { // CTRL
		editor.threeManager.EnableGridSnap()
	}
	if(e.which == 88) { // X
		editor.threeManager.ToggleWorldSpace();
	}
	if(e.which == 46) { // DEL
		editor.DeleteSelected();
	}
	if(e.which == 112) { // F1
		editor.vext.SendEvent('DisableFreecam');
	}
});

$(document).keyup(function(e){
	// Remove this key from the map
	delete keysdown[e.which];
	if(e.which == 17) { // CTRL
		editor.threeManager.DisableGridSnap()
	}
});
*/
