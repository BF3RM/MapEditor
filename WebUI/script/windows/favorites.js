class Favorites {
	constructor() {
		this.dom = null;
		this.directory = null;

		signals.favoritesChanged.add(this.onFavoritesChanged.bind(this));
		this.Initialize();
	}


	Initialize() {
		this.dom = $(document.createElement("div"));

		this.directory = $(document.createElement("table"));

		this.dom.append(this.directory);
	}

	onFavoritesChanged() {
		this.directory.html("");
		this.directory.append(`
			<tr>
				<th></th>
				<th><b>Name</b></th>
				<th><b>Type</b></th>
			</tr>
		`);
		for(let i = 0; i < editor.favorites.length; i++) {
			let blueprint = editor.favorites[i];
			console.log(blueprint);
			let entry = $(document.createElement("tr"));
			let icon = $(document.createElement("i"));
			let name = $(document.createElement("td"));
			let type = $(document.createElement("td"));
			entry.append(icon);
			entry.append(name);
			entry.append(type);
			icon.addClass("jstree-icon");
			icon.addClass(blueprint.typeName);
			name.html(editor.favorites[i].getName());
			type.html(blueprint.typeName);

			entry.on('click', function(e, data) {
				signals.spawnBlueprintRequested.dispatch(blueprint);
			});
			this.directory.append(entry);
		}
	}
}
var FavoritesComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new Favorites();

	this._container.getElement().html(this.element.dom);
};