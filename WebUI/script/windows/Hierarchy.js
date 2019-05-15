
class Hierarchy {
	constructor() {
		signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
		signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
		signals.selectedGameObject.add(this.onSelectedGameObject.bind(this));
		signals.deselectedGameObject.add(this.onDeselected.bind(this));
		signals.setObjectName.add(this.onSetObjectName.bind(this));
		signals.objectChanged.add(this.onObjectChanged.bind(this));
		signals.levelLoaded.add(this.onLevelLoaded.bind(this));


		this.data = {
			"name": "Root",
			"id": "root",
			"TypeName": "Root",
			"Parent": "root",
			"children": [
			]
		}

		this.selectedNodes = [];

		this.dom = this.CreateDom();
		this.tree = this.InitializeTree();
		this.topControls = this.CreateTopControls();
		this.subControls = this.CreateSubControls();

		this.entries = [];
		this.existingParents = [];
		this.Initialize();

		this.queue = [];

		this.filterOptions = {
			caseSensitive: false,
			exactMatch: false,
			includeAncestors: true,
			includeDescendants: true
		};
	}



	onSpawnedBlueprint(commandActionResult) {
		let scope = this;
		let gameObjectGuid = commandActionResult.gameObjectTransferData.guid
		let gameObject = editor.getGameObjectByGuid(gameObjectGuid);

		let currentEntry = gameObject.getNode();
		scope.entries[gameObjectGuid] = currentEntry;
		this.queue[currentEntry.id] = currentEntry;

		if(!editor.vext.executing) {
			console.log("Drawing");
			console.log(Object.keys(this.queue).length);

			let updatedNodes = {};

			for( let entryGuid in scope.queue) {
				let entry = scope.queue[entryGuid];
				//Check if the parent is in the queue
				if(this.queue[entry.parentGuid] != null) {
					this.queue[entry.parentGuid].children.push(entry);
					//Check if the parent node is already spawned

				} else if(this.tree.getNodeById(entry.parentGuid) != null) {
					if( this.existingParents[entry.parentGuid] == null) {
						this.existingParents[entry.parentGuid] = [];
					}
					console.log("Existing" + entry.name);
					this.existingParents[entry.parentGuid].push(entry);
				} else {
					if(this.existingParents["root"] == null) {
						this.existingParents["root"] = [];
					}
					console.log("Root")

					this.existingParents["root"].push(entry);
				}
			}
			for(let parentNodeId in this.existingParents) {
				this.tree.addChildNodes(this.existingParents[parentNodeId], undefined, this.tree.getNodeById(parentNodeId));
				delete this.existingParents[parentNodeId];
			}
			scope.queue = [];

		}
	}

	getEntry(guid) {
		return this.entries[guid];
	}

	onDestroyedBlueprint(commandActionResult) {
		let scope = this;

		//TODO: remove parent's reference in parent.children once groups are implemented

		let node = scope.tree.getNodeById(commandActionResult.gameObjectTransferData.guid);
		if (node !== null || node != undefined){
			scope.tree.removeNode(node);
		}
	}

	onLevelLoaded(levelData) {
		let scope = this;
		let levelEntry = {
			id: levelData.instanceGuid,
			name: levelData.name,
			type: "LevelData",
			state: {
				open: true
			},
			selectable: false,
			children: []
		};
		this.data.children.push(levelEntry);
		scope.tree.loadData(this.data)
	}

	onSetObjectName(commandActionResult) {
		let scope = this;
		let node = scope.dom.jstree(true).get_node(commandActionResult.gameObjectTransferData.guid);
		if (node !== null || node !== undefined){

			scope.dom.jstree(true).rename_node(node, commandActionResult.gameObjectTransferData.name);
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
				console.log(node);

				if(node == null) {
					return false;
				}
				if(node.selectable === false) {
					console.log("Unselectable")
					return false;
				}
				editor.Select(node.id, keysdown[17], false);
			},
			togglerClass: "Toggler",
			nodeIdAttr: "guid"

		});
	}

	CreateDom() {
		return new UI.Panel().dom;
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
				let v = searchInput.val();
				scope.tree.filter(v, scope.filterOptions);
			}, 250);
		});


		return dom;
	}

	check_callback(op, node, par, pos, more) {
		if(op === "move_node" ) {
			let child = editor.getGameObjectByGuid(node.id);
			let parent = editor.getGameObjectByGuid(par.id);

			if (child === undefined || parent === undefined || child.type === "GameEntity"){
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

	onSelectedGameObject(guid, isMultipleSelection, scrollTo) {
		let scope = this;
		let currentNode = scope.tree.getNodeById(guid);

		currentNode.state.selected = true;
		scope.tree.updateNode(currentNode, {}, { shallowRendering: false });
		if(scrollTo) {
			scope.tree.scrollToNode(currentNode);
		}
	}

	ExpandToNode(node) {
		let scope = this;
		if(node == null) {
			return;
		}
		if(node.parent.id != null) {
			scope.tree.openNode(node.parent);
			scope.ExpandToNode(node.parent);
		}
	}

	onDeselected(guid) {
		let scope = this;
		let currentNode = scope.tree.getNodeById(guid);

		currentNode.state.selected = false;
		scope.tree.updateNode(currentNode, {}, { shallowRendering: true });
	}

	onObjectChanged(gameObject, key, value) {
		let scope = this;
		if(key == "enabled") {
			let node = this.tree.getNodeById(gameObject.guid);
			node.children.forEach(function(child) {
				scope.tree.updateNode(child, {visible: value}, undefined);
			});
			this.tree.updateNode(node, {visible: value}, undefined);
			console.log(node);
		}
	}

	hierarchyRenderer(node, treeOptions) {
		if(node.state.filtered === false || node.visible === false ){
			return
		}
		let state = node.state;
		let row = new UI.Row();
		row.setAttribute("guid", node.id);
		row.setStyle("margin-left", (state.depth * 18) +"px");
		row.addClass("infinite-tree-item");

		if(state.selected) {
			row.addClass("infinite-tree-selected");
		}
		if(node.selectable !== undefined) {
			row.setAttribute("node-selectable", node.selectable);
		}

		if(node.draggable) {
			row.setAttribute("draggable", true);
		}
		if(node.droppable) {
			row.setAttribute("droppable", true);
		}
		if(node.hasChildren()) {
			row.add(new UI.Toggler(state.open));
		}
		row.add(new UI.Icon(node.type));
		row.add(new UI.Text(node.name));
		if(Object.keys(node.children).length > 0) {
			let count = new UI.Text(Object.keys(node.children).length);
			row.add(count);
			count.setStyle("padding-left", "10px");
			count.setStyle("opacity", "0.5");
		}
		
		$(row).on('click', function (e) {
			console.log(e);
		});
		return row.dom.outerHTML;
	}
}

var HierarchyComponent = function( container, state ) {
	this._container = container;
	this._state = state;
	this.element = new Hierarchy();

	this._container.getElement().append(this.element.topControls);
	this._container.getElement().append(this.element.dom);

};

