class Editor {
	constructor(debug) {

		this.ui = new UI();
		this.renderer = new WebGL();

		this.blueprints = {};
		this.debug = debug;
		this.blueprintTree = {};

		this.confirmedBlueprints = {};
		this.spawnedEntities = {};

		this.serializedEntities = {};

		this.selectedEntity = null;
		this.confirmInstance = null;

		this.history = {};
		this.currentHistoryStep = 0;
		this.Initialize();
	}

	Initialize() {
		if(this.debug) {
			$('body').css({
				"background": 'url(\"img/bf3bg.png\"',
				'background-size': 'cover'
			});
		}
		var imported = document.createElement('script');
		imported.src = 'script/debugData.js';
		document.head.appendChild(imported);
	}



	ClearSpawnedEntities() {
		this.spawnedEntities.clear();
	}

	DeleteSelectedEntity() {
		//TODO: Maybe a message that confirms the deletion?
		let id = this.selectedEntity.id;
		this.selectedEntity = null;
		SendEvent('DispatchEventLocal', 'MapEditor:DeleteEntity', id)
	}

	PrepareInstanceSpawn(p_InstanceGuid) {
		let instance = this.blueprints[p_InstanceGuid];
		let variations = instance.variations;

		//Check if we have any variations for the object
		if (variations.length == null) {
			// There are no variations, let's set it to -1 so the engine will know we're missing it.
			//TODO: Add variation shit here.
			instance.variations = [-1]
		}

		//Check if we've previously spawned this object.
		if (this.confirmedBlueprints[p_InstanceGuid] == null) {
			this.confirmInstance = instance;
			console.log("Unknown variation!");
			// Bring up warning dialog.
			this.ui.dialogs["variation"].dialog("open");
		} else {
			this.SpawnInstance(instance, variations[0]);
		}
	}
	SelectEntityById(id) {
		this.ui.OnSelectEntity(this.spawnedEntities[id]);
		this.selectedEntity = this.spawnedEntities[id];
	}
	ConfirmInstanceSpawn() {
		this.SpawnInstance(this.confirmInstance);
		this.confirmedBlueprints[this.confirmInstance.instanceGuid] = true;
	}

	SpawnInstance(instance, variation = 0) {
		console.log(instance);
		this.SendEvent('DispatchEventLocal', 'MapEditor:SpawnInstance', instance.partitionGuid + ":" + instance.instanceGuid + ":" + variation)
	}
	TrackEntity(id, gameObject) {
		this.spawnedEntities[id] = gameObject;
	}

	CreatedEntity(id, gameObject) {
		this.TrackEntity(id, gameObject);
	}

	/*

		Events

	 */

	OnRegisterInstances(p_Instances) {
		let blueprints = JSON.parse(p_Instances);
		for (var key in blueprints) {
			this.blueprints[key] = new Blueprint(blueprints[key].partitionGuid, blueprints[key].instanceGuid, blueprints[key].name, blueprints[key].variations);
		};
		// Move this?
		this.blueprintTree = new TreeView(this.blueprints);
		$('#treeView').find('.content').append(this.blueprintTree.tree);
		this.blueprintTree.Initialize();
	}

	OnSpawnedEntity(id, blueprintGuid, matrixString) {
		//entityTable.row.add([p_ID, data.name]).draw();
		//TODO: Check if this instance actually exists.
		let gameObject =  new GameObject(id, getFilename(this.blueprints[blueprintGuid].name), "Blueprint", new LinearTransform().setMatrixFromString(matrixString), this.blueprints[blueprintGuid]);
		this.ui.OnEntitySpawned(gameObject);
		this.TrackEntity(id, gameObject);

		this.SelectEntityById(id);
	}

	OnRemoveEntity(id) {
		//Remove entity from the list.
	}
}