export class InspectorView {
	constructor() {
		this.dom = null;

	}
}

export var InspectorComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new InspectorView();

	this._container.getElement().html(this.element.dom);
	this._container.getElement().parents().attr('id', 'inspector');
};