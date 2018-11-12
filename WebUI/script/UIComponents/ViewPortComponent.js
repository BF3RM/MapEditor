var ViewPortComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	console.log(this);

	console.log(container);
	container.getElement().addClass("viewPort");
	container.on( 'open', this._createGrid, this );
};

ViewPortComponent.prototype._createGrid = function() {

	this._container.on( 'resize', this._resize, this );
	this._container.on( 'destroy', this._destroy, this );
	this._resize();
};


ViewPortComponent.prototype._resize = function() {

};

ViewPortComponent.prototype._destroy = function() {

};