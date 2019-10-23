export class HistoryView {
	constructor() {
		this.dom = this.CreateDom();
		this.Initialize();
		signals.historyChanged.add(this.onHistoryChanged.bind(this));
	}

	Initialize() {

	}

	CreateDom() {
		let scope = this;
		let dom = $(document.createElement("ul"));
		dom.addClass("historyWindow");

		return dom;
	}

	onHistoryChanged(cmd) {
		let scope = this;
		let history = editor.history;
		scope.dom.html("");
		for(let i = 0; i < history.undos.length; i++) {
			let entry = $(document.createElement("li"));
			entry.addClass("undo");
			entry.text(history.undos[i].name);
			entry.attr('historyStep', history.undos[i].id);
			scope.dom.append(entry);

			entry.on('click', function(e) {
				editor.history.goToState( parseInt( this.getAttribute('historyStep') ) )
			});
		}

		for(let i = history.redos.length -1; i >= 0 ; i--) {
			let entry = $(document.createElement("li"));
			entry.addClass("redo");
			entry.text(history.redos[i].name);
			entry.attr('historyStep', history.redos[i].id);
			scope.dom.append(entry);

			entry.on('click', function(e) {
				editor.history.goToState( parseInt( this.getAttribute('historyStep') ) )
			});
		}

	}
}

var HistoryComponent = function(container, state ) {
	this._container = container;
	this._state = state;
	this._element = new HistoryView();
	container.getElement().html(this._element.dom);
};