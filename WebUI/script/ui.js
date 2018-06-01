class UI {

	constructor() {
		this.Initialize();
		this.dialogs = this.InitializeDialogs()

		this.dropHighLighted = null;
		this.entries = {};
	}

	// Maybe this isn't the way it's supposed to be done...
	Initialize() {
		$("#menubar").menu({
			position: {
				at: "left bottom"
			}
		});

		$('#worldView').selectmenu({
			change: UI.worldViewChanged
		});

		$('#tools').find('input').checkboxradio({
			icon: false
		}).on("change", UI.toolsChanged);

		$('#worldSpace').find('input').checkboxradio({
			icon: false
		}).on("change", UI.worldChanged);


		$('.scrollbar-outer').scrollbar();

		$('.spawnedEntities').sortable({
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
				$item.removeClass(container.group.options.draggedClass).removeAttr("style")
				$("body").removeClass(container.group.options.bodyClass)
				$(container.el).parent().removeClass("dropHighLighted")
			}
		});

		$('.window').each(function() {
			$(this).resizable({
				handles: "n, e, s, w, ne, se, sw, nw",
				minHeight: 200,
				minWidth: 200,
				containment: "#page"
			});

			$(this).draggable({
				handle: $(this).find('.header'),
				containment: "#page"
			})
		});
	}

	static toolsChanged(e) {
		editor.renderer.SetGizmoMode(e.target.id);
	}

	static worldChanged(e) {
		editor.renderer.SetWorldSpace(e.target.id);
	}

	static worldViewChanged(e, ui) {
		SendEvent('DispatchEventLocal', 'MapEditor:SetViewmode', ui.item.value)
	}

	InitializeDialogs() {
		let dialogs = {};
		dialogs["variation"] = $("#variation-dialog").dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: {
				"Spawn object!": this.OnConfirmInstanceSpawn,
				Cancel: function() {
					dialogs["variation"].dialog("close");
				}
			},
			close: function() {
				dialogs["variation"].dialog("close");
			}
		});

		return dialogs;
	}

	/*

		Functions

	 */
	CreateGroup(id = GenerateGuid(), name = "New Group") {
		let groupEntity = new Group(id, name);

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

		groupEntity.instance = group;
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



	/*

		Events

	 */

	OnConfirmInstanceSpawn() {
		editor.ConfirmInstanceSpawn();
		$(this).dialog("close");
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
		console.log(gameObject)
		if(editor.selectedEntity == gameObject) {
			console.log("Tried to select myself...")
			return;
		}
		this.OnDeselectEntry(editor.selectedEntity);
		let entry = this.entries[gameObject.id];
		entry.addClass("selected")
	}


	OnDeselectEntry(gameObject) {
		if(gameObject == null) {
			console.log("Tried to deselect nothing.");
			return false;
		}
		let entry = this.entries[gameObject.id];
		entry.removeClass("selected");
	}



}