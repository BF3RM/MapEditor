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

	PrepareInstanceSpawn(p_InstanceGuid) {
		let instance = this.blueprints[p_InstanceGuid];
		let variations = instance.variations;

		//Check if we have any variations for the object
		if (variations.length == 0) {
			// There are no variations, let's set it to -1 so the engine will know we're missing it.
			//TODO: Add variation shit here.
			instance.variations = [-1]
		}

		//Check if the variation is unkown and we've previously spawned this object.
		if (variations[0] == -1 && this.confirmedBlueprints[p_InstanceGuid] == null) {
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

	RequestMoveObjectWithRaycast(mouseVec2){
		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera( mouseVec2, this.webGL.camera );
		let direction = raycaster.ray.direction;
		editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:MoveObjectWithRaycast', this.selectedEntity.id +","+ direction.x +","+ direction.y +","+ direction.z);
	}

	SelectParent(){
		if (this.selectedEntity == null) {
			return;
		}

		if (this.selectedEntity.parent == null) {
			return;
		}

		this.SelectEntityById(this.selectedEntity.parent.id);
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

	OnSpawnedEntity(id, blueprintGuid, linearTransformString, variation, parentId) {
		if (id == null || id == "nil") {
			id = GenerateGuid();
		}
		console.log("OnSpawnedEntity - id: "+id);
		if (this.blueprints[blueprintGuid] == null) {
			console.error("Couldn't find a blueprint with id: "+ blueprintGuid)
			return;
		}

		let transform = new LinearTransform().setFromString(linearTransformString);
		let webGameObject = this.webGL.CreateObject(transform);
		let gameObject =  new GameObject(id, getFilename(this.blueprints[blueprintGuid].name), "Blueprint", transform, webGameObject, this.blueprints[blueprintGuid], variation, null);
		this.ui.hierarchy.OnEntitySpawned(gameObject);

		
		if (parentId != null && parentId != "nil") {
			this.ui.hierarchy.MoveElementsInHierarchy(this.spawnedEntities[parentId], gameObject)
		}

		this.TrackEntity(id, gameObject);
		this.SelectEntityById(id);
	}

	OnCreateGroup(id, name, linearTransformString, parentId){
		console.log("OnCreateGroup - id: "+id);
		if (name == null) {
			name = "New Group";
		}

		let transform = null;
		if (linearTransformString == null){
			transform = new LinearTransform();
		}else{
			transform = new LinearTransform().setFromString(linearTransformString);
		}
		// console.log(transform);
		if (id == null || id == "nil") {
			id = GenerateGuid();
		}
		let webObject = editor.webGL.CreateGroup(transform);
		let groupObject = new Group(id, name, webObject, transform, null, {} );
		this.ui.hierarchy.CreateGroup(groupObject);

		if (parentId != null && parentId != "nil") {
			this.ui.hierarchy.MoveElementsInHierarchy(this.spawnedEntities[parentId], groupObject)
		}

		this.TrackEntity(id, groupObject);
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

	OnMoveEntityWithRaycast(id, x, y, z){
		if(this.spawnedEntities[id] == null){
			return;
		}
		this.spawnedEntities[id].Move(x, y, z);

		// this.spawnedEntities[id].webObject.position.x = x;
		// this.spawnedEntities[id].webObject.position.y = y;
		// this.spawnedEntities[id].webObject.position.z = z;
		// this.webGL.Render();

		// this.spawnedEntities[id].OnMove(false);
	}

}