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

	onFolderSelected(content) {
		this.directory.html("");
		this.directory.append(`
			<tr>
				<th><b>Name</b></th>
				<th><b>Type</b></th>
			</tr>
		`);
		for(let i = 0; i < content.length; i++) {
			let blueprint = editor.blueprintManager.getBlueprintByGuid(content[i].id);
			console.log(blueprint);
			let entry = $(document.createElement("tr"));
			let name = $(document.createElement("td"));
			let type = $(document.createElement("td"));
			entry.append(name);
			entry.append(type);
			name.html(content[i].text);
			type.html(blueprint.typeName);

			entry.on('click', function(e, data) {
				signals.spawnBlueprintRequested.dispatch(blueprint);
			});
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