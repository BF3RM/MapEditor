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

		$('.window').each(function() {
			$(this).resizable({
				handles: "n, e, s, w, ne, se, sw, nw",
				minHeight: 200,
				minWidth: 200,
				containment: "#page",
				alsoResize: $(this).find('.scroll-wrapper')
			});

			$(this).draggable({
				handle: $(this).find('.header'),
				containment: "#page"
			})

		});

	}

	static toolsChanged(e) {
		console.log("kek")

		renderer.SetGizmoMode(e.target.id);
	}

	static worldChanged(e) {
		SetWorldSpace(e.target.id);
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

	OnConfirmInstanceSpawn() {
		editor.ConfirmInstanceSpawn();
		$(this).dialog("close");
	}


}