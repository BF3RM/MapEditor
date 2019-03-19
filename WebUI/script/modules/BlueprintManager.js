/*

	This class should handle all blueprints and prefabs.
	It's responsible for verifying that the data is valid and usable.

 */
class BlueprintManager {
	constructor() {
		this.blueprints = {};

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
		signals.blueprintsRegistered.dispatch(editor.blueprintManager.blueprints);
	}

	getBlueprintByGuid(instanceGuid) {
		let scope = this;
		if(scope.blueprints[instanceGuid] === null) {
			LogError("Failed to find blueprint with guid " + instanceGuid);
			return null;
		}
		return scope.blueprints[instanceGuid];
	}
}