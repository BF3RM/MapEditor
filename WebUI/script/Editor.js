class Editor {
	constructor(debug) {

		this.config = new Config();
		this.editorCore = new EditorCore(debug);

		// Commands
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.blueprintSpawnInvoked.add(this.onBlueprintSpawnInvoked.bind(this));
		signals.enabledBlueprint.add(this.onEnabledBlueprint.bind(this));
		signals.disabledBlueprint.add(this.onDisabledBlueprint.bind(this));

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
        this.projectManager = new ProjectManager();
        this.fbdMan = new FrostbiteDataManager();

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

    Initialize() {
        signals.editorInitializing.dispatch(true);
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


        this.ui.RegisterMenubarEntry(["Edit", "Undo"],this.undo.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Redo"],this.undo.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", ""]); // Separator
        this.ui.RegisterMenubarEntry(["Edit", "Cut"],this.Cut.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Copy"],this.Copy.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Pate"],this.Paste.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", ""]); // Separator
        this.ui.RegisterMenubarEntry(["Edit", "Duplicate"], this.Duplicate.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", "Delete"], this.DeleteSelected.bind(this));
        this.ui.RegisterMenubarEntry(["Edit", ""]); // Separator



        //All our UI stuff should be initialized by now.
        // We're going to trigger a resize so the content can adapt to being done initializing.
        // It's stupid, I know, but it beats trying to manually fix all instances of broken containers.
        //window.dispatchEvent(new Event('resize'));
        signals.editorReady.dispatch(true)
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


    Focus(guid) {
	    let target = this.selectionGroup;
	    if(guid) {
	        target = this.getGameObjectByGuid(guid)
        } else if(target.children.length === 0) {
	        return; // Nothing specified, nothing selected. skip.
        }

        this.threeManager.Focus(target);
        signals.objectFocused.dispatch(target);
    }

	Duplicate() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(childGameObject) {
			let gameObjectTransferData = childGameObject.getGameObjectTransferData();
			gameObjectTransferData.guid = GenerateGuid();

			commands.push(new SpawnBlueprintCommand(gameObjectTransferData));
		});
		console.log(commands);
		scope.execute(new BulkCommand(commands));
	}

	Copy() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(childGameObject) {
			let gameObjectTransferData = childGameObject.getGameObjectTransferData();
			gameObjectTransferData.guid = GenerateGuid();

			commands.push(new SpawnBlueprintCommand(gameObjectTransferData));
		});
		scope.copy = new BulkCommand(commands);
	}

	Paste() {
		let scope = this;
		if(scope.copy !== null) {
			//Generate a new guid for each command
			scope.copy.commands.forEach(function (command) {
				command.gameObjectTransferData.guid = GenerateGuid();
			});
			scope.execute(scope.copy);
		}
	}

	Cut() {
		this.Copy();
		this.DeleteSelected();
	}

	SpawnBlueprint(blueprint, transform, variation, parentData) {
		if(blueprint == null) {
			LogError("Tried to spawn a nonexistent blueprint");
			return false;
		}

		if(transform === undefined) {
			transform = this.editorCore.getRaycastTransform();
		}

		if(variation === undefined) {
			variation = blueprint.getDefaultVariation();
		}
		if(parentData === undefined) {
			parentData = new GameObjectParentData("root", "root", "root", "root");
		}

		//Spawn blueprint
		Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
		let gameObjectTransferData = new GameObjectTransferData({
			guid: GenerateGuid(),
			name: blueprint.name,
			parentData: parentData,
			blueprintCtrRef: blueprint.getCtrRef(),
			transform: transform,
			variation: variation,
			isDeleted: false,
			isEnabled: true
		});

		this.execute(new SpawnBlueprintCommand(gameObjectTransferData));
	}

