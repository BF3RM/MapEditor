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