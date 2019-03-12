
class Hierarchy {
	constructor() {
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		signals.createdGroup.add(this.onCreatedGroup.bind(this));
		signals.destroyedGroup.add(this.onDestroyedGroup.bind(this));
		signals.selectedGameObject.add(this.onSelectedGameObject.bind(this));
		signals.deselectedGameObject.add(this.onDeselected.bind(this));
		signals.setObjectName.add(this.onSetObjectName.bind(this));


		this.data = {
			id: 'root',
			name: 'root',
			type: 'root',
			state: {
				open: true
			},
			selectable: false,
			children: []
		};

		this.dom = this.CreateDom();
		this.tree = this.InitializeTree();
		this.topControls = this.CreateTopControls();
		this.subControls = this.CreateSubControls();
		this.Initialize();

		this.queue = [];

	}

	onSpawnedBlueprint(command) {
		let scope = this;
		let gameObject = editor.getGameObjectByGuid(command.guid);

		let parent = command.parent;
		let node = scope.tree.getNodeById("root");

		if(parent != null) {
			node = scope.tree.getNodeById(parent);
		}

		scope.tree.addChildNodes([gameObject.getNode()], undefined, node);
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

	onCreatedGroup(command) {
		let scope = this;
		let parent = command.parent;
		//		scope.dom.jstree(true).create_node("root", new HierarchyEntry(command.guid, command.name, command.type), "last");
		let entry = new HierarchyEntry(command.guid, command.name, "", scope.data.children.length, "root");
		scope.entries[command.guid] = entry;
		scope.data.children[scope.data.children.length] = entry;
		scope.dom.jstree(true).create_node('root' ,  entry, "last", function(){
		});

	}

	onDestroyedGroup(command) {

	}

	onSetObjectName(command) {
		let scope = this;
		let node = scope.dom.jstree(true).get_node(command.guid);
		if (node !== null || node !== undefined){

			scope.dom.jstree(true).rename_node(node, command.name);
		}
	}

	Initialize() {
		let scope = this;
		scope.tree.on('selectNode', function(node) {
			console.log(node);
			// → Node {} (The selected node)
			// → null (No nodes selected)
		});
		// TODO: Implement node refresh logic here somewhere;
	}

	InitializeTree() {
		let scope = this;
		return new InfiniteTree({
			el: scope.dom,
			data: scope.data,
			rowRenderer: scope.hierarchyRenderer,
			autoOpen: true, // Defaults to false
			droppable: { // Defaults to false
				hoverClass: 'infinite-tree-droppable-hover',
				accept: function(event, options) {
					return true;
				},
				drop: function(event, options) {
				}
			},
			shouldSelectNode: function(node) { // Determine if the node is selectable
				if(node.selectable === false) {
					return false;
				}
				if (!node || (node === scope.tree.getSelectedNode())) {
					return false; // Prevent from deselecting the current node
				}
				if(editor.isSelected(node.id)) {
					return true;
				}
				editor.Select(node.id, keysdown[17]);
			},
			togglerClass: "Toggler",
			nodeIdAttr: "node-id"

		});
	}

	CreateDom() {
		let scope = this;
		let dom = document.createElement("div");

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

	check_callback(op, node, par, pos, more) {
		if(op === "move_node" ) {
			let child = editor.getGameObjectByGuid(node.id);
			let parent = editor.getGameObjectByGuid(par.id);

			if (child === undefined || parent === undefined || parent.type !== "Group" || child.type === "GameEntity"){
				return false;
			}
		}
	}

	CreateSubControls() {
		let dom = $(document.createElement("div"));
		return dom;
	}


	onMoved(nodeData) {
		let scope = this;
		// TODO: update data with the changes
		let child = editor.getGameObjectByGuid(nodeData.node.id);
		let parent = editor.getGameObjectByGuid(nodeData.parent);
	}

	onSelectedGameObject(guid, isMultipleSelection) {
		let scope = this;
		let node = scope.tree.getNodeById(guid);
		scope.ExpandToNode(node);

		scope.tree.selectNode(node, {
			autoScroll: true,
			silent: true
		});
	}

	ExpandToNode(node) {
		let scope = this;
		if(node.parent.id != null) {
			scope.tree.openNode(node.parent);
			scope.ExpandToNode(node.parent);
		}
	}

	onDeselected(guid) {
		console.log("deselect " + guid);
		let scope = this;
		//let node = scope.dom.jstree(true).get_node(guid);
		//this.dom.jstree(true).deselect_node(node);
	}

	hierarchyRenderer(node, treeOptions) {
		let state = node.state;
		let row = new UI.Row();
		row.setAttribute("node-id", node.id);
		row.setStyle("margin-left", (state.depth * 18) +"px");
		row.addClass("infinite-tree-item");
		if(state.selected) {
			row.addClass("infinite-tree-selected");
		}
		if(node.selectable !== undefined) {
			row.setAttribute("node-selectable", node.selectable);
		}
		if(node.hasChildren()) {
			row.add(new UI.Toggler(state.open));
		}
		if(node.draggable) {
			row.setAttribute("draggable", true);
		}
		if(node.droppable) {
			row.setAttribute("droppable", true);
		}
		row.add(new UI.Icon(node.type));
		row.add(new UI.Text(node.name));
		row.add(new UI.Text(Object.keys(node.children).length));

		console.log(node);
		return row.dom.outerHTML;
	}
}

class HierarchyEntry {
	constructor(guid, name, type, position, parent) {
		this.id = guid;
		this.name = name;
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

