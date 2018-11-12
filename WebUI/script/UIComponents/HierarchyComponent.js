var HierarchyComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new Hierarchy();

	this._container.getElement().html(this.element.dom);

};