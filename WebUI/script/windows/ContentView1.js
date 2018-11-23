class ContentView {
	constructor() {
		this.dom = null;
		this.directory = null;

		signals.folderSelected.add(this.onFolderSelected.bind(this));
		this.Initialize();
	}


	Initialize() {
		this.dom = $(document.createElement("div"));

		this.directory = $(document.createElement("table"));

		this.dom.append(this.directory);
	}

	onFolderSelected(folderName, content) {
		this.directory.html("");
		this.directory.append(`
			<tr>
				<th></th>
				<th><b>Name</b></th>
				<th><b>Type</b></th>
			</tr>
		`);
		for(let i = 0; i < content.length; i++) {
			let blueprint = editor.blueprintManager.getBlueprintByGuid(content[i].id);
			let entry = blueprint.CreateEntry(folderName);
			this.directory.append(entry);
		}
	}
}
var ContentViewComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new ContentView();

	this._container.getElement().html(this.element.dom);
};