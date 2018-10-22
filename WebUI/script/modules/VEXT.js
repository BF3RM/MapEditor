class VEXTInterface {
	constructor() {
		this.emulator = new VEXTemulator();
		this.commandQueue = [];
		this.commands = {
			"SpawnedBlueprint":     signals.spawnedBlueprint.dispatch,
			"DestroyedBlueprint":   signals.destroyedBlueprint.dispatch,
			"SelectedEntity":       signals.selectedEntity.dispatch,
			'SetObjectName':        signals.setObjectName.dispatch,
			'SetTransform':         signals.setTransform.dispatch,
			'SetVariation':         signals.setVariation.dispatch,
		}

		this.messages = {
			'SetCameraTransformMessage': signals.setCameraTransform.dispatch,
			'SetRaycastTransformMessage': signals.setRaycastPosition.dispatch
		}
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
			console.log(command);
			WebUI.Call('DispatchEventLocal', 'MapEditor:ReceiveCommand', JSON.stringify(command));
		}
	}

	HandleResponse(commandRaw) {
		let command = null;
		let emulator = false;
		if (typeof(commandRaw) === "object") {
			command = commandRaw;
			emulator = true;
		} else {
			editor.logger.Log(LOGLEVEL.VERBOSE, commandRaw);
			command = JSON.parse(commandRaw);
		}
		console.log(command);

		if(this.commands[command.type] === undefined) {
			editor.logger.LogError("Failed to call a null signal: " + command.type);
			return;
		}
		if(emulator) {
			let scope = this;
			// delay to simulate transmission time and execution order
			setTimeout(async function() {
				scope.commands[command.type](command)
			}, 10);
		} else {
			this.commands[command.type](command);
		}

	}

	OnSpawnReferenceObject(command) {
		
	}

	SendEvent(eventName, JSONparams){
		if(editor.debug) {
			console.log(eventName);
			if (JSONparams != null){
				console.log(JSONparams);
			}
		} else {
			console.log('MapEditor:' + eventName);
			WebUI.Call('DispatchEventLocal', 'MapEditor:' + eventName, JSONparams);
		}
	}

	SendMessage(message){
		if(editor.debug) {
			console.log(message);
		} else {
			console.log(message);
			WebUI.Call('DispatchEventLocal', 'MapEditor:ReceiveMessage', JSON.stringify(message));
		}
	}

	HandleMessage(message) {
		console.log(message);

	}
}

