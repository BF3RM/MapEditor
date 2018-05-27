function EnableKeyboard() {
	SendEvent('DispatchEventLocal', 'MapEditor:EnableKeyboard')
}

function DisableKeyboard() {
	SendEvent('DispatchEventLocal', 'MapEditor:DisableKeyboard')
}

function EnableFreecam() {
	SendEvent('DispatchEventLocal', 'MapEditor:EnableFreecam')
}

function DisableFreeView() {
	SendEvent('DispatchEventLocal', 'MapEditor:DisableFreeview')
}

function ToggleFreeView() {
	SendEvent('DispatchEventLocal', 'MapEditor:ToggleFreeview')
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