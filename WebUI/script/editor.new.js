class Editor {
	constructor(debug) {
		this.debug = debug;

		this.ui = new UI(debug);
		this.webGL = new WebGL();
		this.vext = new VEXTInterface();
		this.history = new History(this);

		// Signals
		let Signal = signals.Signal;
		this.signals = {

			// Object actions
			objectMoveStarted: new Signal(),
			objectMoved: new Signal(),
			objectMoveEnded: new Signal(),

			objectSelected: new Signal(),
			objectDeselected: new Signal(),
			objectFocused: new Signal(),

			objectAdded: new Signal(),
			objectChanged: new Signal(),
			objectRemoved: new Signal(),

			modalShowed: new Signal(),
			modalClosed: new Signal(),
			modalConfirmed: new Signal(),

		};
		this.Initialize();

		this.selected = null;
	}

	Initialize() {
		if(this.debug === true) {
			$('body').css({
				"background": 'url(\"img/bf3bg.png\"',
				'background-size': 'cover'
			});
			var imported = document.createElement('script');
			imported.src = 'script/debugData.js';
			document.head.appendChild(imported);
		}
	}

	execute( cmd, optionalName ) {
		this.history.execute( cmd, optionalName );
		this.webGL.Render();
	}

	undo() {

		this.history.undo();
		this.webGL.Render();
	}

	redo() {

		this.history.redo();
		this.webGL.Render();
	}
}