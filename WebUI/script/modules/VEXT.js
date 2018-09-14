class VEXTInterface {
	constructor() {
		this.commandQueue = [];
		this.commands = {}
		this.commands['SpawnReferenceObjectCommand'] = this.OnSpawnReferenceObject
	}


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
	
	SendCommand(command) {
		if(editor.debug) {
			this.debugHandle(command)
		} else {
			console.log(JSON.stringify(command));
		}
	}

	ReceiveCommands(command) {
		console.log(JSON.parse(command));
	}

	debugHandle(command) {
		console.log(command)
		this.commands[command.type](command);
	}

	OnSpawnReferenceObject(command) {
		console.log(command);
	}
}

