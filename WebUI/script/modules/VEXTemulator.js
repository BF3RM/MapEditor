/*

	This file emulates vext responses and returns dummy data.
	This allows us to develop the UI completely in the browser.

 */
class VEXTemulator {
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

	CreateGroup(command) {
		let response = {
			"type": "CreatedGroup",
			"guid": command.guid,
			"name": command.userData.name,
			"sender": command.sender,
		};
		return response;
	}
	DestroyGroup(command) {


	}

	SpawnBlueprint(command) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		//command.gameObjectTransferData.transform = command.gameObjectTransferData.transform.toTable();
		let response = {
			"guid": command.guid,
			"sender": command.sender,
			"type": "SpawnedBlueprint",
			"name": command.userData.name,
			"entities": {
				1: {
					"type": "ClientStaticModelEntity",
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
					"aabb": {
						"max": "(1.628162, 3.593760, 2.490781)",
						"min": "(-1.888471, -0.057315, -2.555373)",
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
						}
					},
					"reference": {
						"type": "StaticModelEntityData",
						"instanceGuid": "E424EBD2-6677-11E0-8501-BA28C3073B32"
					}
				},
			},
			"userData": command.userData
		};

		if(command.userData.reference.typeName == "SpatialPrefabBlueprint") {
			response.entities[2] = {
				"type": "ClientStaticModelEntity",
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
						"y": 3,
						"z": 0
					}
				},
				"aabb": {
					"max": "(1, 3, 2)",
					"min": "(-1, -0, -2)",
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
					}
				},
				"reference": {
					"type": "StaticModelEntityData",
						"instanceGuid": "E424EBD2-6677-11E0-8501-BA28C3073B32"
				}
			};
		}
		return response;
	}

	SetTransform(command) {
		let response = {
			"type": "SetTransform",
			"guid": command.guid,
			"userData": {
				"transform": command.userData.transform.toTable()
			}
		};
		return response;
	}

	DestroyBlueprint(command) {
		// Delete all children of blueprint
		let response = {
			"type": "DestroyedBlueprint",
			"guid": command.guid
		};
		return response
	}

	SetObjectName(command) {

		let response = {
			"type": "SetObjectName",
			"guid": command.guid,
			"name": command.userData
		};
		return response
	}

	SetVariation(command) {

		let response = {
			"type": "SetVariation",
			"guid": command.guid,
			"key": command.userData
		};
		return response
	}



}