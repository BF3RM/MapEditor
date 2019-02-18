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
		this.threeManager = new THREEManager();
		this.ui = new UI(debug);
		this.vext = new VEXTInterface();
		this.history = new History(this);
		this.blueprintManager = new BlueprintManager();
		this.entityFactory = new EntityFactory();

		/*

			Internal variables

		 */
		this.playerName = null;
		// this.selected = [];
		this.raycastTransform = new LinearTransform();
		this.screenToWorldTransform = new LinearTransform();

		this.previewing = false;
		this.previewBlueprint = null;


		this.isUpdating = false;
		this.pendingMessages = {};

		this.gameObjects = {};
		this.favorites = [];

		this.copy = null;

		// Creates selection group and add it to the scene
		this.selectionGroup = new SelectionGroup();
		this.threeManager.AddObject(this.selectionGroup);

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
			imported.src = 'script/DebugData.js';
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
				result[k] = gameObject.userData;
			}
		}
		return JSON.stringify(result, null, 2);
	}

	Duplicate() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(child) {
			let guid = GenerateGuid();
			let gameObject = child;
			commands.push(new SpawnBlueprintCommand(guid, gameObject.userData));

		});
		console.log(commands);
		scope.execute(new BulkCommand(commands));
	}

	Copy() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(child) {
			let guid = GenerateGuid();
			commands.push(new SpawnBlueprintCommand(guid, child.getUserData()));
		});
		scope.copy = new BulkCommand(commands);
	}

	Paste() {
		let scope = this;
		if(scope.copy !== null) {
			//Generate a new guid for each command
			scope.copy.commands.forEach(function (command) {
				command.guid = GenerateGuid();
			});
			scope.execute(scope.copy);
		}
	}
	Cut() {
		this.Copy();
		this.DeleteSelected();
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

	onPreviewDragStart(blueprint) {
		this.previewBlueprint = blueprint;
	}

	onPreviewDrag(e) {
		let direction = this.threeManager.getMouse3D(e);
		let s2wMessage = new SetScreenToWorldTransformMessage(direction);
		this.vext.SendMessage(s2wMessage);
		if(this.previewing == false) {
			return
		}
		let moveMessage = new PreviewMoveMessage(this.screenToWorldTransform);
		this.vext.SendMessage(moveMessage);

	}

	onPreviewDragStop() {
		this.previewBlueprint = null;
		this.previewing = false;
	}

	onPreviewStart() {
		this.previewing = true;
		let userData = this.previewBlueprint.getUserData();
		let message = new PreviewSpawnMessage(userData);
		this.vext.SendMessage(message);
	}

	onPreviewStop() {
		this.previewing = false;
		this.vext.SendMessage(new PreviewDestroyMessage());
	}

	onPreviewDrop() {
		this.previewing = false;
		editor.onBlueprintSpawnRequested(this.previewBlueprint, this.screenToWorldTransform, this.previewBlueprint.getDefaultVariation());
		this.vext.SendMessage(new PreviewDestroyMessage());

		this.previewBlueprint = null;

	}
	/*

		General usage

	 */

	DeleteSelected() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(child) {
			commands.push(new DestroyBlueprintCommand(child.guid));
		});
		if(commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}

	getGameObjectByGuid(guid) {
		return this.gameObjects[guid];
	}

	SetRaycastPosition(x, y, z){
		this.raycastTransform.trans = new Vec3(x, y, z);
	}

	SetScreenToWorldPosition(x, y, z){
		this.screenToWorldTransform.trans = new Vec3(x, y, z);
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
		//this.threeManager.Render( );

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
		gameObject.setTransform(new LinearTransform().setFromTable(command.userData.transform));

		if (this.selectionGroup.children.length === 1 && gameObject === this.selectionGroup.children[0]){
			this.selectionGroup.setTransform(gameObject.transform);
		}		
		
		this.threeManager.Render();
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
		let transform = this.raycastTransform;
		let userData = { name: "New Group"};
		this.execute(new CreateGroupCommand(GenerateGuid(), userData));

	}

	onCreatedGroup(command){
		let group = new Group(command.guid, command.name);

		this.gameObjects[command.guid] = group;
		// if(command.sender === this.playerName) {
		// 	this.Select(command.guid)
		// }
	}

	onDestroyedGroup(command){

	}

	onBlueprintSpawnRequested(blueprint, transform, variation) {
	
		let scope = this;
		if(blueprint == null) {
			scope.logger.LogError("Tried to spawn a nonexistent blueprint");
			return false;
		}
		if(transform === undefined) {
			transform = scope.raycastTransform.Clone();
		}
		if(variation === undefined) {
			variation = blueprint.getDefaultVariation();
		}


		//Spawn blueprint
		let guid = GenerateGuid();
		scope.logger.Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
		let userData = blueprint.getUserData(transform, variation);

		scope.execute(new SpawnBlueprintCommand(guid, userData));
	}

	onDestroyedBlueprint(command) {
		this.threeManager.DeleteObject(this.gameObjects[command.guid]);
		delete this.gameObjects[command.guid];
		this.threeManager.Render();
	}

	onSpawnedBlueprint(command) {
		let scope = this;
		let gameObject = new GameObject(command.guid, command.name, new LinearTransform().setFromTable(command.userData.transform), command.parent, null, command.userData);

		this.threeManager.AddObject(gameObject);

		for (let key in command.children) {
			let entityInfo = command.children[key];
			// UniqueID is fucking broken. this won't work online, boi.
			let gameEntity = new GameEntity(entityInfo.uniqueID, entityInfo.type, new LinearTransform().setFromTable(entityInfo.transform), gameObject, null, entityInfo.reference);

			let aabb = new AABBHelper( new THREE.Box3(
				new Vec3().fromString(entityInfo.aabb.min),
				new Vec3().fromString(entityInfo.aabb.max),
				0xFF0000));

			gameEntity.add(aabb);
			gameObject.add(gameEntity);

		}

		this.gameObjects[command.guid] = gameObject;

		if(!scope.vext.executing && command.sender === this.playerName) {
			// Make selection happen after all signals have been handled
			setTimeout(function() {scope.Select(command.guid, false)}, 1);
		}
	}

	onObjectChanged(object) {
		this.addPending(object.guid, object);
	}



	Select(guid, multi) {
		console.log(multi);
		if(keysdown[17] && (multi === undefined || multi === true)) {
			this.onSelectedGameObject(guid, true)
		} else {
			this.onSelectedGameObject(guid, false)
		}
	}

	Deselect(guid) {
		this.onDeselectedGameObject(guid);
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
			scope.Deselect(guid);
			return;
		}

		// If we are selecting and object already selected (single selection)
		if (gameObject.parent === scope.selectionGroup && !isMultiSelection && scope.selectionGroup.children.length === 1 && scope.selectionGroup.children[0] === gameObject){
			return;
		}

		// Clear selection group when it's a single selection
		if(!isMultiSelection && scope.selectionGroup.children.length !== 0) {
			for (var i = scope.selectionGroup.children.length - 1; i >= 0; i--) {
				scope.Deselect(scope.selectionGroup.children[i].guid);
			}
		}

		if (gameObject.type === "GameObject"){
			if (scope.selectionGroup.children.length === 0) {
				scope.selectionGroup.setTransform(new LinearTransform().setFromMatrix(gameObject.matrixWorld));
			}

			scope.selectionGroup.AttachObject(gameObject);

		}else if (gameObject.type === "Group"){
			gameObject.Select();
			//TODO: update inspector with the group name
		}
		signals.selectedGameObject.dispatch(guid, isMultiSelection);

		scope.selectionGroup.Select();
		if(scope.selectionGroup.children.length !== 0) {
			scope.threeManager.ShowGizmo();
		}
		scope.threeManager.AttachGizmoTo(scope.selectionGroup);
		scope.threeManager.Render();

	}

	onDeselectedGameObject(guid) {
		let scope = this;
		let gameObject = scope.gameObjects[guid];
		scope.selectionGroup.DeselectObject(gameObject);
		signals.deselectedGameObject.dispatch(guid);
		if(scope.selectionGroup.children.length === 0) {
			scope.threeManager.HideGizmo()
		};
		scope.threeManager.Render();
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