class Editor {
	constructor(debug) {

		this.ui = new UI(debug);
		this.webGL = new WebGL();
		this.vext = new VEXTInterface();

		this.blueprints = {};
		this.debug = debug;

		this.confirmedBlueprints = {};

		// All entities, for an easy way to get them
		this.spawnedEntities = {};

		// Entities that are at the hierarchy root
		this.rootEntities = {};

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

		if (this.selectedEntity == null) {
			console.error("Tried to delete a null entity")
			return;
		}

		//Unselect the entity
		this.OnDeselectEntity(this.selectedEntity);

		// Delete the entity on the hierarchy 
		this.ui.hierarchy.OnDeleteEntry(this.selectedEntity);

		// Delete webGL objects associated with the entity
		this.webGL.DeleteObject(this.selectedEntity.webObject);

		// Delete the entity gameObject
		delete this.spawnedEntities[this.selectedEntity.id];


		// Delete the entity on VU
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
	UpdateSelectedObject(linearTransformString){
		this.webGL.UpdateObject(this.selectedEntity.webObject, new LinearTransform().setFromString(linearTransformString));
		this.webGL.AttachGizmoTo(this.selectedEntity.webObject);
	}
	SelectEntityById(id) {
		this.ui.hierarchy.OnSelectEntity(this.spawnedEntities[id]);
		this.selectedEntity = this.spawnedEntities[id];
		this.webGL.AttachGizmoTo(this.selectedEntity.webObject);
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:SelectEntity', id);
	}
	ConfirmInstanceSpawn() {
		this.SpawnInstance(this.confirmInstance);
		this.confirmedBlueprints[this.confirmInstance.instanceGuid] = true;
	}

	SpawnInstance(instance, variation = 0) {
		console.log(instance);
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:SpawnInstance', GenerateGuid() + ":" + instance.partitionGuid + ":" + instance.instanceGuid + ":" + variation)
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

	OnSpawnedEntity(id, blueprintGuid, linearTransformString) {
		//entityTable.row.add([p_ID, data.name]).draw();
		//TODO: Check if this instance actually exists.
		let transform = new LinearTransform().setFromString(linearTransformString);
		let webGameObject = this.webGL.CreateObject(transform);
		let gameObject =  new GameObject(id, getFilename(this.blueprints[blueprintGuid].name), "Blueprint", transform, webGameObject, this.blueprints[blueprintGuid], null);
		this.ui.hierarchy.OnEntitySpawned(gameObject);
		this.TrackEntity(id, gameObject);

		this.SelectEntityById(id);
	}

	OnRemoveEntity(id) {
		//Remove entity from the list.
	}

	OnDeselectEntity(gameObject) {
		if (gameObject !== editor.selectedEntity) {
			return;
		}
		//Unselect it on the hierarchy
		this.selectedEntity = null;
		this.ui.hierarchy.OnDeselectEntry(gameObject)
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:UnselectEntity', gameObject.id)
	}
}