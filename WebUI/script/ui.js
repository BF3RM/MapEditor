class UI {

	constructor(debug) {
		this.Initialize();
		this.dialogs = this.InitializeDialogs();


		this.hierarchy = new Hierarchy();
        this.treeView =  new TreeView();
        this.inspector = new Inspector();
		this.debugWindow = new DebugWindow();
        this.windows = {};
        this.windowZ = 1;
		this.debug = debug;

        this.InitializeWindows();
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

	}

	InitializeWindows() {
        let page = $('#page');
		this.windows = {
			'hierarchy': new PowWindow("hierarchy", "Hierarchy", this.hierarchy),
            'treeView': new PowWindow("treeView", "Blueprints", this.treeView),
            'inspector': new PowWindow("inspector", "Inspector", this.inspector, false),
		};

		if(this.debug === true) {
			this.windows['debug'] = new PowWindow("debug", "Debug", this.debugWindow);
		}

        $.each(this.windows, function() {
			page.append(this.dom);
        });

	}

	static toolsChanged(e) {
		editor.webGL.SetGizmoMode(e.target.id);
	}

	static worldChanged(e) {
		editor.webGL.SetWorldSpace(e.target.id);
	}

	static worldViewChanged(e, ui) {
		editor.vext.SendEvent('DispatchEventLocal', 'MapEditor:SetViewmode', ui.item.value)
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

	UpdateUI(){
		if(this.debug) {
			this.windows['debug'].element.Update();
		}
	}
	/*

		Events

	 */

	OnConfirmInstanceSpawn() {
		editor.ConfirmInstanceSpawn();
		$(this).dialog("close");
	}







}