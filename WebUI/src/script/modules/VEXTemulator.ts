import * as Collections from 'typescript-collections';
import { CommandActionResult } from '@/script/types/CommandActionResult';

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
		commands.forEach(function(command) {
			responses.push(scope.commands[command.type](command));
		});
		// Delay to simulate tick pass
		setTimeout(async function() {
			editor.vext.HandleResponse(JSON.stringify(responses), true);
		}, 1);
	}

	public CreateGroup(commandActionResult: CommandActionResult) {
		const response = {
			type: 'CreatedGroup',
			sender: commandActionResult.sender,

			gameObjectTransferData: {
				guid: commandActionResult.payload.guid,
				name: commandActionResult.payload.name
			}
		};
		return response;
	}

	public DestroyGroup(command: any) {

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
				transform: commandActionResult.payload.transform.toTable(),
				blueprintCtrRef: commandActionResult.payload.blueprintCtrRef,
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
				guid: commandActionResult.payload.guid,
				typeName: 'ObjectBlueprint',
				parentData: commandActionResult.payload.parentData,
				name: commandActionResult.payload.name,
				variation: commandActionResult.payload.variation
			}
		};
		return response;
	}

	public SetTransform(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetTransform',
			gameObjectTransferData: {
				guid: commandActionResult.payload.guid,
				transform: commandActionResult.payload.transform.toTable()
			}
		};
		return response;
	}

	public DestroyBlueprint(commandActionResult: CommandActionResult) {
		// Delete all children of blueprint
		const response = {
			type: 'DestroyedBlueprint',
			gameObjectTransferData: {
				guid: commandActionResult.payload.guid
			}
		};
		return response;
	}

	public SetObjectName(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetObjectName',
			gameObjectTransferData: {
				guid: commandActionResult.payload.guid,
				name: commandActionResult.payload.name
			}
		};
		return response;
	}

	public SetVariation(commandActionResult: CommandActionResult) {
		const response = {
			type: 'SetVariation',
			gameObjectTransferData: {
				guid: commandActionResult.payload.guid,
				variation: commandActionResult.payload.variation
			}
		};
		return response;
	}
}
