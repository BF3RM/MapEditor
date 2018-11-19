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
		Object.keys(editor.favorites).forEach(function(e) {

			let blueprint = editor.favorites[e];
			let entry = $(document.createElement("tr"));
			let icon = $(document.createElement("i"));
			let name = $(document.createElement("td"));
			let type = $(document.createElement("td"));
			entry.append(icon);
			entry.append(name);
			entry.append(type);
			icon.addClass("jstree-icon favoritable favorited");
			icon.addClass(blueprint.typeName);
			name.html(blueprint.getName());
			type.html(blueprint.typeName);

			icon.on('click', function(e) {
				//Unfavorite
				if(icon.hasClass("favorited")) {
					editor.RemoveFavorite(blueprint);
					blueprint.SetFavorite(false);
					icon.removeClass("favorited");
				} else {
					//Favorite
					editor.AddFavorite(blueprint);
					blueprint.SetFavorite(true);
					icon.addClass("favorited")
				}
				signals.favoritesChanged.dispatch();
			});

			name.on('click', function(e, data) {
				signals.spawnBlueprintRequested.dispatch(blueprint);
			});
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