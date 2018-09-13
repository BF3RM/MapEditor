class VEXTInterface {


	HideGizmo() {
		editor.webGL.HideGizmo();
	}
	ShowGizmo() {
		editor.webGL.ShowGizmo();
	}
	SpawnReferenceObject(object) {
		console.log(object)
	}
	SendCommand(command) {
		if(editor.debug) {
			this.debugHandle(command);
		} else {
			console.log(JSON.stringify(command));
		}
	}
}