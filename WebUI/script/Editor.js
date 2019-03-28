class Editor {
	constructor(debug) {

		this.editorCore = new EditorCore(debug);

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
		this.threeManager = new THREEManager();
		this.ui = new EditorUI(debug);
		this.vext = new VEXTInterface();
		this.history = new History(this);
		this.blueprintManager = new BlueprintManager();
		this.entityFactory = new EntityFactory();
		this.gameContext = new GameContext();

		/*

			Internal variables

		 */
		// this.selected = [];

		this.playerName = null;

		this.pendingMessages = {};

		this.gameObjects = {};
		this.favorites = [];

		this.copy = null;
		this.test = [];
		this.highlightedGameObject = null;
		// Creates selection group and add it to the scene
		this.selectionGroup = new SelectionGroup();
		this.threeManager.AddObject(this.selectionGroup);

		this.missingParent = {};
		this.Initialize();


	}

	setPlayerName(name) {
		if(name === undefined) {
			LogError("Failed to set player name");
		} else {
			this.playerName = name;
		}
	}
	getPlayerName() {
		return this.playerName;
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
			this.setPlayerName("LocalPlayer");
		}
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





	/*

		General usage

	 */
	test(guid){

		// console.log(this.blueprintManager.blueprints[1])
		// for (var i = 0; i <1000; i++) {
		// 	this.onBlueprintSpawnRequested(this.blueprintManager.blueprints[guid]);
		// }
		for (var i = 0; i <1000; i++) {
			
			let aabb = new AABBHelper( new THREE.Box3(
				new Vec3().fromString("(0,0,0)"),
				new Vec3().fromString("(1,1,1)"),
				0xFF0000));

			// gameEntity.add(aabb);
			editor.threeManager.scene.add(aabb);

			this.test.push(aabb)
			// gameObject.add(gameEntity);

		}		
	
	}
	// test(){

	// 	for (var i = 0; i <800; i++) {

	// 		this.onBlueprintSpawnRequested(this.blueprintManager.blueprints[1], new LinearTransform(new Vec3(1, 0, 0),new Vec3(0, 1, 0),new Vec3(0, 0, 1),new Vec3(5*i, 0, 0)))
	// 	}
	// }


	// RemoveAllGameObjectsFromScene(){
	// 	let scene = editor.threeManager.scene;

	// 	for (var i = scene.children.length - 1; i >= 0; i--) {
	// 		if (scene.children[i].type  === "GameObject") {
	// 			scene.remove(scene.children[i]);
	// 		}
	// 		editor.threeManager.Render();
	// 	}
	// }


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
		this.editorCore.raycastTransform.trans = new Vec3(x, y, z);
	}

	SetScreenToWorldPosition(x, y, z){
		this.editorCore.screenToWorldTransform.trans = new Vec3(x, y, z);
	}

	AddObjectToScene(guid){
		if (guid == null || editor.gameObjects[guid] == null || editor.gameObjects[guid].parent !== null) {
			return;
		}

		editor.threeManager.scene.add(editor.gameObjects[guid]);
	}


	addPending(guid, message) {
		this.pendingMessages[guid] = message;
	}

	setUpdating(value) {
		this.editorCore.setUpdating( value );
	}

	/*

		Commands

	*/

	onSetObjectName(command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			LogError("Tried to set the name of a null object: " + command.guid);
			return;
		}
		gameObject.setName(command.name);
	}

	onSetTransform(command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			LogError("Tried to set the transform of a null object: " + command.guid);
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
			LogError("Tried to set the variation of a null object: " + command.guid);
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
		asd


	}

	onCreatedGroup(command){
		let group = new Group(command.guid, command.userData);

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
			LogError("Tried to spawn a nonexistent blueprint");
			return false;
		}
		if(transform === undefined) {
			transform = scope.editorCore.getRaycastTransform();
		}
		if(variation === undefined) {
			variation = blueprint.getDefaultVariation();
		}


		//Spawn blueprint
		let guid = GenerateGuid();
		Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
		let userData = blueprint.getUserData(transform, variation);

		scope.execute(new SpawnBlueprintCommand(guid, userData));
	}

	onDestroyedBlueprint(command) {
		this.threeManager.DeleteObject(this.gameObjects[command.guid]);
		delete this.gameObjects[command.guid];
		
		if(this.selectionGroup.children.length === 0) {
			this.threeManager.HideGizmo()
		};

		this.threeManager.Render();
	}

	onSpawnedBlueprint(command) {
		let scope = this;
		let gameObject = new GameObject(command.guid, command.name, new LinearTransform().setFromTable(command.userData.transform), command.parentGuid, null, command.userData);

		for (let key in command.children) {
			let entityInfo = command.children[key];
			// UniqueID is fucking broken. this won't work online, boi.
			let gameEntity = new GameEntity(entityInfo.uniqueID, entityInfo.type, new LinearTransform().setFromTable(entityInfo.transform), entityInfo, null);

			gameObject.add(gameEntity);
		}

		this.gameObjects[command.guid] = gameObject;
		// If the parent is the leveldata, ignore all this
		// todo: make an entry for the leveldata itself maybe?

		// Allows children to be spawned before parents, and then added to the appropriate parent.
		if(scope.gameContext.levelData[command.parentGuid] == null) {
			if(this.gameObjects[command.parentGuid] == null) {
				if(this.missingParent[command.parentGuid] == null) {
					this.missingParent[command.parentGuid] = []
				}
				this.missingParent[command.parentGuid].push(gameObject)
			} else {
				this.gameObjects[command.parentGuid].add(gameObject);
			}

			if(this.missingParent[command.guid] != null) {
				for(let key in this.missingParent[command.guid]) {
					let child = this.missingParent[command.guid][key];
					gameObject.add(child);
				}
				delete this.missingParent[command.guid];
			}
		}
		this.threeManager.AddObject(gameObject);



		setTimeout(function() {scope.threeManager.scene.remove(gameObject)}, 1);
		if(!scope.vext.executing && command.sender === this.getPlayerName()) {
			// Make selection happen after all signals have been handled
			setTimeout(function() {scope.Select(command.guid, false)}, 2);
		}
	}

	onObjectChanged(object) {
		this.addPending(object.guid, object);
	}


	isSelected(guid) {
		let scope = this;
		if(scope.selectionGroup.children.length === 0) {
			return false
		}
		for(let i = 0; i < scope.selectionGroup.children.length; i++) {
			if(scope.selectionGroup.children[i].guid === guid) {
				return true;
			}
		}
		return false;
	}

	Select(guid, multi = false) {
		this.Unhighlight(guid);
		if(keysdown[17] || multi) {
			this.editorCore.onSelectedGameObject(guid, true)
		} else {
			this.editorCore.onSelectedGameObject(guid, false)
		}
	}

	Deselect(guid) {
		this.editorCore.onDeselectedGameObject(guid);
	}

	Highlight(guid){
		let gameObject = this.gameObjects[guid];
		if (gameObject === null || gameObject.selected || gameObject.highlighted) return;

		if (this.highlightedGameObject !== null){
			this.Unhighlight(this.highlightedGameObject);
		}
		gameObject.Highlight();
		this.threeManager.AddObject(gameObject);
		
		this.threeManager.Render();
		this.highlightedGameObject = guid;
	}

	Unhighlight(guid = this.highlightedGameObject){
		let gameObject = this.gameObjects[guid];
		if (gameObject === null || gameObject === undefined || !gameObject.highlighted) return;
		gameObject.Unhighlight();
		this.threeManager.scene.remove(gameObject);
		this.threeManager.Render();
		this.highlightedGameObject = null;
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