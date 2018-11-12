var TreeViewComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new TreeView();

	this._container.getElement().html(this.element.dom);

};