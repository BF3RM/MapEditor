class Hierarchy {
	constructor() {
		this.data = {
			"id": "root",
			"text": "root",
			"icon": "",
			"data": {
				"position": 0,
				"parent": null
			},
			"state": {
				"opened": true,
				"disabled": true,
				"selected": false
			},
			"children": [],
			"liAttributes": null,
			"aAttributes": null
		};

		this.entries = [];
		this.entries["root"] = this.data;

		this.selected = this.entries["root"];

		this.dom = this.CreateDom();
		this.topControls = this.CreateTopControls();
		this.subControls = this.CreateSubControls();
		this.Initialize();

		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		signals.selectedEntity.add(this.onSelectedEntity.bind(this));
		/*signals.setObjectName.add(this.onSetObjectName.bind(this));
*/
	}

	onSpawnedBlueprint(command) {
		let scope = this;
		let parent = command.parent;
//		scope.dom.jstree(true).create_node("root", new HierarchyEntry(command.guid, command.name, command.type), "last");
		let entry = new HierarchyEntry(command.guid, command.name, command.parameters.reference.typeName, scope.data.children.length, "root");
		scope.entries[command.guid] = entry;
		scope.data.children[scope.data.children.length] = entry;
		scope.dom.jstree(true).create_node('root' ,  entry, "last", function(){
		});

	}

	getEntry(guid) {
		return this.entries[guid];
	}

	onDestroyedBlueprint(command) {
		let scope = this;
		let parent = command.parent;

		//TODO: remove parent's reference in parent.children once groups are implemented

		let node = scope.dom.jstree(true).get_node(command.guid);
		if (node !== null || node != undefined){
			scope.dom.jstree(true).delete_node(node);
		}
		
	}


	Initialize() {

		// TODO: Implement node refresh logic here somewhere;
	}

	CreateDom() {
		let scope = this;
		let dom = $(document.createElement("div"));
		dom.jstree({
			core: {
				data: this.data,
				check_callback : true
			},
			search: {
				case_insensitive: true,
				show_only_matches : true
			},

			plugins: ["search", "dnd", "types"]
		});
		// Set data twice so we can update the scope data directly. :shrug:
		dom.jstree(true).settings.core.data = scope.data;
		dom.bind(
			"select_node.jstree", function(evt, data){
				if(scope.selected.id !== data.node.id) {
					editor.Select(data.node.id);
				}
			});
		dom.bind("move_node.jstree", function (e, data) {
			scope.onMoved(data);
		});

		return dom;
	}

	CreateTopControls() {
		let scope = this;
		let dom = $(document.createElement("div"));
		dom.addClass("contentControls");
		let searchInput = $(document.createElement("input"));
		searchInput.attr("placeholder", "Search");
		dom.append(searchInput);

		var to = false;
		searchInput.keyup(function () {
			if(to) { clearTimeout(to); }
			to = setTimeout(function () {
				var v = searchInput.val();
				scope.dom.jstree(true).search(v);
			}, 250);
		});


		return dom;
	}
	CreateSubControls() {
		let dom = $(document.createElement("div"));
		return dom;
	}


	onMoved(nodeData) {
		let scope = this;
//		scope.data =
		// TODO: update data with the changes
	}

	onSelectedEntity(command) {

		this.dom.jstree('deselect_node', this.selected);
		this.dom.jstree('select_node', command.guid);
		this.selected = this.getEntry(command.guid);
	}
}

class HierarchyEntry {
	constructor(guid, name, type, position, parent) {
		this.id = guid;
		this.text = name;
		this.icon = type;
		this.data = {};
		this.data.position = position;
		this.data.parent = parent;
		this.state = {
			"opened": false,
			"disabled": false,
			"selected": false
		};
		this.children = [];
	};
}

var HierarchyComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new Hierarchy();

	this._container.getElement().append(this.element.topControls);
	this._container.getElement().append(this.element.dom);

};