import Command from '../libs/three/Command';
import { VEXTemulator } from '@/script/modules/VEXTemulator';
import { CommandActionResult } from '@/script/types/CommandActionResult';
import * as Collections from 'typescript-collections';
import { Guid } from '@/script/types/Guid';
import { GameObject } from '@/script/types/GameObject';
import { signals } from '@/script/modules/Signals';
import { VextCommand } from '@/script/types/VextCommand';
import { LOGLEVEL } from '@/script/modules/Logger';

export default class VEXTInterface {
	public emulator: VEXTemulator;
	public commandQueue: Command[];
	public commands: any;
	public messages: any;
	public paused: boolean;
	public executing: boolean;
	public queued: {
		commands: VextCommand[],
		messages: object[];
	};

	constructor() {
		this.emulator = new VEXTemulator();
		this.commandQueue = [];
		this.commands = {
			SpawnedBlueprint: signals.spawnedBlueprint.emit,
			BlueprintSpawnInvoked: signals.blueprintSpawnInvoked.emit,
			DestroyedBlueprint: signals.destroyedBlueprint.emit,
			CreatedGroup: signals.createdGroup.emit,
			SetObjectName: signals.setObjectName.emit,
			SetTransform: signals.setTransform.emit,
			SetVariation: signals.setVariation.emit,
			EnabledBlueprint: signals.enabledBlueprint.emit,
			DisabledBlueprint: signals.disabledBlueprint.emit
		};

		this.messages = {
			SetCameraTransformMessage: signals.setCameraTransform.emit,
			SetRaycastTransformMessage: signals.setRaycastPosition.emit,
			SetPlayerNameMessage: signals.setPlayerName.emit,
			SetScreenToWorldPositionMessage: signals.setScreenToWorldPosition.emit,
			SetUpdateRateMessage: signals.setUpdateRateMessage.emit
			// 'SelectedGameObject':	   signals.selectedGameObject.emit,
			// 'DeselectedGameObject':	signals.deselectedGameObject.emit,
		};

		this.paused = false;
		this.executing = false;

		this.queued = {
			commands: [],
			messages: []
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

	public SendCommand(command: VextCommand) {
		command.sender = editor.playerName;

		if (this.paused) {
			this.queued.commands.push(command);
		} else {
			// Sending this individual command as an array of commands
			this.SendCommands([command]);
		}
	}

	public SendCommands(commands: VextCommand[]) {
		if (commands.length === 0) {
			return;
		}

		const scope = this;
		if (editor.debug) {
			window.Log(LOGLEVEL.VERBOSE, 'OUT: ');
			window.Log(LOGLEVEL.VERBOSE, commands);
			console.log(commands[0].gameObjectTransferData.transform);
			scope.emulator.Receive(commands);
		} else {
			console.log(commands);
			window.Log(LOGLEVEL.VERBOSE, 'OUT: ');
			window.Log(LOGLEVEL.VERBOSE, commands);
			// @ts-ignore
			WebUI.Call('DispatchEventLocal', 'MapEditor:SendToServer', JSON.stringify(commands));
		}
	}

	public HandleResponse(commandActionResultsString: string, emulator: boolean) {
		const scope = this;
		scope.executing = true;
		const CARR = JSON.parse(commandActionResultsString) as object[];
		const commandActionResults: CommandActionResult[] = [];
		CARR.forEach((obj: object) => {
			commandActionResults.push(CommandActionResult.FromObject(obj));
		});
		let index = 0;

		window.Log(LOGLEVEL.VERBOSE, 'IN: ');
		window.Log(LOGLEVEL.VERBOSE, commandActionResults);

		commandActionResults.forEach((commandActionResult: CommandActionResult) => {
			if (scope.commands[commandActionResult.type] === undefined) {
				window.LogError('Failed to call a null signal: ' + commandActionResult.type);
				return;
			}
			if (index === commandActionResults.length - 1) {
				scope.executing = false;
			}
			console.log(commandActionResult.gameObjectTransferData.transform);

			scope.commands[commandActionResult.type](commandActionResult);
			index++;
		});
		editor.threeManager.Render();
	}

	public SendEvent(eventName: string, param?: any) {
		if (editor.debug) {
			console.log(eventName);
			if (param != null) {
				console.log(param);
			}
		} else {
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
			// window.Log(LOGLEVEL.VERBOSE, 'OUT: ');
			// window.Log(LOGLEVEL.VERBOSE, messages);
			// We don't handle messages in VEXTEmulator yet
			// scope.emulator.Receive(commands);
		} else {
			WebUI.Call('DispatchEventLocal', 'MapEditor:ReceiveMessage', JSON.stringify(messages));
		}
	}

	public HandleMessage(messageRaw: any) {
		let message: any;
		let emulator = false;
		if (typeof (messageRaw) === 'object') {
			message = messageRaw;
			emulator = true;
		} else {
			window.Log(LOGLEVEL.VERBOSE, messageRaw);
			message = JSON.parse(messageRaw);
		}

		if (this.messages[message.type] === undefined) {
			window.LogError('Failed to call a null signal: ' + message.type);
			return;
		}
		if (emulator) {
			const scope = this;
			// delay to simulate tick increase.
			setTimeout(() => {
				scope.messages[message.type](message);
			}, 1);
		} else {
			this.commands[message.type](message);
		}
		editor.threeManager.Render();
	}
}
