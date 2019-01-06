class VEXTInterface {
	constructor() {
		this.emulator = new VEXTemulator();
		this.commandQueue = [];
		this.commands = {
			"SpawnedBlueprint":     signals.spawnedBlueprint.dispatch,
			"DestroyedBlueprint":   signals.destroyedBlueprint.dispatch,
			"CreatedGroup":     signals.createdGroup.dispatch,
			"DestroyedGroup":   signals.destroyedGroup.dispatch,
			'SetObjectName':        signals.setObjectName.dispatch,
			'SetTransform':         signals.setTransform.dispatch,
			'SetVariation':         signals.setVariation.dispatch,
		}

		this.messages = {
			'SetCameraTransformMessage':			signals.setCameraTransform.dispatch,
			'SetRaycastTransformMessage':			signals.setRaycastPosition.dispatch,
			'SetPlayerNameMessage':       			signals.setPlayerName.dispatch,
			'SetScreenToWorldPositionMessage':		signals.setScreenToWorldPosition.dispatch,
			'SetUpdateRateMessage':					signals.setUpdateRateMessage.dispatch
			// 'SelectedGameObject':       signals.selectedGameObject.dispatch,
			// 'DeselectedGameObject':    signals.deselectedGameObject.dispatch,
		}
	}


	/*

		In

	 */
	HideGizmo() {
		editor.threeManager.HideGizmo();
	}
	ShowGizmo() {
		editor.threeManager.ShowGizmo();
	}
	/*

		out

	 */

	SendCommand(command) {
		command.sender = editor.playerName;
		if(editor.debug) {
			editor.logger.Log(LOGLEVEL.VERBOSE, "OUT: ");
			editor.logger.Log(LOGLEVEL.VERBOSE, command);
			this.emulator.commands[command.type](command);
		} else {
			console.log(command);
			WebUI.Call('DispatchEventLocal', 'MapEditor:SendToServer', JSON.stringify(command));
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
		editor.logger.Log(LOGLEVEL.VERBOSE, "IN: ");
		editor.logger.Log(LOGLEVEL.VERBOSE, command);

		if(this.commands[command.type] === undefined) {
			editor.logger.LogError("Failed to call a null signal: " + command.type);
			return;
		}
		if(emulator) {
			let scope = this;
			// delay to simulate tick increase.
			setTimeout(async function() {
				scope.commands[command.type](command)
			}, 1);
		} else {
			this.commands[command.type](command);
		}
	}

	OnSpawnReferenceObject(command) {
		
	}

	SendEvent(eventName, param){
		if(editor.debug) {
			console.log(eventName);
			if (param != null){
				console.log(param);
			}
		} else {
			console.log('MapEditor:' + eventName);
			WebUI.Call('DispatchEventLocal', 'MapEditor:' + eventName, JSON.stringify(param));
		}
	}

	SendMessage(message){
		if(editor.debug) {
			editor.logger.Log(LOGLEVEL.VERBOSE, message);
		} else {
			console.log(message);
			WebUI.Call('DispatchEventLocal', 'MapEditor:ReceiveMessage', JSON.stringify(message));
		}
	}

	HandleMessage(messageRaw) {
		let message;
		let emulator = false;
		if (typeof(messageRaw) === "object") {
			message = messageRaw;
			emulator = true;
		} else {
			editor.logger.Log(LOGLEVEL.VERBOSE, messageRaw);
			message = JSON.parse(messageRaw);
		}

		editor.logger.Log(LOGLEVEL.VERBOSE, "IN: ");
		editor.logger.Log(LOGLEVEL.VERBOSE, message);

		if(this.messages[message.type] === undefined) {
			editor.logger.LogError("Failed to call a null signal: " + message.type);
			return;
		}
		if(emulator) {
			let scope = this;
			// delay to simulate tick increase.
			setTimeout(async function() {
				scope.messages[message.type](message)
			}, 1);
		} else {
			this.commands[message.type](message);
		}

	}
}

