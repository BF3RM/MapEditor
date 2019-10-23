export class FavoritesView {
	constructor() {
		this.dom = null;
		this.directory = null;

		signals.favoritesChanged.add(this.onFavoritesChanged.bind(this));
		signals.favoriteAdded.add(this.onFavoriteAdded.bind(this));
		signals.favoriteRemoved.add(this.onFavoriteRemoved.bind(this));
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
		this.dom.add(this.header);
		this.directory = new UI.Table();
		this.dom.add(this.directory);
	}

	onFavoriteAdded(blueprint) {

	}

	onFavoriteRemoved(blueprint) {

	}

	onFavoritesChanged() {
		let scope = this;
		scope.directory.clear();
		Object.keys(editor.favorites).forEach(function(key) {
			let entry = editor.favorites[key].CreateEntry();
			scope.directory.add(entry);
		});
	}
}
var FavoritesComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new FavoritesView();

	this._container.getElement().html(this.element.dom.dom);
};