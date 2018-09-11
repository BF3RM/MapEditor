/*

	This class should handle all blueprints and prefabs.
	It's responsible for verifying that the data is valid and usable.

 */
class BlueprintManager {
	constructor() {
		this.blueprints = {};

		events.blueprintSpawnRequested.add(this.PrepareBlueprint.bind(this));
	}

	RegisterBlueprint(key, blueprint) {
		this.blueprints[key] = new Blueprint().fromObject(blueprint);
	}

	RegisterBlueprints(blueprintsRaw) {
		let scope = this;
		let blueprints = JSON.parse(blueprintsRaw);
		for(let key in blueprints) {
			scope.RegisterBlueprint(key, blueprints[key]);
		}
		events.blueprintsRegistered.dispatch(editor.blueprintManager.blueprints);
	}

	getBlueprintByGuid(instanceGuid) {
		let scope = this;
		return scope.blueprints[instanceGuid];
	}

    PrepareBlueprint(instanceGuid) {
		console.log("frick");
		let scope = this;
		let blueprint = scope.getBlueprintByGuid(instanceGuid);
		if(blueprint === null) {
			Logger.LogError("Failed to get blueprint: " + instanceGuid);
			return false;
		}

        let variations = blueprint.variations;
        if ((variations.length == null || variations.length === 0) && blueprint.verified === false) {
        	editor.logger.Log(LOGLEVEL.DEBUG, "Blueprint " + instanceGuid + " has no known variations.");

        	//TODO: implement proper modal thing.
            editor.ui.dialogs["variation"].dialog("open");
        } else {
			//SpawnBlueprintCommand
            editor.logger.Log(LOGLEVEL.DEBUG, "Spawning " + instanceGuid);

        }
    }
}