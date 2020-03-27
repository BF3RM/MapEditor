import { CommandActionResult } from '@/script/types/CommandActionResult';
import { LogError } from '@/script/modules/Logger';

export class VEXTemulator {
	private commands: any;
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
			editor.vext.HandleResponse(responses, true);
		}, 1);
	}

	private CreateGroup(commandActionResult: CommandActionResult) {
		const response = {
			type: 'CreatedGroup',
			sender: commandActionResult.sender,

			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				name: commandActionResult.gameObjectTransferData.name
			}
		};
		return response;
	}

	private DestroyGroup(command: any) {
		LogError('NotImplemented');
	}

	private SpawnBlueprint(commandActionResult: CommandActionResult) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		// command.gameObjectTransferData.transform = command.gameObjectTransferData.transform.toTable();
		const response = {
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
				typeName: 'ObjectBlueprint',
				parentData: commandActionResult.gameObjectTransferData.parentData,
				name: commandActionResult.gameObjectTransferData.name,
				variation: commandActionResult.gameObjectTransferData.variation
			}
		};
		return response;
	}

	private SetTransform(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetTransform',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				transform: commandActionResult.gameObjectTransferData.transform.toTable()
			}
		};
		return response;
	}

	private DestroyBlueprint(commandActionResult: CommandActionResult) {
		// Delete all children of blueprint
		const response = {
			type: 'DeletedBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid
			}
		};
		return response;
	}

	private SetObjectName(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetObjectName',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				name: commandActionResult.gameObjectTransferData.name
			}
		};
		return response;
	}

	private SetVariation(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetVariation',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				variation: commandActionResult.gameObjectTransferData.variation
			}
		};
		return response;
	}

	private EnableBlueprint(commandActionResult: CommandActionResult) {
		const response = {
			type: 'EnabledBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid
			}
		};
		return response;
	}

	private DisableBlueprint(commandActionResult: CommandActionResult) {
		const response = {
			type: 'DisabledBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid
			}
		};
		return response;
	}
}
