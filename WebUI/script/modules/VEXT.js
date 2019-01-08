class VEXTInterface {
	constructor() {
		this.emulator = new VEXTemulator();
		this.commandQueue = [];
		this.commands = {
			"SpawnedBlueprint":	 signals.spawnedBlueprint.dispatch,
			"DestroyedBlueprint":   signals.destroyedBlueprint.dispatch,
			"CreatedGroup":	 signals.createdGroup.dispatch,
			"DestroyedGroup":   signals.destroyedGroup.dispatch,
			'SetObjectName':		signals.setObjectName.dispatch,
			'SetTransform':		 signals.setTransform.dispatch,
			'SetVariation':		 signals.setVariation.dispatch,
		}

		this.messages = {
			'SetCameraTransformMessage':			signals.setCameraTransform.dispatch,
			'SetRaycastTransformMessage':			signals.setRaycastPosition.dispatch,
			'SetPlayerNameMessage':	   			signals.setPlayerName.dispatch,
			'SetScreenToWorldPositionMessage':		signals.setScreenToWorldPosition.dispatch,
			'SetUpdateRateMessage':					signals.setUpdateRateMessage.dispatch
			// 'SelectedGameObject':	   signals.selectedGameObject.dispatch,
			// 'DeselectedGameObject':	signals.deselectedGameObject.dispatch,
		}

		this.paused = false;
		this.executing = false;

		this.queued = [];
	}
	/*

		Internal

	 */
	Pause() {
		this.paused = true;
	}
	Resume() {
		this.paused = false;
		this.SendCommands(this.queued);
		this.queued = [];
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
		let scope = this;
		// If we're not sending an array of commands, make us send an array of commands.

		command.sender = editor.playerName;

		if(this.paused) {
			this.queued.push(command)
		} else {
			//Sending this individual command as an array of commands
			this.SendCommands([command]);
		}
	}

	SendCommands(commands) {
		if(commands.length === 0) {
			return;
		}
		let scope = this;
		if(editor.debug) {
			editor.logger.Log(LOGLEVEL.VERBOSE, "OUT: ");
			editor.logger.Log(LOGLEVEL.VERBOSE, commands);
			scope.emulator.Receive(commands);
		} else {
			console.log(commands);
			editor.logger.Log(LOGLEVEL.VERBOSE, "OUT: ");
			editor.logger.Log(LOGLEVEL.VERBOSE, commands);
			WebUI.Call('DispatchEventLocal', 'MapEditor:SendToServer', JSON.stringify(commands));
		}
	}

	HandleResponse(responsesRaw, emulator) {
		var t0 = performance.now();

		let scope = this;
		scope.executing = true;
		let commands = JSON.parse(responsesRaw);
		let index = 0;

		editor.logger.Log(LOGLEVEL.VERBOSE, "IN: ");
		editor.logger.Log(LOGLEVEL.VERBOSE, commands);

		commands.forEach(function (command) {
			if(scope.commands[command.type] === undefined) {
				editor.logger.LogError("Failed to call a null signal: " + command.type);
				return;
			}
			if(index === commands.length - 1) {
				scope.executing = false;
			}
			scope.commands[command.type](command);
			index++;

		});
		console.log("Done executing");
		var t1 = performance.now();
		console.log("Execution took " + (t1 - t0) + " milliseconds.");
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

