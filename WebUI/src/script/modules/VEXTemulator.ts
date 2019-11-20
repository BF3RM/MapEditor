import * as Collections from 'typescript-collections';
import { CommandActionResult } from '@/script/types/CommandActionResult';
import { LogError } from '@/script/modules/Logger';

export class VEXTemulator {
	private commands: any;
	constructor() {
		this.commands = {};
		this.commands.SpawnBlueprintCommand = this.SpawnBlueprint;
		this.commands.DestroyBlueprintCommand = this.DestroyBlueprint;
		this.commands.CreateGroupCommand = this.CreateGroup;
		this.commands.DestroyGroupCommand = this.DestroyGroup;
		this.commands.SetObjectNameCommand = this.SetObjectName;
		this.commands.SetTransformCommand = this.SetTransform;
		this.commands.SetVariationCommand = this.SetVariation;
	}

	public Receive(commands: any[]) {
		const scope = this;
		const responses: any[] = [];
		commands.forEach((command) => {
			responses.push(scope.commands[command.type](command));
		});
		// Delay to simulate tick pass
		setTimeout(() => {
			editor.vext.HandleResponse(JSON.stringify(responses), true);
		}, 1);
	}

	public CreateGroup(commandActionResult: CommandActionResult) {
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

	public DestroyGroup(command: any) {
		LogError('NotImplemented');
	}

	public SpawnBlueprint(commandActionResult: CommandActionResult) {
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

	public SetTransform(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetTransform',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				transform: commandActionResult.gameObjectTransferData.transform.toTable()
			}
		};
		return response;
	}

	public DestroyBlueprint(commandActionResult: CommandActionResult) {
		// Delete all children of blueprint
		const response = {
			type: 'DestroyedBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid
			}
		};
		return response;
	}

	public SetObjectName(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetObjectName',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				name: commandActionResult.gameObjectTransferData.name
			}
		};
		return response;
	}

	public SetVariation(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetVariation',
			gameObjectTransferData: {
				guid: commandActionResult.gameObjectTransferData.guid,
				variation: commandActionResult.gameObjectTransferData.variation
			}
		};
		return response;
	}
}
