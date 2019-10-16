//Cursed land, do not touch.
class ImportWindow {
    constructor() {
        this.panel = new UI.Panel();
        this.dom = this.panel.dom;

        this.bundle = null;
        this.superBundle = null;

        this.widgets = {};
        this.topControls = this.CreateTopControls();
        this.debugBox = null;

        this.missing = [];
        this.layout = null;
        this.InitializeWidgets();
        this.CreateContent();
        this.Initialize();
	    this.filterOptions = {
		    caseSensitive: false,
		    exactMatch: false,
		    includeAncestors: true,
		    includeDescendants: true
	    };


	    this.importList = {
	    	superBundles: {},
		    bundles: {}
	    };
    }

    Initialize() {
        let scope = this;
        this.panel.setId("BundleImport");
        let config;
        config = {
            settings: {
                hasHeaders: true,
                constrainDragToContainer: true,
                reorderEnabled: true,
                selectionEnabled: false,
                popoutWholeStack: false,
                blockedPopoutsThrowError: true,
                closePopoutsOnUnload: true,
                showPopoutIcon: false,
                showMaximiseIcon: false,
                showCloseIcon: false,
                responsiveMode: 'onload'
            },
            dimensions: {
                borderWidth: 5,
                minItemHeight: 10,
                minItemWidth: 10,
                headerHeight: 20,
                dragProxyWidth: 300,
                dragProxyHeight: 200
            },
            labels: {
                close: 'close',
                maximise: 'maximise',
                minimise: 'minimise',
                popout: 'open in new window',
                popin: 'pop in',
                tabDropdown: 'additional tabs'
            },
			content: [
				{
					type: 'column',
					isClosable: false,
					reorderEnabled: false,
					title: '',
					content: [
						{
							type: 'row',
							width: 10,
							isClosable: false,
							reorderEnabled: false,
							title: '',
							height: 90,
							content: [
								{
									type: 'column',
									isClosable: false,
									reorderEnabled: false,
									title: '',
									width: 50,
									content: [
										{
											type: 'stack',
											height: 10,
											isClosable: false,
											reorderEnabled: false,
											title: '',
											activeItemIndex: 0,
											content: [
												{
													type: 'component',
													componentName: 'LevelSelection',
													isClosable: false,
													title: 'LevelSelection',
													height: 4,
													reorderEnabled: false
												}
											]
										},
										{
											type: 'stack',
											height: 30,
											isClosable: false,
											reorderEnabled: false,
											title: '',
											activeItemIndex: 0,
											content: [
												{
													type: 'component',
													componentName: 'PathSelection',
													isClosable: false,
													title: 'PathSelection',
													height: 4,
													reorderEnabled: false
												}
											]
										},
										{
											type: 'stack',
											height: 50,
											isClosable: false,
											reorderEnabled: false,
											title: '',
											activeItemIndex: 0,
											content: [
												{
													type: 'component',
													componentName: 'ContentSelection',
													isClosable: false,
													title: 'ContentSelection',
													height: 30,
													reorderEnabled: false
												}
											]
										}
									]
								},
								{
									type: 'column',
									isClosable: false,
									reorderEnabled: false,
									title: '',
									width: 50,
									content: [
										{
											type: 'stack',
											height: 50,
											isClosable: false,
											reorderEnabled: false,
											title: '',
											activeItemIndex: 0,
											content: [
												{
													type: 'component',
													componentName: 'BundleSelection',
													isClosable: false,
													title: 'BundleSelection',
													height: 4,
													reorderEnabled: false
												}
											]
										},
										{
											type: 'stack',
											height: 45,
											isClosable: false,
											reorderEnabled: false,
											title: '',
											activeItemIndex: 0,
											content: [
												{
													type: 'component',
													componentName: 'ContentInfo',
													isClosable: false,
													title: 'ContentInfo',
													height: 30,
													reorderEnabled: false
												}
											]
										}
									]
								}
							]
						},
						{
							type: 'stack',
							header: {},
							isClosable: false,
							reorderEnabled: false,
							title: '',
							activeItemIndex: 0,
							height: 10,
							content: [
								{
									type: 'component',
									componentName: 'BottomControls',
									isClosable: false,
									title: 'BottomControls',
									reorderEnabled: false
								}
							]
						}
					]
				}
			],
			isClosable: false,
			reorderEnabled: false,
			title: '',
			openPopouts: [],
			maximisedItemId: null
		};



        this.layout = new GoldenLayout( config, "#BundleImport" );

        Object.values(this.widgets).forEach(function (l_Widget) {
            l_Widget.component = function (container, state) {
                this._container = container;
                this._state = state;
                container.on( 'tab', function( tab ){
                    //tab.element.hide();
                    //console.log(tab);
                });
                this._container.getElement().html(l_Widget.el.dom);
            };
            scope.layout.registerComponent( l_Widget.name, l_Widget.component);
            console.log("Registered component: " + l_Widget.name);
        });


        this.layout.init();
        this.dom.addEventListener("resize", () => {
            this.layout.updateSize();
        });

    }

