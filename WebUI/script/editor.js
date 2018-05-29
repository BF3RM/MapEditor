class Editor {
	constructor() {
		this.blueprints = {};
		this.debug = false;

		this.confirmedBlueprints = {};
	}

	Initialize() {

	}

	SendEvent(type, name, parameter) {

		if (self.debug) {
			console.log(name + " = " + parameter);
			return;
		}
		WebUI.Call(type, name, parameter)
	}

	RegisterInstances(p_Instances) {

		Object.keys(JSON.parse(p_Instances)).forEach(function (key) {
			let blueprint = blueprintArray[key];
			this.blueprints[key] = new Blueprint(blueprint.partitionGuid, blueprint.instanceGuid, blueprint.name, blueprint.variations);
		});


		$('#treeView').find('.content').append(new TreeView(blueprints).tree);
	}

	static SpawnBlueprint(instance, variation) {
		console.log(instance.partitionGuid + " | " + instance.instanceGuid + " | "  + variation);
		//this.SendEvent('DispatchEventLocal', 'MapEditor:SpawnInstance', p_PartitionGuid + ":" + p_InstanceGuid + ":" + p_Variation)
	}


}