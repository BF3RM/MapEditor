class Editor {
	constructor(debug) {

		this.editorCore = new EditorCore(debug);

		// Commands
		signals.spawnBlueprintRequested.add(this.onBlueprintSpawnRequested.bind(this));
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.enabledBlueprint.add(this.onEnabledBlueprint.bind(this));
		signals.disabledBlueprint.add(this.onDisabledBlueprint.bind(this));


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

		// Creates selection and highlighting group and adds them to the scene
		this.selectionGroup = new SelectionGroup();
		this.highlightGroup = new HighlightGroup();
		this.threeManager.scene.add(this.selectionGroup);
		this.threeManager.scene.add(this.highlightGroup);

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

	DisableSelected() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(child) {
			commands.push(new DisableBlueprintCommand(child.guid));
		});
		if(commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}

	DeleteSelected() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(child) {
			if (child instanceof GameObject) {
				commands.push(new DestroyBlueprintCommand(child.guid));
			}
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
		let userData = blueprint.getReferenceObjectData(transform, variation);

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
		let gameObject = new GameObject(command.guid, command.name, new LinearTransform().setFromTable(command.userData.transform), command.parentGuid, null, command.userData, command.isVanilla);

		for (let key in command.entities) {
			let entityInfo = command.entities[key];
			// UniqueID is fucking broken. this won't work online, boi.
			let gameEntity = new GameEntity(entityInfo.uniqueID, entityInfo.type, new LinearTransform().setFromTable(entityInfo.transform), entityInfo, null);

			gameObject.add(gameEntity);
		}

		gameObject.updateMatrixWorld();

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
				THREE.SceneUtils.attach( gameObject, editor.threeManager.scene, this.gameObjects[command.parentGuid] );
			}

			if(this.missingParent[command.guid] != null) {
				for(let key in this.missingParent[command.guid]) {
					let child = this.missingParent[command.guid][key];
					THREE.SceneUtils.attach( child, editor.threeManager.scene, gameObject );
				}
				delete this.missingParent[command.guid];
			}
		}



		setTimeout(function() {scope.threeManager.scene.remove(gameObject)}, 1);
		if(!scope.vext.executing && command.sender === this.getPlayerName()) {
			// Make selection happen after all signals have been handled
			setTimeout(function() {scope.Select(command.guid, false)}, 2);
		}
	}

	onEnabledBlueprint(command) {
		let gameObject = editor.getGameObjectByGuid(command.guid)
		if(gameObject == null) {
			LogError("Attempted to enable a GameObject that doesn't exist")
			return
		}
		let removeFromHierarchy = command.isDeleted ;
		gameObject.Enable(removeFromHierarchy);
	}

	onDisabledBlueprint(command) {
		let gameObject = editor.getGameObjectByGuid(command.guid)
		if(gameObject == null) {
			LogError("Attempted to enable a GameObject that doesn't exist")
			return
		}
		let removeFromHierarchy = command.isDeleted ;
		gameObject.Disable(removeFromHierarchy);
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

	Select(guid, multi = false, scrollTo = false) {
		this.Unhighlight(guid);

		if(keysdown[17] || multi) {
			this.editorCore.onSelectedGameObject(guid, true, scrollTo)
		} else {
			this.editorCore.onSelectedGameObject(guid, false, scrollTo)
		}
	}

	Deselect(guid) {
		this.editorCore.onDeselectedGameObject(guid);
	}

	Highlight(guid){
		let gameObject = this.gameObjects[guid];

		if (gameObject === null) return;


		this.highlightGroup.HighlightObject(gameObject);
	}

	Unhighlight(guid){
		if (guid !== null && guid !== undefined) {
			let gameObject = this.gameObjects[guid];

			if (gameObject === null || gameObject === undefined){
				console.error("Tried to unhighlight an object that doesn't exist");
				return;
			}else if (!gameObject.highlighted) {
				return;
			}
		}

		this.highlightGroup.UnhighlightCurrentObject()
	}

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