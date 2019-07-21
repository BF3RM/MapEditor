class EditorUI {

	constructor(debug) {
		this.Initialize();

		if (debugMode) {
			this.debugWindow = new DebugWindow();
		}
		
		this.windows = {};
		this.windowZ = 1;
		this.debug = debug;

		this.layout = null;
		this.page = $('#page');
		this.windowContainer = undefined;
		this.menubar = {
		    entries: {},
        };
		this.InitializeViews();
        this.InitializeWindows();

		signals.windowResized.add(this.onResize.bind(this));



	}


	// Maybe this isn't the way it's supposed to be done...
	Initialize() {
        $('#menubar').menu({
            position: { my: 'left top', at: 'left bottom' },
            blur: function() {
                $(this).menu('option', 'position', { my: 'left top', at: 'left bottom' });
            },
            focus: function(e, ui) {
                if ($('#menubar').get(0) !== $(ui).get(0).item.parent().get(0)) {
                    $(this).menu('option', 'position', { my: 'left top', at: 'right top' });
                }
            },
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

	}

	RegisterWindow(windowId, windowTitle, windowModule, visible) {
        this.windows[windowId] = new PowWindow(windowId, windowTitle, windowModule, visible);
        this.windowContainer.append(this.windows[windowId].dom)
    }

    RegisterMenubarEntry(path, entryCallback = undefined) {
	    let menubarContainer = $('#menubar');
	    let lastEntry = this.menubar;

        for(let i = 0; i < path.length; i++) {
            let currentEntry = path[i];
            if(currentEntry === "") {
                lastEntry.list.add(new UI.ListItem(""));
                break;
            }
            if(lastEntry.entries[currentEntry] === undefined) {
                lastEntry.entries[currentEntry] = {};
                lastEntry.entries[currentEntry].entries = {};
                lastEntry.entries[currentEntry].elem = new UI.ListItem(currentEntry);
                if(i === 0){
                    menubarContainer.append(lastEntry.entries[currentEntry].elem.dom);
                } else {
                    lastEntry.list.add(lastEntry.entries[currentEntry].elem);
                }
            }
            if(i !== path.length - 1 && lastEntry.entries[currentEntry].list == null) {
                lastEntry.entries[currentEntry].list = new UI.UnsortedList();
                lastEntry.entries[currentEntry].elem.add(lastEntry.entries[currentEntry].list);
            }
            lastEntry = lastEntry.entries[currentEntry];
        }
        if(entryCallback !== undefined) {
            lastEntry.elem.onClick(function () {
                entryCallback();
            });
        }


        menubarContainer.menu("refresh");
    }

    OpenWindow(windowId) {
	    if(this.windows[windowId] === undefined) {
	        LogError("Attempted to open an undefined window:" + windowId)
	    }
        this.windows[windowId].Show();
    }
    HideWindow(windowId) {
        if(this.windows[windowId] === undefined) {
            LogError("Attempted to hide an undefined window:" + windowId)
        }
        this.windows[windowId].Hide();
    }
    ToggleWindow(windowId) {
        if(this.windows[windowId] === undefined) {
            LogError("Attempted to toggle an undefined window:" + windowId)
        }
        this.windows[windowId].Toggle();
    }


    InitializeWindows() {
        this.windowContainer = $(document.createElement("div"));
        this.windowContainer.attr("id", "windowContainer");
        this.page.append(this.windowContainer)
    }

	InitializeViews() {
		let page = $('#page');
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
				showCloseIcon: false
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
				popout: 'open in new window'
			},
			content: [{
				type: 'row',
				width: 10,
				content: [{
					type: 'column',
					content: [{
						type:'stack',
						height: 25,
						content: [{
							type: 'component',
							componentName: 'InspectorComponent',
							isClosable: false,
							title: "Inspector",
						},{
							type: 'component',
							componentName: 'HistoryComponent',
							isClosable: false,
							title: "History",
						}]
					},
					{
						type: 'component',
						componentName: 'HierarchyComponent',
						isClosable: false,
						title: "Hierarchy",
					},{
						type: 'component',
						componentName: 'EntityViewComponent',
						isClosable: false,
						title: "Entities",
						height: 10,
					}]
				},
					{
						type: 'component',
						componentName: 'ViewPortComponent',
						width: 70,
						isClosable: false,
						reorderEnabled: false,
						title: "ViewPort",
						header: {
							show: false
						},
						id: "renderView"
					}, {
						type: 'column',
						content: [
							{
								type: 'component',
								componentName: 'FavoritesComponent',
								isClosable: false,
								title: "Favorites",
								height: 10,
							}, {
							type: 'component',
							componentName: 'TreeViewComponent',
							isClosable: false,
							title: "Data Explorer",
						},
							{
								type: 'component',
								componentName: 'ContentViewComponent',
								isClosable: false,
								title: "Data",
								height: 30
							}
						]
					}

				]
			}]
		};

		let dom = $(document.createElement("div"));
		dom.attr('id', "GoldenLayoutContainer");
		page.append(dom);
		this.layout = new GoldenLayout( config, "#GoldenLayoutContainer" );

		this.layout.registerComponent( 'example', function( container, state ){
			container.getElement().html( '<h2>' + state.text + '</h2>');
		});

		this.layout.registerComponent( 'ViewPortComponent', ViewPortComponent);
		this.layout.registerComponent( 'HierarchyComponent', HierarchyComponent);
		this.layout.registerComponent( 'InspectorComponent', InspectorComponent);
		this.layout.registerComponent( 'TreeViewComponent', TreeViewComponent);
		this.layout.registerComponent( 'ContentViewComponent', ContentViewComponent);
		this.layout.registerComponent( 'HistoryComponent', HistoryComponent);
		this.layout.registerComponent( 'FavoritesComponent', FavoritesComponent);
		this.layout.registerComponent( 'EntityViewComponent', EntityViewComponent);

		this.layout.on('initialised', function() {
			$(".lm_content .infinite-tree-scroll").each(function(e) {
				let scope = this;
				scope.ps = new PerfectScrollbar(scope);
				scope.ps.update();
				$(this).on('DOMSubtreeModified', function() {
					//scope.ps.update();
				})
			})
		});
		this.layout.init();

	}

	static toolsChanged(e) {
		editor.threeManager.SetGizmoMode(e.target.id);
	}

	static worldChanged(e) {
		editor.threeManager.SetWorldSpace(e.target.id);
	}

	static worldViewChanged(e, ui) {
		let message = new SetViewModeMessage(ui.item.value);
		editor.vext.SendMessage(message);
	}

	CreateDialog(dialogElement, buttons, customCloseFn = dialogElement.dialog("close")){
		if (dialogElement == null){
			console.error("Invalid dialog element.")
		}


		return dialogElement.dialog({
			autoOpen: false,
			height: "auto",
			width: "auto",
			modal: true,
			buttons: buttons,
			close: customCloseFn
		});
	}

/*	InitializeDialogs() {
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
	}*/

	UpdateUI(){
		if(this.debug) {
			this.windows['debug'].element.Update();
		}
	}
	/*

		Events

	*/

/*
	OpenReloadDialog(){
		editor.ui.dialogs["reloadProject"].dialog("open");
	}

	OpenLoadDialog(){
		editor.ui.dialogs["loadProject"].dialog("open");
	}

	OpenClearDialog(){
		editor.ui.dialogs["clearProject"].dialog("open");
	}
*/



	onConfirmReloadProject(){
		let jsonString = JSON.stringify(
			editor.rootEntities, function( key, value) {
				if(key == 'webObject') {
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

		editor.vext.SendEvent('LoadProject')
		
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

	onResize() {
		this.layout.updateSize();
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