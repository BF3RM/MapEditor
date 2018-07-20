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
            'inspector': new PowWindow("inspector", "Inspector", this.inspector),
		};

		if(this.debug === false) {
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

/*

	Misc

 */

let inputEl = false;

// Mouse object for referencing
let mouse = {
    'down': false,
    'xInitial': 0,
    'xOld': 0,
};

// Mouse up and movement events will be document-level
document.addEventListener('mouseup', handleMouse);
document.addEventListener('mousemove', processScaler);


/*
* Handle the mouse events via the global mouse object
*/
function handleMouse(event) {
    // Mouse down, we want to set the target input, set the down flag and initial position
    if (event.type == "mousedown") {
        // Get the input element sibling to the clicked label
        inputEl = $(event.target);
        // If the value isn't a valid integer, set it to 0
        if(!Number.isInteger(parseInt(inputEl.value))) {
            inputEl.value = 0;
        }
        mouse.down = true;
        mouse.xInitial = event.clientX;
    }
    else if (event.type == "mouseup") {
        mouse.down = false;
    }
}


/*
* Handle the actual scaling process
*/
function processScaler(event) {
    if (mouse.down) {
        // If the mouse has moved..
        if (mouse.down) {
            // If the mouse has moved..
            if(event.clientX != mouse.xOld) {
                // Get the difference between the two points scaled
                var diff = (event.clientX - mouse.xInitial) * scale;

                // If the cursor is to the right, increment
                if(event.clientX > mouse.xInitial) {
                    inputEl.value = Math.round((inputEl.val() + diff) * 100.0) / 100.0;
                    // Otherwise, decrement
                } else {
                    inputEl.value = Math.round((inputEl.val() - diff) * 100.0) / 100.0;
                }
                // Reset the initial position to the current, so [in/de]crementing works relative
                mouse.xInitial = event.clientX;
            }
            // Update the old position for the next step calculation
            mouse.xOld = event.clientX;
        }
        // Update the old position for the next step calculation
        mouse.xOld = event.clientX;
    }
};