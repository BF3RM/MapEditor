// function EnableKeyboard() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:EnableKeyboard')
// }

// function DisableKeyboard() {
// 	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DisableKeyboard')
// }
		
function EnableFreecam() {
	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:EnableFreecam')
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
	if(e.which == 70) { // R

	}
	if(e.which == 112) { // F1

	}
	if(e.which == 80) { // P
		editor.SelectParent();
	}
	if(e.which == 79) { // O
		editor.selectedEntity.Clone();
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
});

$(document).keyup(function(e){
	// Remove this key from the map
	delete keysdown[e.which];
	if(e.which == 17) { // CTRL
		editor.webGL.DisableGridSnap()
	}
});

document.addEventListener('mousemove', function (e) {
	mousePos.x = ( e.clientX / window.innerWidth ) * 2 - 1;
	mousePos.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
});
