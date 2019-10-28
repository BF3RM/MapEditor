export class ConsoleView {
	constructor() {
		this.dom = new UI.Panel();
		;
		this.header = this.Header();

		this.Initialize();
	}

	Header() {
		let row = new UI.TableRow();
		return row;
	}


	Initialize() {
	}


}

export var ConsoleViewComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new ConsoleView();

	this._container.getElement().html(this.element.dom.dom);
};
