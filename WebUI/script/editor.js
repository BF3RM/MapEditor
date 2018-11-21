class Editor {
	constructor(debug) {

		// Commands
		signals.spawnBlueprintRequested.add(this.onBlueprintSpawnRequested.bind(this));
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));		
		signals.createGroupRequested.add(this.onCreateGroupRequested.bind(this));
		signals.createdGroup.add(this.onCreatedGroup.bind(this));
		signals.destroyedGroup.add(this.onDestroyedGroup.bind(this));
		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		signals.setObjectName.add(this.onSetObjectName.bind(this));
		signals.setTransform.add(this.onSetTransform.bind(this));
		signals.setVariation.add(this.onSetVariation.bind(this));

		//Messages

		signals.objectChanged.add(this.onObjectChanged.bind(this));
		signals.setCameraTransform.add(this.onSetCameraTransform.bind(this));
		signals.setRaycastPosition.add(this.onSetRaycastPosition.bind(this));
		signals.setPlayerName.add(this.onSetPlayerName.bind(this));
		signals.setScreenToWorldPosition.add(this.onSetScreenToWorldPosition.bind(this));
		signals.setUpdateRateMessage.add(this.onSetUpdateRateMessage.bind(this));
		signals.historyChanged.add(this.onHistoryChanged.bind(this));

		this.debug = debug;
		this.logger = new Logger(LOGLEVEL.VERBOSE);
		this.webGL = new WebGL();
		this.ui = new UI(debug);
		this.vext = new VEXTInterface();
		this.history = new History(this);
		this.blueprintManager = new BlueprintManager();
		this.entityFactory = new EntityFactory();

		// Events that the editor should execute last
		signals.selectedGameObject.add(this.onSelectedGameObject.bind(this));
		signals.deselectedGameObject.add(this.onDeselectedGameObject.bind(this));

		/*

			Internal variables

		 */
		this.playerName = null;
		// this.selected = [];
		this.raycastTransform = new LinearTransform();
		this.s2wTransform = new LinearTransform();

		this.isUpdating = false;
		this.pendingMessages = {};

		this.gameObjects = {};
		this.favorites = [];

		// Creates selection group and add it to the scene
		this.selectionGroup = new SelectionGroup();
		this.webGL.AddObject(this.selectionGroup);

		this.Initialize();


		this.lastUpdateTime = 0;
		this.deltaTime = 1.0/30.0;

		this._renderLoop = this.renderLoop.bind(this);
		this.renderLoop(); // first call to init loop using the requestAnimationFrame

		
	}

	AddFavorite(blueprint) {
		this.favorites[blueprint.instanceGuid] = blueprint;
		blueprint.SetFavorite(true);
		signals.favoriteAdded.dispatch(blueprint);
		signals.favoritesChanged.dispatch();
	}

	RemoveFavorite(blueprint) {
		blueprint.SetFavorite(false);
		delete this.favorites[blueprint.instanceGuid];
		signals.favoriteRemoved.dispatch(blueprint);
		signals.favoritesChanged.dispatch();
	}

	Initialize() {
		// Adds the chrome background and debug window
		if(this.debug === true) {
			$('body').css({
				"background": 'url(\"img/bf3bg.png\"',
				'background-size': 'cover'
			});
			let imported = document.createElement('script');
			imported.src = 'script/debugData.js';
			document.head.appendChild(imported);
			this.playerName = "LocalPlayer";
		}
	}

	toJson() {
		let scope = this;
		let result = {};
		for (let k in scope.gameObjects){
			if (scope.gameObjects.hasOwnProperty(k)) {
				let gameObject = this.gameObjects[k];
				result[k] = {
					guid: gameObject.guid,
					name: gameObject.name,
					transform: gameObject.transform,
					parameters: gameObject.parameters
				};
			}
		}
		return JSON.stringify(result, null, 2);
	}
	/*

		Internal shit

	 */

	setPlayerName(name) {
		if(name === undefined) {
			this.logger.LogError("Failed to set player name");
		} else {
			this.playerName = name;
		}
	}

	setUpdating(value) {
		editor.isUpdating = value;
		if(value) {
			this.renderLoop()
		}
	}
	/*

		General usage

	 */

	getGameObjectByGuid(guid) {
		return this.gameObjects[guid];
	}

	UpdateRaycastPosition(x, y, z){
		this.raycastTransform.trans = new Vec3(x, y, z);
	}

	addPending(guid, message) {
		this.pendingMessages[guid] = message;
	}

	renderLoop()
	{
		let scope = this;
		//GameObject update

		//This var is checked twice because we might have stopped the rendering during the last update.
		if(this.isUpdating === false) {
			return;
		}
		if ( scope.lastUpdateTime === 0 ||
			scope.lastUpdateTime + (scope.deltaTime*1000.0) <= Date.now())
		{
			scope.lastUpdateTime = Date.now();

			/*for ( var key in this.gameObjects )
			{
				var object = this.gameObjects[key];

				if (object.update != undefined)
					object.update( this.deltaTime );

			}
			*/
			for(let guid in scope.pendingMessages) {
				let changes = scope.pendingMessages[guid].getChanges();
				if(!changes) {
					continue;
				}
				for(let changeKey in changes) {
					let change = changes[changeKey];
					scope.vext.SendMessage(change);
				}
				delete scope.pendingMessages[guid];
			}
		}

		//Gameobject render
		//this.webGL.Render( );

		if(this.isUpdating) {
			window.requestAnimationFrame( this._renderLoop );
		}
	}

	/*

		Commands

	*/

	onSetObjectName(command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			this.logger.LogError("Tried to set the name of a null object: " + command.guid);
			return;
		}
		gameObject.setName(command.name);
	}

	onSetTransform(command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			this.logger.LogError("Tried to set the transform of a null object: " + command.guid);
			return;
		}
		gameObject.setTransform(new LinearTransform().setFromString(command.transform))
		this.webGL.Render();
	}

	onSetVariation(command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			this.logger.LogError("Tried to set the variation of a null object: " + command.guid);
			return;
		}
		gameObject.setVariation(command.key);
	}
	onControlMoveStart() {
		let scope = this;
		scope.selectionGroup.onMoveStart();
	}
	onControlMove() {
		let scope = this;
		scope.selectionGroup.onMove();
	}
	onControlMoveEnd() {
		let scope = this;
		scope.selectionGroup.onMoveEnd();

	}

	onCreateGroupRequested(){
		let transform = new LinearTransform().toString();
		let parameters = { name: "New Group", transform:  transform};
		this.execute(new CreateGroupCommand(GenerateGuid(), parameters));

	}

	onCreatedGroup(command){
		let group = new Group();
		this.webGL.AddObject(group);

		group.visible = false;

		this.gameObjects[command.guid] = group;

		if(command.sender === this.playerName) {
			this.Select(command.guid)
		}
	}

	onDestroyedGroup(command){

	}

	// CreateGroup(id, name, transform, parent){
	// 	if(this.spawnedEntities[id] != null){
	// 		console.log("A group with this ID already exists");
	// 		return;
	// 	}
	// 	let webObject = this.webGL.CreateGroup(transform);
	// 	let groupObject = new Group(id, name, webObject, transform, parent, {} );
	// 	this.ui.hierarchy.CreateGroup(groupObject);

	// 	if(parent != null){
	// 		this.ui.hierarchy.MoveElementsInHierarchy(parent, groupObject)
	// 	}

	// 	this.TrackEntity(id, groupObject);
	// 	this.SelectEntityById(id);

	// 	return groupObject;
	// }

	onBlueprintSpawnRequested(blueprint, transform, variation) {
	
		let scope = this;
		if(blueprint == null) {
			scope.logger.LogError("Tried to spawn a nonexistent blueprint");
			return false;
		}
		if(transform === undefined) {
			transform = scope.raycastTransform;
		}
		if(variation === undefined) {
			variation = blueprint.getDefaultVariation();
		}
		/*
		if(!blueprint.isVariationValid(variation)) {
			scope.logger.Log(LOGLEVEL.DEBUG, "Blueprint does not have a valid variation. Requesting user input.");
			// Show variation
			return false;
		}
		*/

		//Spawn blueprint
		let guid = GenerateGuid();
		scope.logger.Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
		let parameters = new ReferenceObjectParameters(blueprint.getReference(), guid, variation, blueprint.getName(), transform);

		scope.execute(new SpawnBlueprintCommand(guid, parameters));
	}

	onDestroyedBlueprint(command) {
		this.webGL.DeleteObject(this.gameObjects[command.guid]);
		delete this.gameObjects[command.guid];
		this.webGL.Render();
	}

	onSpawnedBlueprint(command) {
		let scope = this;
		//let webobject = this.webGL.CreateGroup(command.parameters.transform);
		//this.webobjects[command.guid] = webobject;
		let gameObject = new GameObject(command.guid, command.name, new LinearTransform().setFromString(command.parameters.transform), command.parent, null, command.parameters);

		this.webGL.AddObject(gameObject);

		for (let key in command.children) {
			let entityInfo = command.children[key];
			// UniqueID is fucking broken. this won't work online, boi.
			let gameEntity = new GameEntity(entityInfo.uniqueID, entityInfo.type, new LinearTransform().setFromString(entityInfo.transform), gameObject, null, entityInfo.reference);

			let aabb = new AABBHelper( new THREE.Box3(
				new Vec3().fromString(entityInfo.aabb.min),
				new Vec3().fromString(entityInfo.aabb.max),
				0xFF0000));

			gameEntity.add(aabb);
			gameObject.add(gameEntity);

		}

		gameObject.visible = false;

		this.gameObjects[command.guid] = gameObject;

		if(command.sender === this.playerName) {
			this.Select(command.guid)
		}
	}

	onObjectChanged(object) {
		this.addPending(object.guid, object);
	}


	Select(guid) {

		if(keysdown[17]) {
			// signals.selectedGameObject.dispatch;
			this.onSelectedGameObject(guid, true);
		} else {
			// signals.selectedGameObject.dispatch;
			this.onSelectedGameObject(guid, false);
		}
	}

	Deselect(guid) {
		this.onDeselectedGameObject(guid);
		// if(keysdown[17]) {
		// 	this.onDeselectedGameObject(guid, true);
		// } else {
		// 	this.onDeselectedGameObject(guid, false);
		// }
	}

	onSelectedGameObject(guid, isMultiSelection) {
		let scope = this;
		let gameObject = scope.gameObjects[guid];
		if(gameObject === undefined) {
			scope.logger.LogError("Failed to select gameobject: " + guid);
			return;
		}

		// If the object is already in this group and it's a multiselection we deselect it
		if (gameObject.parent === scope.selectionGroup && isMultiSelection){
			console.log("Object already selected");
			scope.Deselect(guid);

			return;
		}

		// Clear selection group when there is a single selection
		if(!isMultiSelection && scope.selectionGroup.children.length !== 0) {
			console.log("Clearing selection group");
			for (var i = scope.selectionGroup.children.length - 1; i >= 0; i--) {
				scope.Deselect(scope.selectionGroup.children[i].guid);
			}
		}

		if (scope.selectionGroup.children.length === 0) {
			scope.selectionGroup.setTransform(new LinearTransform().setFromMatrix(gameObject.matrixWorld));
		}
		
		scope.selectionGroup.AttachObject(gameObject);
		scope.selectionGroup.Select();

		scope.webGL.AttachGizmoTo(scope.selectionGroup);

		scope.webGL.Render();

	}

	onDeselectedGameObject(guid) {
						// todo: call signal
		let scope = this;
		let gameObject = scope.gameObjects[guid];
		console.log(guid)
		console.log(gameObject)
		scope.selectionGroup.DeselectObject(gameObject);

		scope.webGL.Render();
	}

	// onSelectedEntities(command) {
	// 	let scope = this;

	// }

	/*

		Messages

	 */

	onSetCameraTransform(transform) {

	}
	onSetRaycastPosition(position) {

	}
	onSetPlayerName(name){

	}
	onSetScreenToWorldPosition(position){

	}
	onSetUpdateRateMessage(value){

	}

	/*

		History

	 */
	onHistoryChanged(cmd) {
		let scope = this;
		if(cmd.currentlySelected !== null && cmd.currentlySelected !== scope.selectionGroup ) {
			// console.log(cmd);
			// for (var i = scope.selectionGroup.children.length - 1; i >= 0; i--) {
			// 	if (scope.selectionGroup.children.length[i] == cmd.currentlySelected){
			// 		break;
			// 	}
			// }

			for (var i = cmd.currentlySelected.length - 1; i >= 0; i--) {
				scope.Select(cmd.currentlySelected[i].guid);
			}
			
		}
	}

	execute( cmd, optionalName ) {
		this.history.execute( cmd, optionalName );
	}

	undo() {
		this.history.undo();
	}

	redo() {
		this.history.redo();
	}
}
window.addEventListener('resize', function () {
	signals.windowResized.dispatch()
});