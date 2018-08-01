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

		//Check if the variation is unkown and we've previously spawned this object.
		if (variations.length == null && this.confirmedBlueprints[p_InstanceGuid] == null) {
			this.confirmInstance = instance;
			console.log("Unknown variation!");
			// Bring up warning dialog.
			this.ui.dialogs["variation"].dialog("open");
		} else {
			this.SpawnInstanceWithRaycast(instance, variations[0]);
		}
	}
	UpdateSelectedObject(linearTransformString){
		this.webGL.UpdateObject(this.selectedEntity.webObject, new LinearTransform().setFromString(linearTransformString));
		this.webGL.AttachGizmoTo(this.selectedEntity.webObject);
	}
	SelectEntityById(id) {
		if(this.spawnedEntities[id] == null) {
			console.error("Tried to select an entity that does not exist.")
		} else {
			this.SelectEntity(this.spawnedEntities[id])
		}
	}
	ConfirmInstanceSpawn() {
		this.SpawnInstanceWithRaycast(this.confirmInstance);
		this.confirmedBlueprints[this.confirmInstance.instanceGuid] = true;
	}

	SpawnInstanceWithRaycast(instance, variation = -1) {
		console.log(instance);
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:SpawnInstanceWithRaycast', GenerateGuid() + ":" + instance.partitionGuid + ":" + instance.instanceGuid + ":" + variation)
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

		this.SpawnEntity(id, getFilename(this.blueprints[blueprintGuid].name), transform, this.blueprints[blueprintGuid], variation, this.spawnedEntities[parentId]);
	}

	SpawnEntity(id, name, transform, instance, variation, parent){
		let webObject = this.webGL.CreateObject(transform);
		let gameObject = new GameObject(id, name, "Blueprint", transform, webObject, instance, variation, null);
		this.ui.hierarchy.OnEntitySpawned(gameObject);

		if(parent != null){
			this.ui.hierarchy.MoveElementsInHierarchy(parent, gameObject)
		}

		this.TrackEntity(id, gameObject);
		this.SelectEntityById(id);

		return gameObject;
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

		if (id == null || id == "nil") {
			id = GenerateGuid();
		}

		this.CreateGroup(id, name, transform, this.spawnedEntities[parentId]);
	}

	CreateGroup(id, name, transform, parent){
		let webObject = this.webGL.CreateGroup(transform);
		let groupObject = new Group(id, name, webObject, transform, parent, {} );
		this.ui.hierarchy.CreateGroup(groupObject);

		if(parent != null){
			this.ui.hierarchy.MoveElementsInHierarchy(parent, groupObject)
		}

		this.TrackEntity(id, groupObject);
		this.SelectEntityById(id);

		return groupObject;
	}

	OnRemoveEntity(id) {
		//Remove entity from the list.
	}
	SelectEntity(gameObject) {
		// Deselect the current one
		this.DeselectEntity(this.selectedEntity);

		// Trigger selected on the different classes
		this.webGL.AttachGizmoTo(gameObject.webObject);
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:SelectEntity', gameObject.id);
        this.ui.onSelectEntity(gameObject);
		this.selectedEntity = gameObject;

	}

	DeselectEntity(gameObject) {
		// The current requested entity is not selected.
		if (gameObject == null || gameObject !== editor.selectedEntity) {
			return;
		}

		this.ui.onDeselectEntity(gameObject);
		this.vext.SendEvent('DispatchEventLocal', 'MapEditor:UnselectEntity', gameObject.id)
		this.selectedEntity = null;
	}

	DeleteEntity(gameObject) {
		if(gameObject == null) {
			return
		}

		gameObject.Delete()
	}

	OnMoveEntityWithRaycast(id, x, y, z){
		if(this.spawnedEntities[id] == null){
			return;
		}
		this.spawnedEntities[id].Move(x, y, z);

	}

}