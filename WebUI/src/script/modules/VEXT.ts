import Command from '../libs/three/Command';
import { VEXTemulator } from '@/script/modules/VEXTemulator';
import { CommandActionResult } from '@/script/types/CommandActionResult';
import { signals } from '@/script/modules/Signals';
import { VextCommand } from '@/script/types/VextCommand';
import { LOGLEVEL } from '@/script/modules/Logger';
import { IVec3, Vec3 } from '@/script/types/primitives/Vec3';
import { ILinearTransform } from '@/script/types/primitives/LinearTransform';
import { IBlueprint } from '@/script/interfaces/IBlueprint';

export default class VEXTInterface {
	public emulator: VEXTemulator;
	public commandQueue: Command[];
	public commands: any;
	public messages: any;
	public paused: boolean;
	public executing: boolean;
	public doneExecuting: boolean = true;
	public queued: {
		commands: VextCommand[],
		messages: object[];
	};

	constructor(debug: boolean) {
		this.emulator = new VEXTemulator();
		this.commandQueue = [];
		this.commands = {
			SpawnedBlueprint: signals.spawnedBlueprint.emit,
			BlueprintSpawnInvoked: signals.blueprintSpawnInvoked.emit,
			DeletedBlueprint: signals.deletedBlueprint.emit,
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
		console.log('UI is ready');
		if (!debug) {
			// This is a dirty fucking hack to force UI reload when the UI source is updated.
			// eslint-disable-next-line no-prototype-builtins
			if (!window.hasOwnProperty('editor')) {
				console.log('Sending to lua');
				WebUI.Call('DispatchEventLocal', 'MapEditor:UIReady');
			} else {
				// eslint-disable-next-line no-self-assign
				window.location = window.location;
			}
		}
	}

	// Internal

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

	// public HideGizmo() {
	// 	editor.threeManager.hideGizmo();
	// }
	//
	// public ShowGizmo() {
	// 	editor.threeManager.showGizmo();
	// 	window.editor.threeManager.showGizmo();
	// }

	public SendCommand(command: VextCommand) {
		command.sender = editor.playerName;

		if (this.paused) {
			window.Log(LOGLEVEL.VERBOSE, 'Out: ' + command.type);
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
			scope.emulator.Receive(commands);
		} else {
			// @ts-ignore
			WebUI.Call('DispatchEventLocal', 'MapEditor:SendToServer', JSON.stringify(commands));
		}
	}

	public HandleResponse(CARArray: object[], emulator: boolean) {
		const scope = this;
		scope.executing = true;
		scope.doneExecuting = false;
		const commandActionResults: CommandActionResult[] = [];
		CARArray.forEach((obj: object) => {
			commandActionResults.push(CommandActionResult.FromObject(obj));
		});
		let index = 0;

		commandActionResults.forEach((commandActionResult: CommandActionResult) => {
			if (scope.commands[commandActionResult.type] === undefined) {
				window.LogError('Failed to call a null signal: ' + commandActionResult.type);
				return;
			}
			if (index === commandActionResults.length - 1) {
				scope.executing = false;
			}
			window.Log(LOGLEVEL.VERBOSE, 'In: ' + commandActionResult.type);

			scope.commands[commandActionResult.type](commandActionResult);
			index++;
		});
		editor.threeManager.setPendingRender();
		setTimeout(() => {
			scope.doneExecuting = true;
		}, 1);
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

	// Functions called from VEXT

	public WebUpdateBatch(updates: any[]) {
		// console.log('[VEXT] WebUpdateBatch');
		// console.log(updates);
		updates.forEach((obj: any) => {
			(this as any)[obj.path](obj.payload);
		});
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
		editor.threeManager.setPendingRender();
	}

	public SetPlayerName(name: string) {
		editor.setPlayerName(name);
	}

	public SetRaycastPosition(pos: IVec3) {
		editor.setRaycastPosition(Vec3.setFromTable(pos));
	}

	public SetScreenToWorldPosition(pos: IVec3) {
		editor.setScreenToWorldPosition(Vec3.setFromTable(pos));
	}

	public UpdateCameraTransform(transform: ILinearTransform) {
		editor.threeManager.updateCameraTransform(transform);
	}

	public LoadLevel(levelRaw: string) {
		const levelData = JSON.parse(levelRaw);
		editor.gameContext.loadLevel(levelData);
	}

	public RegisterBlueprints(blueprintsRaw: string) {
		const blueprints = JSON.parse(blueprintsRaw);
		editor.blueprintManager.registerBlueprints(Object.values(blueprints) as IBlueprint[]);
	}

	public MouseEnabled() {
		editor.threeManager.mouseEnabled();
	}
}