    InitializeWidgets() {
        this.AddWidget("LevelSelection", UI.Select);
        this.AddWidget("BundleSelection", UI.Panel);
        this.AddWidget("PathSelection", UI.Panel);
        this.AddWidget("ContentSelection", UI.UnsortedList);
        this.AddWidget("ContentInfo", UI.UnsortedList);
        this.AddWidget("BottomControls", UI.Panel);
        this.SpawnWidgets();
    }
    AddWidget(name, widgetType) {
        this.widgets[name] = {
            data: {},
            name: name,
            component: null,
            el: new widgetType()
        };
    }
    SpawnWidgets() {
        let scope = this;
        Object.values(this.widgets).forEach(function (l_Widget) {
            //scope.panel.add(l_Widget.el)
        });
    }

    CreateContent() {
        let scope = this;
        let wget = scope.widgets["LevelSelection"];
        wget.el.setId("LevelSelection");
        wget.data = [];
        wget.data["all"] = "All";
        wget.el.setOptions(wget.data);
        wget.el.setValue("All");


        wget = scope.widgets["BundleSelection"];
        wget.el.setId("BundleSelection");
        wget.data.treeData = {
            id: "all",
            name: "All",
            children: [],
            state: {
                open: true
            }
        };
        wget.data.tree = new InfiniteTree({
            el:  wget.el.dom,
            data: wget.data.treeData,
            rowRenderer: scope.hierarchyRenderer,

            autoOpen: true, // Defaults to false
            rowsInBlock: 100,
            shouldSelectNode: function(node) { // Determine if the node is selectable
                console.log(node);

                if(node == null) {
                    return false;
                }
                if(node.selectable === false) {
                    console.log("Unselectable");
                    return false;
                }
                scope.OnBundleSelected(node.id);
                return true;
            },
            togglerClass: "Toggler",
            nodeIdAttr: "guid"

        });


        wget = scope.widgets["PathSelection"];
        wget.el.setId("PathSelection");
        wget.data.treeData = {
            id: "all",
            name: "All",
            children: [],
            state: {
                open: true
            }
        };
        wget.data.tree = new InfiniteTree({
            el:  wget.el.dom,
            data: wget.data.treeData,
            rowRenderer: scope.hierarchyRenderer,
	        autoOpen: true, // Defaults to false

            rowsInBlock: 100,
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
                    console.log("Unselectable");
                    return false;
                }
                let currentNode = node;
                scope.OnPathSelected(node.id);
	            return true;

            },
            togglerClass: "Toggler",
            nodeIdAttr: "guid"

        });

	    wget = scope.widgets["ContentSelection"];
	    wget.el.setId("ContentSelection");
	    wget.data.treeData = {
		    id: "all",
		    name: "All",
		    children: [],
		    state: {
			    open: true
		    }
	    };
	    wget.data.tree = new InfiniteTree({
		    el:  wget.el.dom,
		    data: wget.data.treeData,
		    rowRenderer: scope.hierarchyRenderer,

		    autoOpen: true, // Defaults to false
		    rowsInBlock: 100,
		    shouldSelectNode: function(node) { // Determine if the node is selectable

			    if(node == null) {
				    return false;
			    }
			    if(node.selectable === false) {
				    console.log("Unselectable");
				    return false;
			    }
			    let currentNode = node;
			    console.log(currentNode);
			    let entry = editor.fbdMan.getPartition(currentNode.id);
			    console.log(entry);
			    scope.OnPartitionSelected(entry);
			    return true;

		    },
		    togglerClass: "Toggler",
		    nodeIdAttr: "guid"

	    });
        wget = scope.widgets["BottomControls"];
        wget.el.setId("BottomControls");

		let inputSearch = new UI.Input("Search");
		inputSearch.setAttribute("placeholder", "Search");
		inputSearch.onKeyUp(() => {
	        if(wget.data.to) { clearTimeout(wget.data.to); }
	        wget.data.to = setTimeout(function () {
		        let v = inputSearch.getValue();
		        scope.widgets["ContentSelection"].data.tree.filter(v, scope.filterOptions);
	        }, 250);
        });
		wget.el.add(inputSearch);

		let buttonOK = new UI.Button("Ok");
		buttonOK.onClick( () => {
			console.log("ok")
		});
		wget.el.add(buttonOK);

		let buttonCancel = new UI.Button("Cancel");
		buttonCancel.onClick( () => {
			console.log("Cancel")
		});
		wget.el.add(buttonCancel);



	    wget = scope.widgets["ContentInfo"];
	    wget.data.treeData = {
		    id: "SuperBundles",
		    name: "SuperBundles",
		    children: [],
		    state: {
			    open: true
		    }
	    };

	    wget.data.tree = new InfiniteTree({
		    el:  wget.el.dom,
		    data: wget.data.treeData,
		    rowRenderer: scope.hierarchyRenderer,

		    autoOpen: true, // Defaults to false
		    rowsInBlock: 100,
		    shouldSelectNode: function(node) { // Determine if the node is selectable
			    console.log(node);

			    if(node == null) {
				    return false;
			    }
			    if(node.selectable === false) {
				    console.log("Unselectable");
				    return false;
			    }
			    scope.OnBundleSelected(node.id, true);
			    return true;
		    },
		    togglerClass: "Toggler",
		    nodeIdAttr: "guid"
	    });
    }

    Update() {
        let scope = this;
        let wget = scope.widgets["LevelSelection"];
        let superBundles = editor.fbdMan.getSuperBundles();
        let superBundleNames = [];
        superBundleNames["all"] = "All";
        Object.keys(superBundles).forEach(function (name) {
            superBundleNames[name] = name;
        });
        wget.data = superBundleNames;
        wget.el.setOptions(wget.data);
        wget.el.setValue("all");
        wget.el.onChange(function (e) {
            let val = e.target.value;
            scope.SetSuperbundle(val);
        });
        wget = scope.widgets["BundleSelection"];
    }
    OnSuperBundleSelected(p_SuperBundle) {

    }

    OnBundleSelected(p_BundleName, p_ShowOnly = false) {
    	console.log(p_BundleName);
        let scope = this;
        setTimeout(() => {
            scope.GeneratePathData(p_BundleName);
        });
        if(p_ShowOnly) {
        	return;
        }
	    let bundleData = editor.fbdMan.getBundle(p_BundleName);
	    if(bundleData === undefined || bundleData.name.toLowerCase() === "all") {
	    	return;
	    }
		scope.bundle = bundleData;
	    let wget = scope.widgets["ContentInfo"];
	    // Add bundle
	    if(scope.importList.bundles[this.bundle.name] === undefined) {
		    // Superbundle not mounted, mount it
			if(scope.importList.superBundles[this.superBundle.name] === undefined) {
				scope.importList.superBundles[this.superBundle.name] = {
					id: this.superBundle.name,
					name: this.superBundle.fileName,
					children: []
				};
				// Add tree node
				wget.data.tree.appendChildNode({
					id: "superbundle_"+ scope.superBundle.name,
					file: scope.superBundle.name,
					name: scope.superBundle.fileName,
					children: [],
					state: {
						open: true
					}
				}, wget.data.tree.getNodeById("SuperBundles"));
			}
			// Register that we want to load this bundle
		    scope.importList.superBundles[this.superBundle.name].children[scope.bundle.name] = true;
			// Register that this bundle is supposed to be mounted
	        scope.importList.bundles[this.bundle.name] = this.bundle;

			// Create entry for tree
	        wget.data.tree.appendChildNode({
		        id: scope.bundle.name,
		        name: scope.bundle.fileName,
		        file: scope.superBundle.name,
		        children: [],
		        state: {
			        open: true
		        }
	        }, wget.data.tree.getNodeById("superbundle_"+ scope.superBundle.name));
        } else { // Remove bundle
		    scope.importList.superBundles[this.superBundle.name].children[scope.bundle.name] = undefined;
		    if(Object.keys(scope.importList.superBundles[this.superBundle.name].children).length === 0) {
			    scope.importList.superBundles[this.superBundle.name] = undefined;
			    let node = wget.data.tree.getNodeById("superbundle_" + this.superBundle.name);
			    wget.data.tree.removeNode(node);
		    }
		    scope.importList.bundles[p_BundleName] = undefined;
	        let node = wget.data.tree.getNodeById(p_BundleName);
	        wget.data.tree.removeNode(node);
        }

        console.log("bundle");
    }

    OnPathSelected(p_Path) {
        let scope = this;

        setTimeout(() => {
            scope.GenerateContentData(p_Path);
        });
        console.log("path");
    }

    SetSuperbundle(p_SuperBundleName) {
        console.log("Changing SuperBundle to " + p_SuperBundleName);
        this.superBundle = editor.fbdMan.getSuperBundle(p_SuperBundleName);

        let scope = this;

        setTimeout(() => {
            scope.GenerateBundleData(p_SuperBundleName);
        });
        console.log("super");
    }

    SetBundle(value) {
        console.log("Changing Bundle to " + value);
        this.bundle = editor.fbdMan.getBundle(value);
        let scope = this;

        scope.GenerateContentData(value);

    }

    GenerateBundleData(superBundle) {
        let data = editor.fbdMan.getBundles(superBundle);
        let BundleTreeData = this.GenerateTreeData(data);
        this.SetData("BundleSelection", BundleTreeData);
    }

    GeneratePathData(bundle) {
        let data = editor.fbdMan.getPartitions(bundle);
        let PathTreeData = this.GenerateTreeData(data, false);
        this.SetData("PathSelection", PathTreeData);
    }
    GenerateContentData(path) {
        if(path === "All") {
            path = "";
        }
	    let currentBundle = this.bundle.name;
        let bundles = editor.fbdMan.getBundles(currentBundle);
	    if(currentBundle.toLowerCase() === "all") {
		    currentBundle = "";
	    }
        let partitions = [];

        let out = {
            id: "all",
            name: "All",
            children: [],
	        state: {
		        open: true
	        }
        };


        let added = [];
        Object.values(bundles).forEach( (bundle) => {
            if (bundle.name.includes(currentBundle)) {
                let partitions = bundle.partitions;
                for (var partitionName in partitions) {
	                let partition = partitions[partitionName];
	                if(added[partition.name] === undefined) {
		                if (partition.children === undefined && partition.name.includes(path)) {
			                out.children.push({
				                "id": partition.name,
				                "name": partition.name.replace(path, ""),
				                "guid": partition.guid
			                });
			                added[partition.name] = true;
		                } else if(partition.name.includes(path)) {
			                out.children.push({
				                "id": partition.name,
				                "name": partition.name.replace(path, ""),
				                "guid": partition.guid
			                });
			                added[partition.name] = true;
		                }
	                }
                }
            }
        });

		out.children.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1);
        this.SetPathViewData(out);
    }

    SetPathViewData(data) {
    	console.log(data);
	    let scope = this;

	    this.SetData("ContentSelection", data);
    }

	ContentRenderer(entry) {
		return ( new UI.Row().add(new UI.Text(entry.name)).dom.outerHTML);
	}
    GenerateTreeData(data, addFile = true) {
        let out = {
            id: "all",
            name: "All",
            children: [],
            state: {
                open: true
            }
        };

        for (let entryName in data) {
            let parentPath = out;
            let entry = data[entryName];
            if(entry === undefined) {
                continue;
            }
            let paths = entry.paths;
            // Typescript would've caught this shit before I had to implement this hack
            if(paths === undefined) {
                paths = entry;
            }
            var fullpath = "";
            paths.forEach(function(subPath) {
                let parentIndex = parentPath.children.find(x => x.name.toLowerCase() === subPath.toLowerCase());
                if (parentIndex === undefined) {
                    if(fullpath != "") {
                        fullpath += "/";
                    }
                    fullpath += subPath;
                    let a = parentPath.children.push({
                        id: entry.name.replace("/"+entry.fileName, ""),
                        name: subPath,
                        loadOnDemand: true,
                        children: [],
                    });
                    parentPath = parentPath.children[a - 1];
                } else {
                    parentPath = parentIndex;
                    // Sometimes the object is referenced lowercase. If we have a string that has uppercase letters, we can assume it's correct.
                    // Replace lowercase paths with the actual case.
                }
            });
            if(addFile) {
                parentPath.children.push({
                    id: entry.name,
                    name: entry.fileName,
                });
            }
        }
        return out;
    }

    SetData(widget, data) {
        let scope = this;
        let wget = scope.widgets[widget];
        console.log(data);
	    data.state.open = true;
	    wget.data.treeData = data;
	    wget.data.tree.loadData(data);
        console.log("Shieeet");
    }





    CreateTopControls() {
        let scope = this;
        let control = $(document.createElement("button"));
        control.text("Update");
        control.on('click', function() {
            scope.Update();
        });
        return(control);
    }

    hierarchyRenderer(node, treeOptions) {
        if(node.state.filtered === false || node.visible === false ){
            return;
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

    OnPartitionSelected(partition) {
        let wget = this.widgets["ContentInfo"];
        wget.el.add(new UI.Row().add(new UI.Text(partition.typeName + ", " + partition.name)));
    };
}
