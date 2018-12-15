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

	CreateGroup(command) {
		let response = {
			"type": "CreatedGroup",
			"guid": command.guid,
			"name": command.userData.name,
			"sender": command.sender,
		}
		editor.vext.HandleResponse(response);
	}
	DestroyGroup(command) {


	}

	SpawnBlueprint(command) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		command.userData.transform = command.userData.transform.toString();
		let response = {
			"guid": command.guid,
			"sender": command.sender,
			"type": "SpawnedBlueprint",
			"name": command.userData.name,
			"children": {
				1: {
					"type": "ClientStaticModelEntity",
					"guid": GenerateGuid(),
					"transform": "(1.000000, 0.000000, 0.000000) (0.000000, 1.000000, 0.000000) (0.000000, 0.000000, 1.000000) (0,0,0)",
					"aabb": {
						"max": "(1.628162, 3.593760, 2.490781)",
						"min": "(-1.888471, -0.057315, -2.555373)",
						"trans": "(1.000000, 0.000000, 0.000000) (0.000000, 1.000000, 0.000000) (0.000000, 0.000000, 1.000000) (0,0,0)"
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
			response.children[2] = {
				"type": "ClientStaticModelEntity",
					"guid": GenerateGuid(),
					"transform": "(1.000000, 0.000000, 0.000000) (0.000000, 1.000000, 0.000000) (0.000000, 0.000000, 1.000000) (0,3,0)",
					"aabb": {
						"max": "(1, 3, 2)",
						"min": "(-1, -0, -2)",
						"trans": "(1.000000, 0.000000, 0.000000) (0.000000, 1.000000, 0.000000) (0.000000, 0.000000, 1.000000) (0,0,0)"
				},
				"reference": {
					"type": "StaticModelEntityData",
						"instanceGuid": "E424EBD2-6677-11E0-8501-BA28C3073B32"
				}
			};
		}
		editor.vext.HandleResponse(response);
	}

	SetTransform(command) {
		let response = {
			"type": "SetTransform",
			"guid": command.guid,
			"transform": command.userData.transform.toString()
		}
		editor.vext.HandleResponse(response);

	}

	DestroyBlueprint(command) {
		// Delete all children of blueprint
		let response = {
			"type": "DestroyedBlueprint",
			"guid": command.guid
		};
		editor.vext.HandleResponse(response);
	}

	SetObjectName(command) {

		let response = {
			"type": "SetObjectName",
			"guid": command.guid,
			"name": command.userData
		};
		editor.vext.HandleResponse(response);
	}

	SetVariation(command) {

		let response = {
			"type": "SetVariation",
			"guid": command.guid,
			"key": command.userData
		};
		editor.vext.HandleResponse(response);
	}



}