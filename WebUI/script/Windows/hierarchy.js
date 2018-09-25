class Hierarchy {
    constructor() {
        this.dom = null;
        this.entries = {};
        this.dropHighLighted = null;
        this.topControls = this.CreateTopControls();
        this.subControls = this.CreateSubControls();
        this.Initialize();


	    signals.spawnedBlueprint.add(this.onSpawnedBlueprint.bind(this));
	    signals.destroyedBlueprint.add(this.onDestroyedBlueprint.bind(this));
        signals.selectedEntity.add(this.onSelectedEntity.bind(this));

    }



    Initialize() {
        this.dom = $(document.createElement("ol"));
        this.dom.addClass("spawnedEntities");


        this.dom.sortable({
            itemSelector: 'li',
            placeholder: '<li class="placeholder"/>',
            nested: true,
            distance:50,
            onDrag:  function ($item, position, _super, event) {
                //$item.css(position)
                //$(".placeholder").height($($item[0]).height());

            },
            isValidTarget: function ($item, container) {
                if($(container.el.children().first()).hasClass("placeholder")) {
                    this.highLighted = $(container.el).parent();
                    this.highLighted.addClass("dropHighLighted");

                    console.log(container)
                } else {
                    if(this.highLighted != null) {
                        this.highLighted.removeClass("dropHighLighted");
                    }
                }

                return true
            },
            onDrop: function ($item, container, _super, event) {

                $item.removeClass(container.group.options.draggedClass).removeAttr("style");
                $("body").removeClass(container.group.options.bodyClass);
                $(container.el).parent().removeClass("dropHighLighted");

                let itemID = $item.attr("entityId");
                let gameObject = editor.spawnedEntities[itemID];

                let containerID = $(container.el).parent().attr("entityId");
                let groupObject = editor.spawnedEntities[containerID];

                if (groupObject == null) {
                    if (gameObject.parent != null) {
                        gameObject.parent.OnRemoveChild(gameObject);
                    }
                }else{
                    groupObject.OnAddChild(gameObject);
                }
            }
        });
    }

    onSelectedEntity(command) {
        if(command === undefined || editor.webobjects[command.guid] === undefined) {
            return
        }
        this.onDeselectEntry(editor.selected);
        let entry = this.entries[command.guid];
        entry.dom.addClass("selected");
    }

    OnDeleteEntry(guid){
        // $('.spawnedEntities').find("#");
        let entry = this.entries[guid];

        if (entry == null){
            console.error("Tried to delete a null entry");
        }
        
        $('.spawnedEntities').find(entry).remove();
    }


    onDeselectEntry(guid) {
        if(guid === undefined || this.entries[guid] === undefined) {
            return false;
        }
        let entry = this.entries[guid];
        entry.dom.removeClass("selected");
        // editor.OnDeselectEntity(gameObject);
    }



    static CollapseGroup(group) {
        $(group).toggle()

        let parent = $(item.parent());
        if(parent.hasClass("expanded")) {
            $(item.parent()).removeClass("expanded");
            $(item.parent()).addClass("collapsed");
        } else {
            $(item.parent()).removeClass("collapsed");
            $(item.parent()).addClass("expanded");
        }
    }

    CreateTopControls() {
        let controls = $(document.createElement("div"));
        controls.class = "contentControls";

        let search = $(document.createElement("input"));
        search.addClass("search-input form-control");
        controls.append(search);

        controls.append("<button onclick=\"editor.OnCreateGroup()\">+</button>\n" +
            "                    <button onclick='vext.SpawnedEntity(GenerateGuid(), \"31185055-81DD-A2F8-03FF-E0A6AAF960EC\", \"1,0,0,0,1,0,0,0,1,0,0,0\");'>+</button>");
        return controls;
    }

    CreateSubControls() {
        let controls = $(document.createElement("div"));

        controls.append("<button onclick=\"editor.OnCreateGroup()\">New Group</button>\n" +
            "                    <button onclick='vext.SpawnedEntity(GenerateGuid(), \"31185055-81DD-A2F8-03FF-E0A6AAF960EC\", \"1,0,0,0,1,0,0,0,1,0,0,0\");'>Add Instance</button>");
        return controls;
    }

    CreateGroup(guid, name, parent) {
        let entry = new HierarchyEntry(guid, name, "Group");
	    this.entries[guid] = entry;

	    if(this.entries[parent] == undefined) {
		    this.dom.append(entry.dom);
	    } else {
		    this.entries[parent].dom.append(entry.dom);
	    }
    }
	CreateEntity(guid, name, parent) {
		let entry = new HierarchyEntry(guid, name, "Entity");
		this.entries[guid] = entry;

		if(this.entries[parent] == undefined) {
			this.dom.append(entry.dom);
		} else {
			this.entries[parent].children[entry.guid] = entry;
			this.entries[parent].content.append(entry.dom);
		}
	}

	DestroyGroup(guid) {
        if(this.entries[guid] === undefined) {
            editor.logger.LogError("Failed to destroy group: " + guid);
            return;
        }
        // Delete the children from the array
        for(let child in this.entries[guid].children) {
            delete this.entries[child];
        }
        // remove the dom
		this.entries[guid].dom.remove();
        // delete the blueprint form the array
        delete this.entries[guid];
	}

    DestroyEntity(guid) {

    }
    onSpawnedBlueprint(command) {
	   this.CreateGroup(command.guid, command.name, command.parent);
	   let scope = this;
	   for(let key in command.children) {
	       let child = command.children[key];
		   scope.CreateEntity(child.guid, child.type, command.guid);
	   }
    }

    onDestroyedBlueprint(command) {
        this.DestroyGroup(command.guid)
    }
}

class HierarchyEntry {
    constructor(guid, name, type) {
        this.guid = guid;
        this.name = name;
        this.type = type;

	    this.title = null;
        this.expander = null;
        this.content = null;
        this.children = {};
        this.groupTitle = null;

        this.dom = null;

        this.Initialize()
    }

    Initialize() {
        let scope = this;
	    scope.dom = $(document.createElement("li"));
	    scope.dom.attr("entityId", scope.guid);
	    scope.dom.attr("entityType", scope.type);
	    scope.title = $(document.createElement("div"));
	    scope.title.addClass("title");
	    scope.dom.append(scope.title);

	    if(scope.type == "Group") {
		    scope.dom.addClass("group collapsed");


		    scope.expander = $(document.createElement("i"));
		    scope.title.append(scope.expander);

		    scope.groupTitle = $(document.createElement("div"));
		    scope.groupTitle.addClass("groupTitle");
		    scope.groupTitle.text(scope.name);
		    scope.title.append(scope.groupTitle);

		    scope.content = $(document.createElement("ul"));
		    scope.content.attr("style", "display: none");
            if(scope.type == "Group") {
                $(scope.expander).on('click', function () {
                    $(scope.content).toggle();

                    if ($(scope.dom).hasClass("expanded")) {
                        $(scope.dom).removeClass("expanded");
                        $(scope.dom).addClass("collapsed");
                    } else {
                        $(scope.dom).removeClass("collapsed");
                        $(scope.dom).addClass("expanded");
                    }
                });
            }
		    scope.dom.append(scope.content);
	    } else {
		    scope.title.text(scope.name);
		    scope.dom.addClass("entity");
	    }

	    $(scope.title).on('click', function () {
		    editor.Select(scope.guid)
	    });


    }
}