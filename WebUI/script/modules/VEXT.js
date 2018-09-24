class VEXTInterface {
	constructor() {
		this.emulator = new VEXTemulator();
		this.commandQueue = [];
		this.commands = {};
		this.commands["SpawnedBlueprint"] = signals.spawnedBlueprint.dispatch;
		this.commands["DestroyedBlueprint"] = signals.destroyedBlueprint.dispatch;
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
		command.sender = editor.playerName;
		if(editor.debug) {
			console.log(command);
			this.emulator.commands[command.type](command);
		} else {
			console.log(JSON.stringify(command));
		}
	}

	HandleResponse(command) {
		if(this.commands[command.type] === undefined) {
			editor.logger.LogError("Failed to call a null signal: " + command.type);
			return;
		}
		console.log(command);
		this.commands[command.type](command);

	}

	OnSpawnReferenceObject(command) {

	}
}

