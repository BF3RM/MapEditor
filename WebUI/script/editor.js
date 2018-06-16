class Editor {
	constructor(debug) {

		this.ui = new UI();
		this.webGL = new WebGL();
		this.vext = new VEXTInterface();

		this.blueprints = {};
		this.debug = debug;

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
		if(this.debug == true) {
			$('body').css({
				"background": 'url(\"img/bf3bg.png\"',
				'background-size': 'cover'
			});
			var imported = document.createElement('script');
			imported.src = 'script/debugData.js';
			document.head.appendChild(imported);
		}

	}



	ClearSpawnedEntities() {
		this.spawnedEntities.clear();
	}

	DeleteSelectedEntity() {
		//TODO: Maybe a message that confirms the deletion?
		let id = this.selectedEntity.id;
		this.selectedEntity = null;
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:DeleteEntity', id)
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
	UpdateSelectedObject(matrixString){
		this.webGL.UpdateObject(this.selectedEntity.webObject, new LinearTransform().setMatrixFromString(matrixString));
		this.webGL.AttachGizmoTo(this.selectedEntity.webObject);
	}
	SelectEntityById(id) {
		this.ui.hierarchy.OnSelectEntity(this.spawnedEntities[id]);
		this.selectedEntity = this.spawnedEntities[id];
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:SelectEntity', id);
	}
	ConfirmInstanceSpawn() {
		this.SpawnInstance(this.confirmInstance);
		this.confirmedBlueprints[this.confirmInstance.instanceGuid] = true;
	}

	SpawnInstance(instance, variation = 0) {
		console.log(instance);
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:SpawnInstance', instance.partitionGuid + ":" + instance.instanceGuid + ":" + variation)
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
		this.ui.treeView.LoadData(this.blueprints);
	}

	OnSpawnedEntity(id, blueprintGuid, matrixString) {
		//entityTable.row.add([p_ID, data.name]).draw();
		//TODO: Check if this instance actually exists.
		let transform = new LinearTransform().setMatrixFromString(matrixString);
		let webGameObject = this.webGL.CreateObject(transform);
		let gameObject =  new GameObject(id, getFilename(this.blueprints[blueprintGuid].name), "Blueprint", transform, this.blueprints[blueprintGuid], webGameObject);
		this.ui.hierarchy.OnEntitySpawned(gameObject);
		this.TrackEntity(id, gameObject);

		this.SelectEntityById(id); // This causes that we send the new id to the client and it sends back the object position to update it in web, unnecesary?
	}

	OnRemoveEntity(id) {
		//Remove entity from the list.
	}

	OnDeselectEntity(gameObject) {
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:UnselectEntity', gameObject.id)
	}
}