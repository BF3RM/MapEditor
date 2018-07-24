class Hierarchy {
    constructor() {
        this.dom = null;
        this.entries = {};
        this.dropHighLighted = null;
        this.topControls = this.CreateTopControls();
        this.subControls = this.CreateSubControls();
        this.Initialize();
    }



    Initialize() {
        this.dom = $(document.createElement("ol"));
        this.dom.addClass("spawnedEntities");


        this.dom.sortable({
            itemSelector: 'li',
            placeholder: '<li class="placeholder"/>',
            nested: true,
            distance:10,
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
                    editor.webGL.RemoveFromGroup(gameObject.webObject);
                }else{
                    groupObject.webObject.matrixWorld;
                    editor.webGL.AddToGroup(groupObject.webObject, gameObject.webObject);
                }


            }
        });
    }

    OnEntitySpawned(gameObject) {
        let entry = $(document.createElement("li"));
        entry.attr("entityId", gameObject.id);
        entry.text(gameObject.name);
        entry.addClass("entity");

        $(entry).on('click', function() {
            editor.SelectEntityById(gameObject.id)
        });
        $('.spawnedEntities').append(entry);
        this.entries[gameObject.id] = entry;
    }

    OnSelectEntity(gameObject) {
        if(editor.selectedEntity == gameObject) {
            console.log("Tried to select myself...");
            return;
        }
        this.OnDeselectEntry(editor.selectedEntity);
        let entry = this.entries[gameObject.id];
        entry.addClass("selected")
        editor.ui.inspector.UpdateInspector(gameObject);
    }

    OnDeleteEntry(gameObject){
        // $('.spawnedEntities').find("#");
        let entry = this.entries[gameObject.id];

        if (entry == null){
            console.error("Tried to delete a null entry");
        }
        
        $('.spawnedEntities').find(entry).remove();
    }


    OnDeselectEntry(gameObject) {
        if(gameObject == null) {
            console.log("Tried to deselect nothing.");
            return false;
        }
        let entry = this.entries[gameObject.id];
        entry.removeClass("selected");
        // editor.OnDeselectEntity(gameObject);
    }

    CreateGroup(id = GenerateGuid(), name = "New Group") {
        let webObject = editor.webGL.CreateGroup();
        let groupEntity = new Group(id, name, webObject, {});

        let group = $(document.createElement("li"));
        group.attr("entityId", id);
        group.attr("entityType", "group");
        group.addClass("group expanded");

        let title = $(document.createElement("div"));
        title.addClass("title");

        let expander = $(document.createElement("i"));
        title.append(expander);

        let groupName = $(document.createElement("div"));
        groupName.addClass("groupTitle");
        groupName.text(name);
        title.append(groupName);
        group.append(title);

        let groupContent = $(document.createElement("ul"));
        group.append(groupContent);

        this.entries[id] = group;
        editor.CreatedEntity(id, groupEntity);

        $(expander).on('click', function () {
            $(groupContent).toggle();

            let parent = $(group.parent());
            if(group.hasClass("expanded")) {
                $(group).removeClass("expanded");
                $(group).addClass("collapsed");
            } else {
                $(group).removeClass("collapsed");
                $(group).addClass("expanded");
            }
        });

        $(title).on('click', function () {
            editor.SelectEntityById(id)
        });

        if(editor.selectedEntity != null) {
            this.entries[editor.selectedEntity.id].after(group);
        } else {
            $('.spawnedEntities').append(group);
        }
        editor.SelectEntityById(id);
        return groupEntity;
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

        controls.append("<button onclick=\"editor.ui.hierarchy.CreateGroup()\">+</button>\n" +
            "                    <button onclick='vext.SpawnedEntity(GenerateGuid(), \"31185055-81DD-A2F8-03FF-E0A6AAF960EC\", \"1,0,0,0,1,0,0,0,1,0,0,0\");'>+</button>");
        return controls;
    }

    CreateSubControls() {
        let controls = $(document.createElement("div"));

        controls.append("<button onclick=\"editor.ui.hierarchy.CreateGroup()\">New Group</button>\n" +
            "                    <button onclick='vext.SpawnedEntity(GenerateGuid(), \"31185055-81DD-A2F8-03FF-E0A6AAF960EC\", \"1,0,0,0,1,0,0,0,1,0,0,0\");'>Add Instance</button>");
        return controls;
    }
}