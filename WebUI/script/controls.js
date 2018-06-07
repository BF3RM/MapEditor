function EnableKeyboard() {
	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:EnableKeyboard')
}

function DisableKeyboard() {
	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DisableKeyboard')
}

function EnableFreecam() {
	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:EnableFreecam')
}

function DisableFreeView() {
	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:DisableFreeview')
}

function ToggleFreeView() {
	editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:ToggleFreeview')
}


var keysdown = {};


$(document).keydown(function(e) {

	if (keysdown[e.which]) {
		return;
	}
	keysdown[e.which] = true;
	if(e.which == 87) { // W

	}
	if(e.which == 69) { // E

	}
	if(e.which == 82) { // R

	}
	if(e.which == 70) { // F

	}
	if(e.which == 70) { // R

	}
	if(e.which == 112) { // F1

	}
});

$(document).keyup(function(e){
	// Remove this key from the map
	delete keysdown[e.which];
});