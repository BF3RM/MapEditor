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


        this.selected = null;
        this.raycastTransform = new LinearTransform();
		this.Initialize();
        events.blueprintSpawnRequested.add(this.onBlueprintSpawnRequested.bind(this));

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
		}
	}
	/*



	*/

    onBlueprintSpawnRequested(blueprint) {
		let scope = this;
    	if(blueprint == null) {
            scope.logger.LogError("Tried to spawn a nonexistent blueprint");
			return false;
		}
		if(!blueprint.isVariationValid()) {
            scope.logger.Log(LOGLEVEL.DEBUG, "Blueprint does not have a valid variation. Requesting user input.");
			// Show variation
			return false;
		}
		// Request validation from Lua here.

		//Spawn blueprint
		scope.logger.Log(LOGLEVEL.VERBOSE, "Spawning blueprint: " + blueprint.instanceGuid);
		let gameObject = new GameObject(GenerateGuid(), blueprint.name, blueprint.type, editor.raycastTransform, blueprint, blueprint.variations[0], false, null);

		scope.execute(new SpawnReferenceObjectCommand(gameObject));
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