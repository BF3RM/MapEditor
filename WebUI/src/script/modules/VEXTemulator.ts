import { CommandActionResult } from '@/script/types/CommandActionResult';
import { LogError } from '@/script/modules/Logger';
import { SetScreenToWorldTransformMessage } from '@/script/messages/SetScreenToWorldTransformMessage';
import { MoveObjectMessage } from '@/script/messages/MoveObjectMessage';
import { XP2SKybar, XP2SKybarBlueprints } from '@/data/DebugData';
import { Guid } from '@/script/types/Guid';

export class VEXTemulator {
	private commands: any;
	private messages: any;
	private events: any;

	constructor() {
		this.commands = {};
		this.commands.SpawnBlueprintCommand = this.SpawnBlueprint;
		this.commands.DeleteBlueprintCommand = this.DestroyBlueprint;
		this.commands.CreateGroupCommand = this.CreateGroup;
		this.commands.DestroyGroupCommand = this.DestroyGroup;
		this.commands.SetObjectNameCommand = this.SetObjectName;
		this.commands.SetTransformCommand = this.SetTransform;
		this.commands.SetVariationCommand = this.SetVariation;
		this.commands.EnableBlueprintCommand = this.EnableBlueprint;
		this.commands.DisableBlueprintCommand = this.DisableBlueprint;
		this.commands.SetEBXFieldCommand = this.SetEBXField;

		this.messages = {};
		this.messages.GetProjectsMessage = this.GetProjectsMessage;
		this.messages.SetScreenToWorldPositionMessage = this.SetScreenToWorldPositionMessage;
		this.messages.MoveObjectMessage = this.MoveObjectMessage;

		this.events = {};
		this.events.UIReloaded = this.UIReloaded;
		this.events.controlUpdate = () => {};
		this.events.controlStart = () => {};
	}

	public Receive(commands: any[]) {
		const scope = this;
		const responses: any[] = [];
		commands.forEach((command) => {
			if (scope.commands[command.type] === undefined) {
				console.error('NotImplemented: ' + command.type);
			} else {
				responses.push(scope.commands[command.type](command));
			}
		});
		// Delay to simulate tick pass
		setTimeout(() => {
			window.vext.HandleResponse(responses, true);
		}, 1);
	}

	public ReceiveMessage(messages: any[]) {
		const scope = this;
		const responses: any[] = [];
		messages.forEach((message) => {
			if (scope.messages[message.type] === undefined) {
				console.error('NotImplemented: ' + message.type);
			} else {
				responses.push(scope.messages[message.type](message));
			}
		});
		// Delay to simulate tick pass
		for (const response of responses) {
			setTimeout(() => {
				window.vext.HandleMessage(response);
			}, 1);
		}
	}

	public ReceiveEvent(eventName: string, param?: any) {
		const scope = this;
		if (scope.events[eventName] === undefined) {
			console.error('NotImplemented: ' + eventName);
		} else {
			scope.events[eventName](param);
		}
	}

	private GetProjectsMessage() {
		const save = [{ id: 1, project_name: 'debugProject', map_name: 'XP2_Skybar', gamemode_name: 'ConquestLargeC0', required_bundles: 'none', timestamp: 1592245943322 },
			{ id: 2, project_name: 'debugProject', map_name: 'XP2_Skybar', gamemode_name: 'ConquestLargeC0', required_bundles: 'none', timestamp: 1592245944322 },
			{ id: 3, project_name: 'debugProject', map_name: 'XP2_Skybar', gamemode_name: 'ConquestLargeC0', required_bundles: 'none', timestamp: 1592245945322 },
			{ id: 4, project_name: 'debugProject', map_name: 'XP2_Skybar', gamemode_name: 'ConquestLargeC0', required_bundles: 'none', timestamp: 1592245946322 },
			{ id: 5, project_name: 'NewdebugProject', map_name: 'XP2_Skybar', gamemode_name: 'ConquestLargeC0', required_bundles: 'none', timestamp: 1592245947322 },
			{ id: 6, project_name: 'NewdebugProject', map_name: 'XP2_Skybar', gamemode_name: 'ConquestLargeC0', required_bundles: 'none', timestamp: 1592245948322 }];
		return { type: 'GetProjectsMessage', value: save };
	}

