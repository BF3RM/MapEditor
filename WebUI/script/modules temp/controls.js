// function EnableKeyboard() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:EnableKeyboard')
// }

// function DisableKeyboard() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DisableKeyboard')
// }
		
function EnableFreecamMovement() {
	editor.vext.SendEvent('EnableFreecamMovement')

	// Hack to make sure we don't navigate the windows while in freecam.
	document.activeElement.blur()
}

// function DisableFreeView() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DisableFreeview')
// }

// function ToggleFreeView() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:ToggleFreeview')
// }


var keysdown = {};

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
		editor.webGL.SetGizmoMode("select")
	}
	if(e.which == 87) { // W
		editor.webGL.SetGizmoMode("translate")
	}
	if(e.which == 69) { // E
		editor.webGL.SetGizmoMode("rotate")
	}
	if(e.which == 82) { // R
		editor.webGL.SetGizmoMode("scale")
	}
	if(e.which == 70) { // F

	}
	if(e.which == 71) { // G

	}
	if(e.which == 112) { // F1

	}
	if(e.which == 80) { // P
		editor.SelectParent();
	}
	if( keysdown[17] && e.which == 68) { // CTRL + D 
		editor.selectedEntity.Clone(editor.selectedEntity.parent); //Clone on orginal entity's parent
	}
	if( keysdown[17] && e.which == 67) { // CTRL + C 
		editor.copiedEntity = editor.selectedEntity; // Copy entity
	}
	if( keysdown[17] && e.which == 86) { // CTRL + V
		editor.Paste(); // Paste entity
	}
	if( keysdown[17] && keysdown[16] && e.which == 68) { // CTRL + SHIFT + D
		editor.selectedEntity.Clone(); //Clone on root
	}

	if( keysdown[17] && keysdown[16] && e.which == 90) { // CTRL + Shift + Z
		editor.redo();
		return false;
	} else if( keysdown[17] && e.which == 90) { // CTRL + z
		editor.undo();
		return false;
	}
	if(e.which == 17) { // CTRL
		editor.webGL.EnableGridSnap()
	}
	if(e.which == 88) { // X
		editor.webGL.ToggleWorldSpace();
	}
	if(e.which == 46) { // DEL
		editor.ui.dialogs["deleteEntity"].dialog("open");
	}
	if(e.which == 112) { // F1
		editor.vext.SendEvent('DisableFreecam');
	}
});

$(document).keyup(function(e){
	// Remove this key from the map
	delete keysdown[e.which];
	if(e.which == 17) { // CTRL
		editor.webGL.DisableGridSnap()
	}
});