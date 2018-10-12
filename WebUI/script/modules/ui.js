class UI {

	constructor(debug) {
		this.Initialize();
		this.dialogs = this.InitializeDialogs();


		this.hierarchy = new Hierarchy();
		this.treeView =  new TreeView();
		this.inspector = new Inspector();
		
		if (debug==true) {
			this.debugWindow = new DebugWindow();
		}
		
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
            'inspector': new PowWindow("inspector", "Inspector", this.inspector),
			'hierarchy': new PowWindow("hierarchy", "Hierarchy", this.hierarchy),
			'treeView': new PowWindow("treeView", "Blueprints", this.treeView),


		};

		if(this.debug === true) {
			//this.windows['debug'] = new PowWindow("debug", "Debug", this.debugWindow);
		}

		let offset = 30;
        $.each(this.windows, function() {
            page.append(this.dom);
            this.dom.css({
                "top": offset + "px",
                "left": offset + "px"
            });
            offset += 30;
        });

	}

	static toolsChanged(e) {
		editor.webGL.SetGizmoMode(e.target.id);
	}

	static worldChanged(e) {
		editor.webGL.SetWorldSpace(e.target.id);
	}

	static worldViewChanged(e, ui) {
		editor.vext.SendEvent('MapEditor:SetViewmode', 'MapEditor:SetViewmode', ui.item.value)
	}

	InitializeDialogs() {
		let dialogs = {};
		dialogs["variation"] = $("#variation-dialog").dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: {
				"Spawn object!": this.onConfirmInstanceSpawn,
				Cancel: function() {
					dialogs["variation"].dialog("close");
				}
			},
			close: function() {
				dialogs["variation"].dialog("close");
			}
		});

		dialogs["deleteEntity"] = $("#delete-entity-dialog").dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: {
				"Yes": this.onConfirmDeleteEntity,
				"No": function() {
					dialogs["deleteEntity"].dialog("close");
				}
			},
			close: function() {
				dialogs["deleteEntity"].dialog("close");
			}
		});

		dialogs["saveProject"] = $("#save-project-dialog").dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: {
				Close: function() {
					dialogs["saveProject"].dialog("close");
				}
			},
			close: function() {
				dialogs["saveProject"].dialog("close");
			}
		});

		dialogs["loadProject"] = $("#load-project-dialog").dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: {
				"Load": this.onConfirmLoadProject,
				Cancel: function() {
					dialogs["loadProject"].dialog("close");
				}
			},
			close: function() {
				dialogs["loadProject"].dialog("close");
			}
		});

		dialogs["reloadProject"] = $("#reload-dialog").dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: {
				"Reset": this.onConfirmReloadProject,
				Cancel: function() {
					dialogs["reloadProject"].dialog("close");
				}
			},
			close: function() {
				dialogs["reloadProject"].dialog("close");
			}
		});

		

		dialogs["clearProject"] = $("#clear-dialog").dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: {
				"Yes": this.onConfirmClearProject,
				"No": function() {
					dialogs["clearProject"].dialog("close");
				}
			},
			close: function() {
				dialogs["clearProject"].dialog("close");
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

	OpenReloadDialog(){
		editor.ui.dialogs["reloadProject"].dialog("open");
	}

	OpenLoadDialog(){
		editor.ui.dialogs["loadProject"].dialog("open");
	}

	OpenClearDialog(){
		editor.ui.dialogs["clearProject"].dialog("open");
	}

	OpenSaveDialog() {
		let jsonString = JSON.stringify(
			editor.rootEntities, function( key, value) {
				if(  key == 'webObject') {
					return null;
				}
				else if(key == 'parent'){
					if (value != null) {
						return value.id;

					}
					else{
						return null;
					}
				}else{
					return value;
				}
			},
			"\t"
			);

		$("#saveProjectTextArea").text(jsonString);

		editor.ui.dialogs["saveProject"].dialog("open");
		
	}

	onConfirmReloadProject(){
		let jsonString = JSON.stringify(
			editor.rootEntities, function( key, value) {
				if(  key == 'webObject') {
					return null;
				}
				else if(key == 'parent'){
					if (value != null) {
						return value.id;

					}
					else{
						return null;
					}
				}else{
					return value;
				}
			},
			"\t"
		);

		for (var key in editor.rootEntities) {
			editor.rootEntities[key].Delete();
		}

		editor.vext.SendEvent('MapEditor:LoadProject', 'MapEditor:LoadProject', jsonString)
		
		$(this).dialog("close");
	}

	onConfirmLoadProject(){
		//Clear current project
		for (var key in editor.rootEntities) {
			console.log(key);
			editor.rootEntities[key].Delete();
		}

		let text = $("#loadProjectTextArea").val();
		console.log(text);

		//send new project to vext
		editor.vext.SendEvent('MapEditor:LoadProject', 'MapEditor:LoadProject', text)


		$(this).dialog("close");
	}

	onConfirmClearProject(){
		for (var key in editor.rootEntities) {
			console.log(key);
			editor.rootEntities[key].Delete();
		}

		$(this).dialog("close");
	}

	onSelectEntity(gameObject) {
		this.hierarchy.onSelectEntity(gameObject);
		this.inspector.UpdateInspector(gameObject);
		this.inspector.ShowContent()

	}
	onDeselectEntity(gameObject) {
		this.hierarchy.onDeselectEntry(gameObject)
		this.inspector.HideContent()

	}

	onConfirmInstanceSpawn() {
		editor.ConfirmInstanceSpawn();
		$(this).dialog("close");
	}

	onConfirmDeleteEntity() {
		if (editor.selected == null) {
			console.error("Tried to delete a null entity")
		}else{
			editor.execute(new DestroyBlueprintCommand(editor.selected.guid));
		}
		
		$(this).dialog("close");
	}

}

/*

	Misc

 */
// Input element being changed
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
document.addEventListener('mousemove', processScaler);

function isFloat(n){
    return Number(n) === n && n % 1 !== 0;
}
/*
* Handle the mouse events via the global mouse object
*/
function handleMouse(event) {
  // Mouse down, we want to set the target input, set the down flag and initial position
  if (event.type == "mousedown") {
    $('#page').find('canvas').css("z-index", -1);

    // Get the input element sibling to the clicked label
    inputEl = event.target.nextElementSibling;
    // If the value isn't a valid integer, set it to 0
    if(!parseFloat(inputEl.value)) {
      inputEl.value = 0;
    }
    mouse.down = true;
    mouse.xInitial = event.clientX;
  }
  else if (event.type == "mouseup") {
    mouse.down = false;
    $(inputEl).trigger('change');
    $('#page').find('canvas').css("z-index", 0);

  }
}


/*
* Handle the actual scaling process
*/
function processScaler(event) {
  let scale = 0.03
  if (mouse.down) {
    // If the mouse has moved..
    if(event.clientX != mouse.xOld) {
      // Get the difference between the two points scaled
      var diff = (Math.abs(event.clientX - mouse.xInitial) * scale)
      // If the cursor is to the right, increment
	  if(event.clientX > mouse.xInitial) {
        inputEl.value = Math.round((parseFloat(inputEl.value) + diff) * 100.0) / 100.0;;
      // Otherwise, decrement
      } else {
        inputEl.value = Math.round((parseFloat(inputEl.value) - diff) * 100.0) / 100.0;;
      }
      $(inputEl).trigger('input');
      // Reset the initial position to the current, so [in/de]crementing works relative
      mouse.xInitial = event.clientX;
    }
    // Update the old position for the next step calculation
    mouse.xOld = event.clientX;
  }
};