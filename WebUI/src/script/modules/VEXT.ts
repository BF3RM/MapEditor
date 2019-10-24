import Command from '../libs/three/Command';
import {VEXTemulator} from '@/script/modules/VEXTemulator';
import {CommandActionResult} from '@/script/types/CommandActionResult';
import {LOGLEVEL} from '@/script/types/primitives/LogLevel';
import * as Collections from 'typescript-collections';
import {Guid} from 'guid-typescript';
import {GameObject} from '@/script/types/GameObject';


export default class VEXTInterface {
	public emulator: VEXTemulator;
	public commandQueue: Command[];
	public commands: any;
	public messages: any;
	public paused: boolean;
	public executing: boolean;
	public queued: {
		commands: Command[],
		messages: object[];
	};

	constructor() {
		this.emulator = new VEXTemulator();
		this.commandQueue = [];
		this.commands = {
			SpawnedBlueprint:       signals.spawnedBlueprint.dispatch,
			BlueprintSpawnInvoked:  signals.blueprintSpawnInvoked.dispatch,
			DestroyedBlueprint:     signals.destroyedBlueprint.dispatch,
			CreatedGroup:           signals.createdGroup.dispatch,
			DestroyedGroup:         signals.destroyedGroup.dispatch,
			SetObjectName:		    signals.setObjectName.dispatch,
			SetTransform:		    signals.setTransform.dispatch,
			SetVariation:		    signals.setVariation.dispatch,
			EnabledBlueprint:		signals.enabledBlueprint.dispatch,
			DisabledBlueprint:		signals.disabledBlueprint.dispatch,
		};

		this.messages = {
			SetCameraTransformMessage:			signals.setCameraTransform.dispatch,
			SetRaycastTransformMessage:			signals.setRaycastPosition.dispatch,
			SetPlayerNameMessage:	   			signals.setPlayerName.dispatch,
			SetScreenToWorldPositionMessage:	signals.setScreenToWorldPosition.dispatch,
			SetUpdateRateMessage:				signals.setUpdateRateMessage.dispatch,
			// 'SelectedGameObject':	   signals.selectedGameObject.dispatch,
			// 'DeselectedGameObject':	signals.deselectedGameObject.dispatch,
		};

		this.paused = false;
		this.executing = false;

		this.queued = {
			commands: [],
			messages: [],
		};
	}
	/*

		Internal

	 */
	public Pause() {
		this.paused = true;
	}
	public Resume() {
		this.paused = false;
		if (this.queued.commands.length > 0) {
			this.SendCommands(this.queued.commands);
			this.queued.commands = [];
		}
		if (this.queued.messages.length > 0) {
			this.SendMessage(this.queued.messages);
			this.queued.messages = [];
		}
	}

	/*

		In

	 */

	public HideGizmo() {
		editor.threeManager.HideGizmo();
	}
	public ShowGizmo() {
		editor.threeManager.ShowGizmo();
		window.editor.threeManager.ShowGizmo();
	}
	/*

		out

	 */

	public SendCommand(command: Command) {
		command.sender = editor.playerName;

		if (this.paused) {
			this.queued.commands.push(command);
		} else {
			// Sending this individual command as an array of commands
			this.SendCommands([command]);
		}
	}

	public SendCommands(commands: Command[]) {
		if (commands.length === 0) {
			return;
		}

		const scope = this;
		if (editor.debug) {
			Log(LOGLEVEL.VERBOSE, 'OUT: ');
			Log(LOGLEVEL.VERBOSE, commands);
			scope.emulator.Receive(commands);
		} else {
			console.log(commands);
			Log(LOGLEVEL.VERBOSE, 'OUT: ');
			Log(LOGLEVEL.VERBOSE, commands);
			// @ts-ignore
			WebUI.Call('DispatchEventLocal', 'MapEditor:SendToServer', JSON.stringify(commands));
		}
	}

	public HandleResponse(commandActionResultsString: string, emulator: boolean) {
		console.log(commandActionResultsString);
		const t0 = performance.now();

		const scope = this;
		scope.executing = true;
		let commandActionResults = JSON.parse(commandActionResultsString) as CommandActionResult[];
		let index = 0;

		Log(LOGLEVEL.VERBOSE, 'IN: ');
		Log(LOGLEVEL.VERBOSE, commandActionResults);

		// convert commandActionResults to an array if it's an object
		if (typeof commandActionResults === 'object') {
			commandActionResults = Object.values(commandActionResults);
		}

		commandActionResults.forEach((commandActionResult: CommandActionResult) => {
			if (scope.commands[commandActionResult.type] === undefined) {
				LogError('Failed to call a null signal: ' + commandActionResult.type);
				return;
			}
			if (index === commandActionResults.length - 1) {
				scope.executing = false;
			}


			scope.commands[commandActionResult.type](commandActionResult);
			index++;

		});
		console.log('Done executing');
		const t1 = performance.now();
		console.log('Execution took ' + (t1 - t0) + ' milliseconds.');
		editor.threeManager.Render();
	}

	public SendEvent(eventName: string, param: any) {
		if (editor.debug) {
			console.log(eventName);
			if (param != null) {
				console.log(param);
			}
		} else {
			console.log('MapEditor:' + eventName);
			WebUI.Call('DispatchEventLocal', 'MapEditor:' + eventName, JSON.stringify(param));
		}
	}

	public SendMessage(message: any) {
		if (message == null) {
			console.log('NIL?!');
		}
		const scope = this;
		// If we're not sending an array of commands, make us send an array of commands.

		message.sender = editor.playerName;

		if (this.paused) {
			this.queued.messages.push(message);
		} else {
			// Sending this individual command as an array of commands
			this.SendMessages([message]);
		}
	}

	public SendMessages(messages: any[]) {
		if (messages.length === 0) {
			return;
		}
		const scope = this;
		if (editor.debug) {
			Log(LOGLEVEL.VERBOSE, 'OUT: ');
			Log(LOGLEVEL.VERBOSE, messages);
			// We don't handle messages in VEXTEmulator yet
			// scope.emulator.Receive(commands);
		} else {
			console.log(messages);
			Log(LOGLEVEL.VERBOSE, 'OUT: ');
			Log(LOGLEVEL.VERBOSE, messages);
			WebUI.Call('DispatchEventLocal', 'MapEditor:ReceiveMessage', JSON.stringify(messages));
		}
	}


	public HandleMessage(messageRaw:any) {
		let message:any;
		let emulator = false;
		if (typeof(messageRaw) === 'object') {
			message = messageRaw;
			emulator = true;
		} else {
			Log(LOGLEVEL.VERBOSE, messageRaw);
			message = JSON.parse(messageRaw);
		}

		Log(LOGLEVEL.VERBOSE, 'IN: ');
		Log(LOGLEVEL.VERBOSE, message);

		if (this.messages[message.type] === undefined) {
			LogError('Failed to call a null signal: ' + message.type);
			return;
		}
		if (emulator) {
			const scope = this;
			// delay to simulate tick increase.
			setTimeout(async function() {
				scope.messages[message.type](message);
			}, 1);
		} else {
			this.commands[message.type](message);
		}
		editor.threeManager.Render();
	}
}

