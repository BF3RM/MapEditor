class VEXTInterface {


	/*

		In

	 */
	HideGizmo() {
		editor.webGL.HideGizmo();
	}
	ShowGizmo() {
		editor.webGL.ShowGizmo();
	}
	/*

		out

	 */
	
	SendCommands(command) {
		if(editor.debug) {
			this.debugHandle(command);
		} else {
			console.log(JSON.stringify(command));
		}
	}

	ReceiveCommands(command) {
		console.log(JSON.parse(command));
	}
}