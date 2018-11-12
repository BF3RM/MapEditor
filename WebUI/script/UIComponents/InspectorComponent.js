var InspectorComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new Inspector();

	this._container.getElement().html(this.element.dom);
	this._container.getElement().parents().attr('id', 'inspector');


};