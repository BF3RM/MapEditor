class TreeView {
	constructor(instances) {
		this.data = this.ParseStructure(instances);
		this.tree = document.createElement("div");
	}
	Initialize() {
		this.InitializeTree();
		this.RegisterEvents()
	}

	ParseStructure(table) {
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
		for (var key in table) {
			var instance = table[key];
			var path = instance.name;
			var paths = getPaths(path);
			var parentPath = data;
			var fileName = getFilename(path);
			paths.forEach(function(subPath) {
				var parentIndex = parentPath.children.find(x => x.text.toLowerCase() === subPath.toLowerCase());
				if (parentIndex === undefined) {
					var a = parentPath.children.push({
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
		return data
	}

	InitializeTree() {
		$(this.tree).jstree({
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
				var a1 = this.get_node(a);
				var b1 = this.get_node(b);
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
		$(this.tree).find(".search-input").keyup(function() {
			var searchString = $(this).val();
			delay(function() {
				console.log(searchString);
				$(this.tree).jstree('search', searchString);
			}, 500);

		});

		$(this.tree).on('changed.jstree', function(e, data) {
			if (data.node == null) {
				return
			}
			var id = data.node.original.id;
			if (id != null) {
				editor.PrepareInstanceSpawn(id);
			}
		})
	}
}


