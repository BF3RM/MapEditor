import { signals } from '@/script/modules/Signals';
import * as Collections from 'typescript-collections';
import { GameObject } from '@/script/types/GameObject';
import { LogError } from '@/script/modules/Logger';
import * as GoldenLayout from 'golden-layout';
import { SetViewModeMessage } from '@/script/messages/SetViewModeMessage';

export class EditorUI {
	// private debugWindow = new DebugWindow();
	private windows = new Collections.Dictionary<string, Window>();
	private windowZ: number;
	private debug: boolean;
	private layout: GoldenLayout | null;

	// private page: JQuery<HTMLElement>;
	constructor(debug: boolean = false) {
		this.Initialize();

		this.windowZ = 1;
		this.debug = debug;

		this.layout = null;
		// this.page = $('#page');
		// this.windowContainer = undefined;
		// this.menubar = {
		// 	entries: {},
		// };
		this.InitializeViews();
		this.InitializeWindows();

		signals.windowResized.connect(this.onResize.bind(this));
	}

	// Maybe this isn't the way it's supposed to be done...
	public Initialize() {
		/*
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
	*/
	}

	public RegisterWindow(windowId: string, windowTitle: string, windowModule: any, visible: boolean) {
		// this.windows[windowId.toLowerCase()] = new PowWindow(windowId, windowTitle, windowModule, visible);
		// this.windowContainer.append(this.windows[windowId.toLowerCase()].dom)
	}

	public RegisterMenubarEntry(path: string, entryCallback: any = undefined) {
		/* let menubarContainer = $('#menubar');
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

		 */
	}

	public OpenWindow(windowId: string) {
		/*
		if(this.windows[windowId.toLowerCase()] === undefined) {
			LogError("Attempted to open an undefined window:" + windowId)
		}
		this.windows[windowId.toLowerCase()].Show();
		 */
	}

	public HideWindow(windowId: string) {
		/*
		if(this.windows[windowId.toLowerCase()] === undefined) {
			LogError("Attempted to hide an undefined window:" + windowId)
		}
		this.windows[windowId.toLowerCase()].Hide();
	*/
	}

	public ToggleWindow(windowId: string) {
		/*
		if(this.windows[windowId.toLowerCase()] === undefined) {
			LogError("Attempted to toggle an undefined window:" + windowId)
		}
		this.windows[windowId.toLowerCase()].Toggle();
	*/
	}

	public InitializeWindows() {
		/*
		this.windowContainer = $(document.createElement("div"));
		this.windowContainer.attr("id", "windowContainer");
		this.page.append(this.windowContainer)

		 */
	}

	public InitializeViews() {
	}

	public CreateDialog(dialogElement: any, buttons: any, customCloseFn = dialogElement.dialog('close')) {
		if (dialogElement == null) {
			console.error('Invalid dialog element.');
		}

		return dialogElement.dialog({
			autoOpen: false,
			height: 'auto',
			width: 'auto',
			modal: true,
			buttons,
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
		} */

	public UpdateUI() {
		if (this.debug) {
			// this.windows['debug'].element.Update();
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

	public onConfirmReloadProject() {

	}

	public onConfirmLoadProject() {

	}

	public onConfirmClearProject() {

	}

	public onSelectEntity(gameObject: GameObject) {
		/*
		this.hierarchy.onSelectEntity(gameObject);
		this.inspector.UpdateInspector(gameObject);
		this.inspector.ShowContent()
		 */

	}

	public onDeselectEntity(gameObject: GameObject) {
		/*
		this.hierarchy.onDeselectEntry(gameObject)
		this.inspector.HideContent()
*/
	}

	public onConfirmInstanceSpawn() {
		/*
		editor.ConfirmInstanceSpawn();
		$(this).dialog("close");

		 */
	}

	public static toolsChanged(e: any) {
		editor.threeManager.SetGizmoMode(e.target.id);
	}

	public static worldChanged(e: any) {
		editor.threeManager.SetWorldSpace(e.target.id);
	}

	public static worldViewChanged(e: any, ui: any) {
		const message = new SetViewModeMessage(ui.item.value);
		editor.vext.SendMessage(message);
	}

	public onResize() {
		/*
		this.layout.updateSize();

		 */
	}
}
