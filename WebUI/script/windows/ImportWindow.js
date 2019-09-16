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
        this.Initialize();
        this.InitializeWidgets();
        this.CreateContent();
    }
    Initialize() {
        this.panel.setId("BundleImport")
    }
    InitializeWidgets() {
        this.AddWidget("LevelSelection", UI.Select);
        this.AddWidget("BundleSelection", UI.Panel);
        this.AddWidget("PathSelection", UI.Panel);
        this.AddWidget("ContentSelection", UI.UnsortedList);
        this.AddWidget("ContentInfo", UI.UnsortedList);
        this.AddWidget("SearchInput", UI.Input);
        this.SpawnWidgets();
    }
    AddWidget(name, widgetType) {
        this.widgets[name] = {
            data: {},
            el: new widgetType()
        };
    }
    SpawnWidgets() {
        let scope = this;
        Object.values(this.widgets).forEach(function (l_Widget) {
            scope.panel.add(l_Widget.el)
        });
    }

    CreateContent() {
        let scope = this;
        let wget = scope.widgets["LevelSelection"];
        wget.el.setId("LevelSelection");
        wget.data = [];
        wget.data["All"] = "All";
        wget.el.setOptions(wget.data);
        wget.el.setValue("All");


        wget = scope.widgets["BundleSelection"];
        wget.el.setId("BundleSelection");
        wget.data.treeData = {
            id: "root",
            name: "root",
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
                scope.OnBundleSelected(node.id);
            },
            togglerClass: "Toggler",
            nodeIdAttr: "guid"

        });


        wget = scope.widgets["PathSelection"];
        wget.el.setId("PathSelection");
        wget.data.treeData = {
            id: "root",
            name: "root",
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

                scope.OnPathSelected(node.id);
            },
            togglerClass: "Toggler",
            nodeIdAttr: "guid"

        });

        wget = scope.widgets["ContentSelection"];
        wget.el.setId("ContentSelection");
        wget.data = {};

        wget = scope.widgets["SearchInput"];
        wget.el.setId("SearchInput");

    }

    Update() {
        let scope = this;
        let wget = scope.widgets["LevelSelection"];
        let superBundles = editor.fbdMan.getSuperBundles();
        let superBundleNames = [];
        superBundleNames["All"] = "All";
        Object.keys(superBundles).forEach(function (name) {
            superBundleNames[name] = name;
        });
        wget.data = superBundleNames;
        wget.el.setOptions(wget.data);
        wget.el.setValue("All");
        wget.el.onChange(function (e) {
            let val = e.target.value;
            scope.SetSuperbundle(val);
        });
        wget = scope.widgets["BundleSelection"];
    }
    OnSuperBundleSelected(p_SuperBundle) {

    }

    OnBundleSelected(p_Bundle) {
        let scope = this;
        this.bundle = p_Bundle;
        scope.GeneratePathData(p_Bundle);
    }

    OnPathSelected(p_Path) {
        let scope = this;

        scope.GenerateContentData(p_Path);
    }

    SetSuperbundle(value) {
        console.log("Changing SuperBundle to " + value);
        this.superBundle = value;

        let scope = this;

        scope.GenerateBundleData(value);
    }

    SetBundle(value) {
        console.log("Changing Bundle to " + value);
        this.bundle = value;
        let scope = this;

        let wget = scope.widgets["ContentSelection"];
        wget.data = {};

        scope.GenerateContentData(value);

    }

    async GenerateBundleData(superBundle) {
        let data = editor.fbdMan.getBundles(superBundle);
        let BundleTreeData = this.GenerateTreeData(data);
        this.SetData("BundleSelection", BundleTreeData)
    }

    async GeneratePathData(bundle) {
        let data = editor.fbdMan.getPartitions(bundle);
        let PathTreeData = this.GenerateTreeData(data, false);
        this.SetData("PathSelection", PathTreeData)
    }
    async GenerateContentData(path) {
        let bundle = editor.fbdMan.getBundle(this.bundle);
        let out = {
            id: "root",
            name: "root",
            children: []
        };
        for( var partitionId in bundle.partitions) {
            var partition = bundle.partitions[partitionId];
            if(partition === undefined) {
                this.missing.push(partitionId);
            } else {
                if(partition.children === undefined && partition.name.includes(path)) {
                    out.children.push({
                        "id": partition.name,
                        "name": partition.name.replace(path, ""),
                    })
                }
            }
        }
        this.SetPathViewData(out);
    }

    SetPathViewData(data) {
        let scope = this;
        let wget = scope.widgets["ContentSelection"];
        wget.el.clear();
        Object.values(data.children).forEach(function (child) {
            wget.el.add(new UI.ListItem().add(new UI.Text(child.name)))
        });
    }
    GenerateTreeData(data, addFile = true) {
        let out = {
            id: "root",
            name: "root",
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
            var fullpath = "";
            entry.paths.forEach(function(subPath) {
                let parentIndex = parentPath.children.find(x => x.name.toLowerCase() === subPath.toLowerCase());
                if (parentIndex === undefined) {
                    if(fullpath != "") {
                        fullpath += "/"
                    }
                    fullpath += subPath;
                    let a = parentPath.children.push({
                        id: fullpath,
                        name: subPath,
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
                })
            }
        }
        return out;
    }

    SetData(widget, data) {
        let scope = this;
        let wget = scope.widgets[widget];
        console.log(data);
        wget.data.tree.loadData(data);
        console.log("Shieeet")
    }





    CreateTopControls() {
        let scope = this;
        let control = $(document.createElement("button"));
        control.text("Update");
        control.on('click', function() {
            scope.Update();
        });
        return(control)
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