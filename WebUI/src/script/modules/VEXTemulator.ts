import { CommandActionResult } from '@/script/types/CommandActionResult';
import { LogError } from '@/script/modules/Logger';
import { SetScreenToWorldTransformMessage, MoveObjectMessage } from '@/script/messages/MessagesIndex';
import { XP2SKybar, XP2SKybarBlueprints } from '@/data/DebugData';
import { Guid } from '@/script/types/Guid';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';
import SetPlayModeCommand from '@/script/commands/SetPlayModeCommand';

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
		this.commands.SetPlayModeCommand = this.SetPlayMode;

		this.messages = {};
		this.messages.GetProjectsMessage = this.GetProjectsMessage;
		this.messages.RequestProjectDataMessage = this.RequestProjectDataMessage;
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
		const save = [{ id: 1, projectName: 'debugProject', mapName: 'XP2_Skybar', gameModeName: 'ConquestLargeC0', requiredBundles: 'none', timeStamp: 1592245943322 },
			{ id: 2, projectName: 'debugProject', mapName: 'XP2_Skybar', gameModeName: 'ConquestLargeC0', requiredBundles: 'none', timeStamp: 1592245944322 },
			{ id: 3, projectName: 'debugProject', mapName: 'XP2_Skybar', gameModeName: 'ConquestLargeC0', requiredBundles: 'none', timeStamp: 1592245945322 },
			{ id: 4, projectName: 'debugProject', mapName: 'XP2_Skybar', gameModeName: 'ConquestLargeC0', requiredBundles: 'none', timeStamp: 1592245946322 },
			{ id: 5, projectName: 'NewdebugProject', mapName: 'XP2_Skybar', gameModeName: 'ConquestLargeC0', requiredBundles: 'none', timeStamp: 1592245947322 },
			{ id: 6, projectName: 'NewdebugProject', mapName: 'XP2_Skybar', gameModeName: 'ConquestLargeC0', requiredBundles: 'none', timeStamp: 1592245948322 }];
		return { type: 'SetProjectHeaders', payload: save };
	}

	private RequestProjectDataMessage(projectId: number) {
		return { type: 'SetProjectData', payload: '{"data":"{\\"ED170122-0000-0000-0000-000872916384\\":{\\"transform\\":{\\"left\\":{\\"x\\":1,\\"y\\":0,\\"z\\":0},\\"up\\":{\\"x\\":0,\\"y\\":1,\\"z\\":0},\\"forward\\":{\\"x\\":0,\\"y\\":0,\\"z\\":1},\\"trans\\":{\\"x\\":37.279998779297,\\"y\\":10.239999771118,\\"z\\":16.945972442627}},\\"parentData\\":{\\"primaryInstanceGuid\\":\\"C1F25548-8EF2-4AB5-A79F-D88726713BAE\\",\\"partitionGuid\\":\\"663F36CF-79CC-452E-9B29-7F01E9167849\\",\\"typeName\\":\\"WorldPartData\\",\\"guid\\":\\"ED170122-0000-0000-0000-012043136906\\"},\\"guid\\":\\"ED170122-0000-0000-0000-000872916384\\",\\"variation\\":0,\\"name\\":\\"XP2\\\\/Objects\\\\/SkybarPlanters_01\\\\/SkybarPlanterSquare_01\\",\\"overrides\\":{},\\"isVanilla\\":true,\\"originalRef\\":{\\"partitionGuid\\":\\"663F36CF-79CC-452E-9B29-7F01E9167849\\",\\"typeName\\":\\"ReferenceObjectData\\",\\"instanceGuid\\":\\"4B209482-31AB-4C46-838F-56DF09754B70\\"},\\"blueprintCtrRef\\":{\\"name\\":\\"XP2\\\\/Objects\\\\/SkybarPlanters_01\\\\/SkybarPlanterSquare_01\\",\\"partitionGuid\\":\\"91531887-598A-11E1-B16D-E6BABDB94B75\\",\\"typeName\\":\\"ObjectBlueprint\\",\\"instanceGuid\\":\\"24225227-7FD5-0C8C-BD8D-AB007C5B5C7C\\"},\\"localTransform\\":{\\"left\\":{\\"x\\":1,\\"y\\":0,\\"z\\":0},\\"up\\":{\\"x\\":0,\\"y\\":1,\\"z\\":0},\\"forward\\":{\\"x\\":0,\\"y\\":0,\\"z\\":1},\\"trans\\":{\\"x\\":37.279998779297,\\"y\\":10.239999771118,\\"z\\":16.945972442627}}}}","header":{"requiredBundles":"{\\"Levels\\\\/MP_Subway\\\\/MP_Subway_Settings_win32\\":true,\\"Levels\\\\/XP2_Skybar\\\\/TeamDM\\":true,\\"gameconfigurations\\\\/game\\":true,\\"Levels\\\\/XP2_Skybar\\\\/XP2_Skybar\\":true,\\"Levels\\\\/XP2_Skybar\\\\/DeathMatch\\":true}","timeStamp":1608906842811,"id":1,"mapName":"XP2_Skybar","gameModeName":"TeamDeathMatchC0","projectName":"1"}}' };
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

	private SetPlayMode(commandActionResult: CommandActionResult) {
		return {
			type: 'SetPlaymode',
			gameObjectTransferData: {
				name: commandActionResult.gameObjectTransferData.playMode
			}
		};
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
			type: 'SetField',
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
