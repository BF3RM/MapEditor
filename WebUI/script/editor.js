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
        signals.blueprintSpawnRequested.add(this.onBlueprintSpawnRequested.bind(this));

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

		General usage

	 */

	getGameObjectByGuid(guid) {
		return this.entityFactory.getGameObjectByGuid(guid);
	}
	/*

		Events

	*/

    onBlueprintSpawnRequested(blueprint, transform, variation) {
		let scope = this;
    	if(blueprint == null) {
            scope.logger.LogError("Tried to spawn a nonexistent blueprint");
			return false;
		}
		if(transform == undefined) {
			transform = scope.raycastTransform;
		}
		if(variation == undefined) {
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
	    let parameters = new ReferenceObjectParameters(blueprint.getReference(), variation);
		scope.execute(new SpawnReferenceObjectCommand(GenerateGuid(), parameters, editor.raycastTransform));
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