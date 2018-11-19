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
			let entry = $(document.createElement("tr"));
			let icon = $(document.createElement("i"));
			let name = $(document.createElement("td"));
			let type = $(document.createElement("td"));
			entry.append(icon);
			entry.append(name);
			entry.append(type);
			icon.addClass("jstree-icon favoritable");
			icon.addClass(blueprint.typeName);
			name.html(blueprint.name.replace(folderName, ''));
			type.html(blueprint.typeName);

			icon.on('mouseover', function(e) {
				if(!blueprint.favorited) {
					icon.removeClass("favorited");
				}
			});
			icon.on('click', function(e) {
				//Unfavorite
				if(icon.hasClass("favorited")) {
					editor.RemoveFavorite(blueprint);
					icon.removeClass("favorited");
				} else {
					//Favorite
					editor.AddFavorite(blueprint);
					icon.addClass("favorited")
				}
				signals.favoritesChanged.dispatch();
			});

			name.on('click', function(e, data) {
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