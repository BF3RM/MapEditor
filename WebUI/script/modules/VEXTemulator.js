/*

	This file emulates vext responses and returns dummy data.
	This allows us to develop the UI completely in the browser.

 */
class VEXTemulator {
	constructor() {
		this.commands = {};
		this.commands['SpawnBlueprintCommand'] = this.SpawnBlueprint;
		this.commands['DestroyBlueprintCommand'] = this.DestroyBlueprint;
		this.commands['SelectEntityCommand'] = this.SelectEntity;
		this.commands['SetObjectNameCommand'] = this.SetObjectName;
		this.commands['SetTransformCommand'] = this.SetTransform;
		this.commands['SetVariationCommand'] = this.SetVariation;
	}


	SpawnBlueprint(command) {
		// Spawn blueprint at coordinate
		// Blueprint spawns, we get a list of entities
		// We send the whole thing to web again.
		command.parameters.transform = command.parameters.transform.toString();
		let response = {
			"guid": command.guid,
			"sender": command.sender,
			"type": "SpawnedBlueprint",
			"name": command.parameters.name,
			"children": {
				1: {
					"type": "ClientStaticModelEntity",
					"guid": GenerateGuid(),
					"aabb": {
						"max": "(1.628162, 3.593760, 2.490781)",
						"min": "(-1.888471, -0.057315, -2.555373)",
						"trans": "(1.000000, 0.000000, 0.000000) (0.000000, 1.000000, 0.000000) (0.000000, 0.000000, 1.000000) (-142.846619, 57.860794, -170.079514)"
					},
					"reference": {
						"type": "StaticModelEntityData",
						"instanceGuid": "E424EBD2-6677-11E0-8501-BA28C3073B32"
					}
				},
			},
			"parameters": command.parameters
		};
		editor.vext.HandleResponse(response);
	}

	SetTransform(command) {
		let response = {
			"type": "SetTransform",
			"guid": command.guid,
			"transform": command.parameters.transform.toString()
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

	SelectEntity(command) {
		//TODO: Support multiple selections
		let response = {
			"type": "SelectedEntity",
			"guid": command.guid,
			"aabb": "notimplemented"
		}
		editor.vext.HandleResponse(response);
	}

	SetObjectName(command) {
		
		let response = {
			"type": "SetObjectName",
			"guid": command.guid,
			"name": command.parameters
		};
		editor.vext.HandleResponse(response);
	}

	SetVariation(command) {
		
		let response = {
			"type": "SetVariation",
			"guid": command.guid,
			"key": command.parameters
		};
		editor.vext.HandleResponse(response);
	}



}