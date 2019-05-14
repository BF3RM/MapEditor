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

	SpawnBlueprint(commandActionResult) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		//command.gameObjectTransferData.transform = command.gameObjectTransferData.transform.toTable();
		let response = {
			"sender": "Server",
			"type": "SpawnedBlueprint",
			"gameObjectTransferData": {
				"transform": {
					"left": {
						"x": -0.050000000745058,
						"y": -2.1855681708871E-9,
						"z": 2.1855688370209E-9
					},
					"up": {
						"x": -2.1855701692886E-9,
						"y": -2.1855675047533E-9,
						"z": -0.050000000745058
					},
					"forward": {
						"x": 2.1855761644929E-9,
						"y": -0.050000000745058,
						"z": 2.1855692811101E-9
					},
					"trans": {
						"x": 11.582192420959,
						"y": 11.933897972107,
						"z": 16.226287841797
					}
				},
				"blueprintCtrRef": {
					"typeName": "ObjectBlueprint",
					"instanceGuid": "3F62C691-168F-408C-BDE8-F54020D780B8",
					"name": "XP2/Objects/InvisibleCollision_01_XP2/InvisibleCollision_CharAndVeh_01_Scalable_XP2",
					"partitionGuid": "7455FBF9-8BEE-453B-B358-03088038BFFD"
				},
				"gameEntities": [
					{
						"transform": {
							"left": {
								"x": 1,
								"y": -2.2275843392094E-9,
								"z": 0
							},
							"up": {
								"x": 0,
								"y": 1,
								"z": 0
							},
							"forward": {
								"x": 0,
								"y": -6.4584368963949E-9,
								"z": 1
							},
							"trans": {
								"x": 0,
								"y": 6.4000374777606E-7,
								"z": 0
							}
						},
						"instanceId": 3815363904,
						"indexInBlueprint": 1,
						"typeName": "ClientStaticModelEntity",
						"aabb": {
							"transform": {
								"left": {
									"x": 1,
									"y": -2.2275843392094E-9,
									"z": 0
								},
								"up": {
									"x": 0,
									"y": 1,
									"z": 0
								},
								"forward": {
									"x": 0,
									"y": -6.4584368963949E-9,
									"z": 1
								},
								"trans": {
									"x": 0,
									"y": 6.4000374777606E-7,
									"z": 0
								}
							},
							"min": "(-1.250027, -0.410821, -49.999981)",
							"max": "(1.249973, 24.589176, 50.000011)"
						}
					}
				],
				"guid": "ED170121-0000-0000-0000-000000000919",
				"typeName": "ObjectBlueprint",
				"parentData": {
					"primaryInstanceGuid": "0635B690-A490-4EC2-9BCD-2F2F53F3B6ED",
					"guid": "ED170121-0000-0000-0000-000000000899",
					"typeName": "ReferenceObjectData",
					"resolveType": "Unresolved",
					"partitionGuid": "CE23C072-CF87-4F50-8E88-70DF17E85144"
				},
				"name": "XP2/Objects/InvisibleCollision_01_XP2/InvisibleCollision_CharAndVeh_01_Scalable_XP2",
				"variation": 0
			}
		};

		if(command.gameObjectTransferData.blueprintCtrRef.typeName == "SpatialPrefabBlueprint") {
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