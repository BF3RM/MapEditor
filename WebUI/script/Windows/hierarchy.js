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

		this.dom = this.CreateDom();
		this.topControls = this.CreateTopControls();
		this.subControls = this.CreateSubControls();
		this.Initialize();

		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		/*signals.selectedEntity.add(this.onSelectedEntity.bind(this));
		signals.setObjectName.add(this.onSetObjectName.bind(this));
*/
	}

	onSpawnedBlueprint(command) {
		let scope = this;
		let parent = command.parent;
//		scope.dom.jstree(true).create_node("root", new HierarchyEntry(command.guid, command.name, command.type), "last");
		let entry = new HierarchyEntry(command.guid, command.name, command.type, scope.data.children.length, "root");
		scope.entries[command.guid] = entry;
		scope.data.children[scope.data.children.length] = entry;

		scope.dom.jstree(true).refresh();
	}

	onDestroyedBlueprint(command) {

	}


	Initialize() {

		// TODO: Implement node refresh logic here somewhere;
	}

	CreateDom() {
		let scope = this;
		let dom = $(document.createElement("div"));
		dom.jstree({
			'core': {
				'data': this.data,
				"check_callback" : true
			},
			"search": {

				"case_insensitive": true,
				"show_only_matches" : true


			},
			"plugins": ["search", "dnd"]
		});
		// Set data twice so we can update the scope data directly. :shrug:
		dom.jstree(true).settings.core.data = scope.data;
		dom.bind(
			"select_node.jstree", function(evt, data){
				editor.Select(data.node.id);
			});
		dom.bind("move_node.jstree", function (e, data) {
			scope.onMoved(data);
		});

		return dom;
	}

	CreateTopControls() {
		let scope = this;
		let dom = $(document.createElement("div"));
		let searchInput = $(document.createElement("input"));
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