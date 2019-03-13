class ContentView {
	constructor() {
		this.dom = null;
		this.directory = null;
		this.content = [];

		signals.folderSelected.add(this.onFolderSelected.bind(this));
		signals.folderFiltered.add(this.onFolderFiltered.bind(this));
		this.header = this.Header();

		this.Initialize();
	}

	Header() {
		let row = new UI.TableRow();
		row.add(new UI.TableHeader());
		row.add(new UI.TableHeader("Name"));
		row.add(new UI.TableHeader("Type"));
		return row;
	}


	Initialize() {
		this.dom = new UI.Panel();

		this.directory = new UI.Table();
		this.directory.add(this.header);
		this.dom.add(this.Header());
		this.dom.add(this.directory);
	}


	onFolderSelected(folderName, content, searchString) {
		let scope = this;
		this.content = [];
		this.directory.clear();
		for(let i = 0; i < content.length; i++) {
			let blueprint = editor.blueprintManager.getBlueprintByGuid(content[i].id);
			let entry = blueprint.CreateEntry(folderName);
			this.content.push(blueprint);
			if(scope.matches(blueprint.getName(), searchString)) {
				this.directory.add(entry);
			}
		}
	}

	onFolderFiltered(searchString) {
		let scope = this;
		scope.directory.clear();
		for(let i = 0; i < scope.content.length; i++) {
			if(scope.matches(scope.content[i].getName(), searchString)) {
				let entry = scope.content[i].CreateEntry();
				scope.directory.add(entry);
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

	this._container.getElement().html(this.element.dom.dom);
};