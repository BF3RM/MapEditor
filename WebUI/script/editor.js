class Editor {
	constructor(debug) {

		this.debug = debug;
        this.logger = new Logger(LOGLEVEL.VERBOSE);
		this.ui = new UI(debug);
		this.webGL = new WebGL();
		this.vext = new VEXTInterface();
        this.history = new History(this);
        this.blueprintManager = new BlueprintManager();
        this.entityFactory = new EntityFactory();

        /*

            Internal variables

         */
        this.playerName = null;
        this.selected = null;
        this.raycastTransform = new LinearTransform();

        this.webobjects = {};
        this.gameObjects = {};


		this.Initialize();
        signals.spawnBlueprintRequested.add(this.onBlueprintSpawnRequested.bind(this));
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		signals.selectedEntity.add(this.onSelectedEntity.bind(this));
		signals.setObjectName.add(this.onSetObjectName.bind(this));

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
	/*

		General usage

	 */

	getGameObjectByGuid(guid) {
		return this.gameObjects[guid];
	}

	/*

		Events

	*/

	onSetObjectName(command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			this.logger.LogError("Tried to set the name of a null object: " + command.guid);
			return;
		}
		gameObject.name = command.name;
    }


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

		if(!blueprint.isVariationValid(variation)) {
            scope.logger.Log(LOGLEVEL.DEBUG, "Blueprint does not have a valid variation. Requesting user input.");
			// Show variation
			return false;
		}
		// Request validation from Lua here.

		//Spawn blueprint
		scope.logger.Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
	    let parameters = new ReferenceObjectParameters(blueprint.getReference(), variation, blueprint.name, transform);


		scope.execute(new SpawnBlueprintCommand(GenerateGuid(), parameters));
	}

	onDestroyedBlueprint(command) {
    	this.webGL.DeleteObject(this.webobjects[command.guid]);
		delete this.gameObjects[command.guid];
	}

	onSpawnedBlueprint(command) {
		let webobject = this.webGL.CreateGroup(command.parameters.transform);
        this.webobjects[command.guid] = webobject;
        console.log("GO spawned");
        this.gameObjects[command.guid] = new GameObject(command.guid, command.name, command.parameters.transform, command.parent, command.children);
        if(command.sender === this.playerName) {
			this.Select(command.guid)
		}

	}

	Select(guid) {
    	//TODO: Support multiple shit
    	if($.inArray(guid, this.selected) !== -1) {
    		console.log("Selected the same item");
			return;
    	}
		this.vext.SendCommand(new VextCommand(guid, "SelectEntity"))
		//this.selected.push(this.getGameObjectByGuid(guid));
    }

    onSelectedEntity(command) {
    	if(this.webobjects[command.guid] === undefined) {
    		this.logger.LogError("Failed to select gameobject: " + command.guid);
			return;
		}
		this.selected = command.guid;
		//TODO: make this not ugly.
		this.webGL.AttachGizmoTo(this.webobjects[command.guid]);
	}
	
    /*

        History

     */
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