/*	DisableSelected() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(childGameObject) {
			let gameObjectTransferData = new GameObjectTransferData({
				guid: childGameObject.guid
			});

			commands.push(new DisableBlueprintCommand(gameObjectTransferData));
		});
		if(commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}*/

	// TODO: EnableBlueprintCommand and DisableBlueprintCommand are not invoked anywhere, but the whole lua side works.

	DeleteSelected() {
		let scope = this;
		let commands = [];
		editor.selectionGroup.children.forEach(function(childGameObject) {
			if (childGameObject instanceof GameObject) {
				commands.push(new DestroyBlueprintCommand(childGameObject.getGameObjectTransferData()));
			}
		});

		if(commands.length > 0) {
			scope.execute(new BulkCommand(commands));
		}
	}

	getGameObjectFromGameObjectTransferData(gameObjectTransferData, callerName) {
		let gameObject = this.getGameObjectByGuid(gameObjectTransferData.guid);

		if(gameObject === undefined) {
			LogError(callerName + ": Couldn't find the GameObject for GameObjectTransferData. Name: " + gameObjectTransferData.name + " | Guid: " + gameObjectTransferData.guid);
			return;
		}

		return gameObject;
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

    Controls

	*/

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

	/*

		Commands

	*/

	onSetObjectName(commandActionResult) {
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, "onSetObjectName");

		gameObject.setName(gameObjectTransferData.name);
	}

	onSetTransform(commandActionResult) {
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, "onSetTransform");

		gameObject.setTransform(gameObjectTransferData.transform);

		if (this.selectionGroup.children.length === 1 && gameObject === this.selectionGroup.children[0]){
			this.selectionGroup.setTransform(gameObject.transform);
		}		
		
		this.threeManager.Render();
	}

	onSetVariation(commandActionResult) {
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObject = this.getGameObjectFromGameObjectTransferData(gameObjectTransferData, "onSetVariation");

		gameObject.setVariation(gameObjectTransferData.variation);
	}

	onDestroyedBlueprint(commandActionResult) {
		let gameObjectGuid = commandActionResult.gameObjectTransferData.guid
		this.threeManager.DeleteObject(this.gameObjects[gameObjectGuid]);
		delete this.gameObjects[gameObjectGuid];
		
		if(this.selectionGroup.children.length === 0) {
			this.threeManager.HideGizmo()
		}

		this.threeManager.Render();
	}

	onSpawnedBlueprint(commandActionResult) {
		let scope = this;
		let gameObjectTransferData = commandActionResult.gameObjectTransferData;
		let gameObjectGuid = gameObjectTransferData.guid;
		let parentGuid = gameObjectTransferData.parentData.guid;


		// TODO: change GameObject ctor
		let gameObject = new GameObject(gameObjectTransferData.guid,
										gameObjectTransferData.typeName,
										gameObjectTransferData.name,
										gameObjectTransferData.transform,
										gameObjectTransferData.parentData,
										gameObjectTransferData.blueprintCtrRef,
										gameObjectTransferData.variation,
										gameObjectTransferData.gameEntities);

		for (let key in gameObjectTransferData.gameEntities) {
			let entityData = gameObjectTransferData.gameEntities[key];
			// UniqueID is fucking broken. this won't work online, boi.
			if(entityData.isSpatial) {
				let gameEntity = new SpatialGameEntity(entityData.instanceId, entityData.transform, entityData.aabb);
				gameObject.AddEntity(gameEntity);
			}
		}

		gameObject.updateMatrixWorld();

		this.gameObjects[gameObjectGuid] = gameObject;
		// If the parent is the leveldata, ignore all this
		// todo: make an entry for the leveldata itself maybe?

		// Allows children to be spawned before parents, and then added to the appropriate parent.
		if(scope.gameContext.levelData[parentGuid] == null) {
			if(this.gameObjects[parentGuid] == null) {
				if(this.missingParent[parentGuid] == null) {
					this.missingParent[parentGuid] = []
				}
				this.missingParent[parentGuid].push(gameObject)
			} else {
				THREE.SceneUtils.attach(gameObject, editor.threeManager.scene, this.gameObjects[parentGuid] );
			}

			if(this.missingParent[gameObjectGuid] != null) {
				for(let key in this.missingParent[gameObjectGuid]) {
					let child = this.missingParent[gameObjectGuid][key];
					THREE.SceneUtils.attach(child, editor.threeManager.scene, gameObject);
				}

				delete this.missingParent[gameObjectGuid];
			}
		}

		setTimeout(function() {scope.threeManager.scene.remove(gameObject)}, 1);
		if(!scope.vext.executing && commandActionResult.sender === this.getPlayerName()) {
			// Make selection happen after all signals have been handled
			setTimeout(function() {scope.Select(gameObjectGuid, false)}, 2);
		}
	}

	onBlueprintSpawnInvoked(commandActionResult) {
		console.log("Successfully invoke spawning of blueprint: " + commandActionResult.gameObjectTransferData.name + " | " + commandActionResult.gameObjectTransferData.guid)
	}

	onEnabledBlueprint(commandActionResult) {
		let gameObject = editor.getGameObjectByGuid(commandActionResult.gameObjectTransferData.guid);

		if(gameObject == null) {
			LogError("Attempted to enable a GameObject that doesn't exist");
			return;
		}

		let removeFromHierarchy = commandActionResult.gameObjectTransferData.isDeleted;
		gameObject.Enable(removeFromHierarchy);
	}

	onDisabledBlueprint(commandActionResult) {
		let gameObject = editor.getGameObjectByGuid(commandActionResult.gameObjectTransferData.guid);

		if(gameObject == null) {
			LogError("Attempted to disable a GameObject that doesn't exist");
			return;
		}

		let isDeletedVanillaObject = commandActionResult.gameObjectTransferData.isDeleted;
		gameObject.Disable(isDeletedVanillaObject);
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

	Select(guid, multi = false, scrollTo = true) {
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