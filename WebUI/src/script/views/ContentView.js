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
		this.dom.add(this.Header());
		this.dom.add(this.directory);
	}


	onFolderSelected(folderName, content, searchString) {
		let scope = this;
		this.content = [];
		this.directory.clear();
		for(let i = 0; i < content.length; i++) {
			let blueprint = editor.blueprintManager.getBlueprintByGuid(content[i].id);
			let entry = scope.blueprintRenderer(blueprint, folderName);
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
				let entry = scope.blueprintRenderer(scope.content[i]);
				scope.directory.add(entry);
			}
		}
	}

	matches(name, searchString) {
		name = name.toLowerCase();
		searchString = searchString.toLowerCase();
		return (searchString === "" || searchString === undefined || name.includes(searchString));
	}

	blueprintRenderer(blueprint, folderName) {
		let entry = new UI.TableRow();
		let icon = new UI.Icon(blueprint.typeName);

		let cleanName;
		if(folderName === undefined) {
			cleanName = blueprint.getName();
		} else {
			cleanName = blueprint.name.replace(folderName, '');
		}
		let name = new UI.TableData(cleanName);

		entry.add(icon,name,new UI.TableData(blueprint.typeName));

		entry.setAttribute('draggable', true);
		entry.addClass("draggable");

		icon.addClass("jstree-icon favoritable");
		if(blueprint.favorited)
			icon.addClass("favorited");

		icon.dom.addEventListener('mouseover', function(e) {
			if(!blueprint.favorited) {
				icon.removeClass("favorited");
			}
		});

		icon.dom.addEventListener('click', function(e) {
			//Unfavorite
			if(blueprint.favorited) {
				editor.RemoveFavorite(blueprint);
				icon.removeClass("favorited");
			} else {
				//Favorite
				editor.AddFavorite(blueprint);
				icon.addClass("favorited")
			}
		});

		name.dom.addEventListener('click', function(e, data) {
			editor.SpawnBlueprint(blueprint);
		});

		$(entry.dom).draggable({
			helper : function() {
				let helper = $(document.createElement("div"));
				helper.addClass("dragableHelper");
				return helper;
			},
			cursorAt: {
				top: 0,
				left: 0
			},
			appendTo: 'body',
			start: function(e) {
				editor.editorCore.onPreviewDragStart(blueprint)
			},
			drag: function(e) {
				editor.editorCore.onPreviewDrag(e)
			},
			stop: function(e) {
				editor.editorCore.onPreviewDragStop()
			}
		});

		return entry;
	}

}
var ContentViewComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new ContentView();

	this._container.getElement().html(this.element.dom.dom);
};