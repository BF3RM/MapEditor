class Editor {
	constructor(debug) {

		// Events that the editor should execute first
		signals.spawnBlueprintRequested.add(this.onBlueprintSpawnRequested.bind(this));
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		signals.setObjectName.add(this.onSetObjectName.bind(this));
		signals.setTransform.add(this.onSetTransform.bind(this));

		this.debug = debug;
        this.logger = new Logger(LOGLEVEL.VERBOSE);
		this.ui = new UI(debug);
		this.webGL = new WebGL();
		this.vext = new VEXTInterface();
        this.history = new History(this);
        this.blueprintManager = new BlueprintManager();
        this.entityFactory = new EntityFactory();

        // Events that the editor should execute last
		signals.selectedEntity.add(this.onSelectedEntity.bind(this));

		/*

			Internal variables

		 */
        this.playerName = null;
        this.selected = [];
        this.raycastTransform = new LinearTransform();

        //this.webobjects = {};
        this.gameObjects = {};


		this.Initialize();


		this.lastUpdateTime = 0;
		this.deltaTime = 1.0/30.0;

		this._renderLoop = this.renderLoop.bind(this);
		this.renderLoop(); // first call to init loop using the requestAnimationFrame

		
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

	UpdateRaycastPosition(x, y, z){
		this.raycastTransform.trans = new Vec3(x, y, z);
	}

	/*

		Events

	*/


	renderLoop()
	{

		//GameObject update
		if( this.lastUpdateTime == 0 || 
			this.lastUpdateTime + (this.deltaTime*1000.0) <= Date.now())
		{
			this.lastUpdateTime = Date.now();

			for ( var key in this.gameObjects )
			{
				var object = this.gameObjects[key];

				if (object.update != undefined)
					object.update( this.deltaTime );

			}
		}
			
	
		//Gameobject render
		this.webGL.Render( );
	

		//Render loop
		// Disabled for now
		//window.requestAnimationFrame( this._renderLoop );
	}

	onSetObjectName(command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			this.logger.LogError("Tried to set the name of a null object: " + command.guid);
			return;
		}
		gameObject.name = command.name;
	}

	onSetTransform (command) {
		let gameObject = this.getGameObjectByGuid(command.guid);
		if(gameObject === undefined) {
			this.logger.LogError("Tried to set the transform of a null object: " + command.guid);
			return;
		}
		gameObject.setTransform(new LinearTransform().setFromString(command.transform))
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

		//Spawn blueprint
		let guid = GenerateGuid()
		scope.logger.Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
		let parameters = new ReferenceObjectParameters(blueprint.getReference(), guid, variation, blueprint.name, transform);

		scope.execute(new SpawnBlueprintCommand(guid, parameters));
	}

	onDestroyedBlueprint(command) {
    	this.webGL.DeleteObject(this.gameObjects[command.guid]);
		delete this.gameObjects[command.guid];
	}

	onSpawnedBlueprint(command) {
		//let webobject = this.webGL.CreateGroup(command.parameters.transform);
        //this.webobjects[command.guid] = webobject;
        console.log("GO spawned");
        var gameObject = new GameObject(command.guid, command.name, new LinearTransform().setFromString(command.parameters.transform), command.parent, command.children, command.parameters);
		
		this.webGL.AddObject(gameObject);
		

		this.gameObjects[command.guid] = gameObject;

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
    	let scope = this;
		if(scope.gameObjects[command.guid] === undefined) {
			scope.logger.LogError("Failed to select gameobject: " + command.guid);
			return;
		}
	    scope.selected = scope.gameObjects[command.guid];

		//TODO: make this not ugly.
	    this.gameObjects[command.guid].update();
		this.webGL.AttachGizmoTo(this.gameObjects[command.guid]);
	}

	onSelectedEntities(command) {
		let scope = this;

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