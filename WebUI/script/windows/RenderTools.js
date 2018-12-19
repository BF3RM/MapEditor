class RenderTools {
	constructor() {
		this.dom = null;
		this.transform = null;
		this.name = null;
		this.variation = null;
		this.enabled = false;
		this.Initialize();
	}

	Initialize () {
	}
}

var RenderToolsComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new RenderTools();
};
