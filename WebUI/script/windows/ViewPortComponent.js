var ViewPortComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	console.log(container.getElement().parent()[0]);
	container.getElement().parents().addClass("viewPort");
	container.getElement().html( '<h2></h2>');
};