	private CreateGroup(commandActionResult: CommandActionResult) {
		return {
			type: 'CreatedGroup',
			sender: commandActionResult.sender,

			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				name: commandActionResult.gameObjectTransferData.name
			}
		};
	}

	private DestroyGroup(command: any) {
		LogError('NotImplemented');
	}

	private SpawnBlueprint(commandActionResult: CommandActionResult) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		// command.gameObjectTransferData.transform = command.gameObjectTransferData.transform.toTable();
		return {
			sender: commandActionResult.sender,
			type: 'SpawnedBlueprint',
			gameObjectTransferData: {
				transform: commandActionResult.gameObjectTransferData.transform.toTable(),
				blueprintCtrRef: commandActionResult.gameObjectTransferData.blueprintCtrRef,
				gameEntities: [
					{
						transform: {
							left: {
								x: 1,
								y: 0,
								z: 0
							},
							up: {
								x: 0,
								y: 1,
								z: 0
							},
							forward: {
								x: 0,
								y: 0,
								z: 1
							},
							trans: {
								x: 0,
								y: 0,
								z: 0
							}
						},
						instanceId: 3815363904,
						indexInBlueprint: 1,
						isSpatial: true,
						typeName: 'ClientStaticModelEntity',
						aabb: {
							transform: {
								left: {
									x: 1,
									y: 0,
									z: 0
								},
								up: {
									x: 0,
									y: 1,
									z: 0
								},
								forward: {
									x: 0,
									y: 0,
									z: 1
								},
								trans: {
									x: 0,
									y: 0,
									z: 0
								}
							},
							min: {
								x: -1,
								y: -1,
								z: -1
							},
							max: {
								x: 1,
								y: 1,
								z: 1
							}
						}
					}, {

						instanceId: 3815363904,
						indexInBlueprint: 1,
						isSpatial: false,
						typeName: 'WhateverEntity'
					}
				],
				guid: commandActionResult.gameObjectTransferData.guid,
				parentData: commandActionResult.gameObjectTransferData.parentData,
				name: commandActionResult.gameObjectTransferData.name,
				variation: commandActionResult.gameObjectTransferData.variation
			}
		};
	}

	private SetTransform(commandActionResult: CommandActionResult) {
		return {
			type: 'SetTransform',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				transform: commandActionResult.gameObjectTransferData.transform.toTable()
			}
		};
	}

	private DestroyBlueprint(commandActionResult: CommandActionResult) {
		// Delete all children of blueprint
		return {
			type: 'DeletedBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid
			}
		};
	}

	private SetObjectName(commandActionResult: CommandActionResult) {
		return {
			type: 'SetObjectName',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				name: commandActionResult.gameObjectTransferData.name
			}
		};
	}

	private SetVariation(commandActionResult: CommandActionResult) {
		return {
			type: 'SetVariation',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				variation: commandActionResult.gameObjectTransferData.variation
			}
		};
	}

	private EnableBlueprint(commandActionResult: CommandActionResult) {
		return {
			type: 'EnabledBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid
			}
		};
	}

	private DisableBlueprint(commandActionResult: CommandActionResult) {
		return {
			type: 'DisabledBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid
			}
		};
	}

	private SetEBXField(commandActionResult: CommandActionResult) {
		return {
			type: 'SetEBXField',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				overrides: commandActionResult.gameObjectTransferData.overrides
			}
		};
	}

	private SetScreenToWorldPositionMessage(args: SetScreenToWorldTransformMessage) {
		// const raycaster = new THREE.Raycaster();
		// raycaster.setFromCamera(args.coordinates, editor.threeManager.camera);
		// const intersects = raycaster.intersectObjects(editor.threeManager.scene.children, true);
		// if (intersects.length > 0) {
		// 	for (const intersect of intersects) {
		// 		if (intersect.object.name === 'groundPlane') {
		// 			return {
		// 				type: 'SetScreenToWorldPositionMessage',
		// 				position: intersect.point
		// 			};
		// 		}
		// 	}
		// }
		return null;
	}

	private MoveObjectMessage(args: MoveObjectMessage) {
		return null;
	}

	private UIReloaded() {
		(window as any).vext.HandleResponse(JSON.parse(XP2SKybar));
		(window as any).vext.RegisterBlueprints(XP2SKybarBlueprints);
		setTimeout(() => {
			editor.Select(new Guid('ED170122-0000-0000-0000-001325353053'), false, true, true);
		}, 1);
	}
}
