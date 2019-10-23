/*

	This file emulates vext responses and returns dummy data.
	This allows us to develop the UI completely in the browser.

 */
export class VEXTemulator {
	constructor() {
		this.commands = {};
		this.commands['SpawnBlueprintCommand'] = this.SpawnBlueprint;
		this.commands['DestroyBlueprintCommand'] = this.DestroyBlueprint;
		this.commands['CreateGroupCommand'] = this.CreateGroup;
		this.commands['DestroyGroupCommand'] = this.DestroyGroup;
		this.commands['SetObjectNameCommand'] = this.SetObjectName;
		this.commands['SetTransformCommand'] = this.SetTransform;
		this.commands['SetVariationCommand'] = this.SetVariation;
	}

	Receive(commands) {
		let scope = this;
		let responses = [];
		commands.forEach(function(command) {
			responses.push(scope.commands[command.type](command));
		});
		// Delay to simulate tick pass
		setTimeout(async function() {
			editor.vext.HandleResponse(JSON.stringify(responses), true);
		}, 1)
	}

	CreateGroup(commandActionResult) {
		let response = {
			"type": "CreatedGroup",
			"sender": commandActionResult.sender,

			"gameObjectTransferData": {
				"guid": commandActionResult.gameObjectTransferData.guid,
				"name": commandActionResult.gameObjectTransferData.name
			}
		};
		return response;
	}
	DestroyGroup(command) {


	}

	SpawnBlueprint(commandActionResult) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		//command.gameObjectTransferData.transform = command.gameObjectTransferData.transform.toTable();
		let response = {
			"sender": commandActionResult.sender,
			"type": "SpawnedBlueprint",
			"gameObjectTransferData": {
				"transform": commandActionResult.gameObjectTransferData.transform.toTable(),
				"blueprintCtrRef": commandActionResult.gameObjectTransferData.blueprintCtrRef,
				"gameEntities": [
					{
						"transform": {
							"left": {
								"x": 1,
								"y": 0,
								"z": 0
							},
							"up": {
								"x": 0,
								"y": 1,
								"z": 0
							},
							"forward": {
								"x": 0,
								"y": 0,
								"z": 1
							},
							"trans": {
								"x": 0,
								"y": 0,
								"z": 0
							}
						},
						"instanceId": 3815363904,
						"indexInBlueprint": 1,
						"isSpatial": true,
						"typeName": "ClientStaticModelEntity",
						"aabb": {
							"transform": {
								"left": {
									"x": 1,
									"y": 0,
									"z": 0
								},
								"up": {
									"x": 0,
									"y": 1,
									"z": 0
								},
								"forward": {
									"x": 0,
									"y": 0,
									"z": 1
								},
								"trans": {
									"x": 0,
									"y": 0,
									"z": 0
								}
							},
							"min": {
								"x": -1,
								"y": -1,
								"z": -1,
							},
							"max": {
								"x": 1,
								"y": 1,
								"z": 1,
							},
						}
					}, {

						"instanceId": 3815363904,
						"indexInBlueprint": 1,
						"isSpatial": false,
						"typeName": "WhateverEntity",
					}
				],
				"guid": commandActionResult.gameObjectTransferData.guid,
				"typeName": "ObjectBlueprint",
				"parentData": commandActionResult.gameObjectTransferData.parentData,
				"name": commandActionResult.gameObjectTransferData.name,
				"variation": commandActionResult.gameObjectTransferData.variation
			}
		};
		return response;
	}

	SetTransform(commandActionResult) {
		let response = {
			"type": "SetTransform",
			"gameObjectTransferData": {
				"guid": commandActionResult.gameObjectTransferData.guid,
				"transform": commandActionResult.gameObjectTransferData.transform.toTable()
			}
		};
		return response;
	}

	DestroyBlueprint(commandActionResult) {
		// Delete all children of blueprint
		let response = {
			"type": "DestroyedBlueprint",
			"gameObjectTransferData": {
				"guid": commandActionResult.gameObjectTransferData.guid,
			}
		};
		return response
	}

	SetObjectName(commandActionResult) {

		let response = {
			"type": "SetObjectName",
			"gameObjectTransferData": {
				"guid": commandActionResult.gameObjectTransferData.guid,
				"name": commandActionResult.gameObjectTransferData.name
			}
		};
		return response
	}

	SetVariation(commandActionResult) {

		let response = {
			"type": "SetVariation",
			"gameObjectTransferData": {
				"guid": commandActionResult.gameObjectTransferData.guid,
				"variation": commandActionResult.gameObjectTransferData.variation
			}
		};
		return response
	}



}