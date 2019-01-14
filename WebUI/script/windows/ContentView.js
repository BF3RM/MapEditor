class ContentView {
	constructor() {
		this.dom = null;
		this.directory = null;
		this.content = [];

		signals.folderSelected.add(this.onFolderSelected.bind(this));
		signals.folderFiltered.add(this.onFolderFiltered.bind(this));
		this.Initialize();
	}


	Initialize() {
		this.dom = $(document.createElement("div"));

		this.directory = $(document.createElement("table"));

		this.dom.append(this.directory);
	}

	onFolderSelected(folderName, content, searchString) {
		let scope = this;
		this.content = [];
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
			let entry = blueprint.CreateEntry();
			this.content.push(blueprint);
			if(scope.matches(blueprint.getName(), searchString)) {
				this.directory.append(entry);
			}
		}
	}

	onFolderFiltered(searchString) {
		let scope = this;
		scope.directory.html("");
		this.directory.append(`
			<tr>
				<th></th>
				<th><b>Name</b></th>
				<th><b>Type</b></th>
			</tr>
		`);
		for(let i = 0; i < scope.content.length; i++) {
			if(scope.matches(scope.content[i].getName(), searchString)) {
				let entry = scope.content[i].CreateEntry();
				scope.directory.append(entry);
			}
		}
	}

	matches(name, searchString) {
		name = name.toLowerCase();
		searchString = searchString.toLowerCase();
		return (searchString === "" || searchString === undefined || name.includes(searchString));
	}

}
var ContentViewComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new ContentView();

	this._container.getElement().html(this.element.dom);
};