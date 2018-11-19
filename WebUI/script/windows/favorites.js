class Favorites {
	constructor() {
		this.dom = null;
		this.directory = null;

		signals.favoritesChanged.add(this.onFavoritesChanged.bind(this));
		signals.favoriteAdded.add(this.onFavoriteAdded.bind(this));
		signals.favoriteRemoved.add(this.onFavoriteRemoved.bind(this));
		this.Initialize();
	}


	Initialize() {
		this.dom = $(document.createElement("div"));

		this.directory = $(document.createElement("table"));

		this.dom.append(this.directory);
	}

	onFavoriteAdded(blueprint) {

	}

	onFavoriteRemoved(blueprint) {

	}

	onFavoritesChanged() {
		let scope = this;
		scope.directory.html("");
		scope.directory.append(`
			<tr>
				<th></th>
				<th><b>Name</b></th>
				<th><b>Type</b></th>
			</tr>
		`);
		Object.keys(editor.favorites).forEach(function(key) {

			let entry = editor.favorites[key].CreateEntry(true);
			scope.directory.append(entry);
		});
	}
}
var FavoritesComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new Favorites();

	this._container.getElement().html(this.element.dom);
};