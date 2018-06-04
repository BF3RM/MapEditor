class TreeView {
	constructor() {
		this.data = null;
		this.dom = $(document.createElement("div"));
		this.controls = this.CreateControls();
		this.tree = null;
	}

	LoadData(table) {
		let data = {
			"type": "folder",
			"text": "Venice",
			"state": {
				"opened": true,
				"selected": true,
			},
			"children": []
		};
		//TODO: Make sure this works after the new blueprint shit.
		for (let key in table) {
            let instance = table[key];
            let path = instance.name;
            let paths = getPaths(path);
            let parentPath = data;
            let fileName = getFilename(path);
			paths.forEach(function(subPath) {
                let parentIndex = parentPath.children.find(x => x.text.toLowerCase() === subPath.toLowerCase());
				if (parentIndex === undefined) {
                    let a = parentPath.children.push({
						"type": "folder",
						"text": subPath,
						"children": []
					});
					parentPath = parentPath.children[a - 1];
				} else {
					parentPath = parentIndex;
					// Sometimes the object is referenced lowercase. If we have a string that has uppercase letters, we can assume it's correct.
					// Replace lowercase paths with the actual case.
					if (hasUpperCase(subPath) && hasLowerCase(parentPath.text)) {
						parentPath.text = subPath;
					}
				}
			});
			parentPath.children.push({
				"type": "file",
				"text": fileName,
				"id": key
			})
		}
		this.data = data;
        this.InitializeTree();
        this.RegisterEvents();
	}

	InitializeTree() {
		this.tree = $(this.dom).jstree({
			"types": {
				"folder": {
					"icon": "jstree-folder"
				},
				"file": {
					"icon": "jstree-file"
				}
			},
			"plugins": ["types", "sort", "json_data", "search"],
			"search": {
				"case_insensitive": true,
				"show_only_matches": true
			},
			"sort": function(a, b) {
				let a1 = this.get_node(a);
				let b1 = this.get_node(b);
				if (a1.icon == b1.icon) {
					return (a1.text.toLowerCase() > b1.text.toLowerCase()) ? 1 : -1;
				} else {
					return (a1.icon < b1.icon) ? 1 : -1;
				}
			},
			'core': {
				'data': [this.data]
			}
		});
	}
	RegisterEvents() {
		this.controls.find(".search-input").keyup(function() {
			let searchString = $(this).val();
			delay(function() {
				console.log(searchString);
				editor.ui.treeView.tree.jstree('search', searchString);
			}, 500);

		});

		$(this.dom).on('changed.jstree', function(e, data) {
			if (data.node == null) {
				return
			}
			let id = data.node.original.id;
			if (id != null) {
				editor.PrepareInstanceSpawn(id);
			}
		})
	}
	CreateControls() {
		let controls = $(document.createElement("div"));
		controls.class = "contentControls";

		let search = $(document.createElement("input"));
		search.addClass("search-input form-control");
		controls.append(search);

		return controls;
	}
}


