class Editor {
	constructor(renderer) {
		self.renderer = renderer
		self.blueprints = blueprints
		self.instances = instances
		self.debug = debug;

		self.blueprints = {}
		self.safeInstances = {}
	}

	Initialize() {

	}

	RegisterInstances(instances) {

		Object.keys(JSON.parse(instances)).forEach(function(key, index) {
			var blueprint = blueprintArray[key];
			self.blueprints[key] = new Blueprint(blueprint.partitionGuid,blueprint.instanceGuid,blueprint.name,blueprint.variations);
		});


		$('#treeView').find('.content').append(new TreeView(blueprints).tree);
	}

	PrepareInstanceSpawn(instance) {
		if (instance.variations.length == null) {
			// There are no variations, let's set it to -1 so the engine will know we're missing it.
			variations = [-1]
		}
	}

	get BlueprintByGuid(guid) {
		return self.blueprints[guid]
	}

}