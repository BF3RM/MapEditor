class UI {

	constructor() {
		this.Initialize();
		this.dialogs = this.InitializeDialogs()
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
                $item.css(position)
                $(".placeholder").height($($item[0]).height());
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

		Events

	 */
	OnConfirmInstanceSpawn() {
		editor.ConfirmInstanceSpawn();
		$(this).dialog("close");
	}

	OnEntitySpawned(gameObject) {
		let entry = $(document.createElement("li"));
		entry.attr("entityId", gameObject.id);
		entry.text(getFilename(gameObject.instance.name));
		$('.spawnedEntities').append(entry);
	}


}