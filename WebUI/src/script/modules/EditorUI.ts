import { DebugWindow } from '@/script/windows/DebugWindow';
import { signals } from '@/script/modules/Signals';
import * as Collections from 'typescript-collections';
import { GameObject } from '@/script/types/GameObject';
import { LogError } from '@/script/modules/Logger';
import * as GoldenLayout from 'golden-layout';
import { SetViewModeMessage } from '@/script/messages/SetViewModeMessage';
import { ViewPortComponent } from '../views/ViewPortComponent';
import { HierarchyComponent } from '../views/HierarchyView';
import { InspectorComponent } from '../views/InspectorView';
import { TreeViewComponent } from '../views/TreeView';
import { HistoryComponent } from '../views/HistoryView';
import { FavoritesComponent } from '../views/FavoritesView';
import { ContentViewComponent } from '../views/ContentView';
import { ConsoleViewComponent } from '../views/ConsoleView';
import { EntityViewComponent } from '../views/EntityView';

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
		const config = {
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
						type: 'stack',
						height: 25,
						content: [{
							type: 'component',
							componentName: 'InspectorComponent',
							isClosable: false,
							title: 'Inspector'
						}, {
							type: 'component',
							componentName: 'HistoryComponent',
							isClosable: false,
							title: 'History'
						}]
					},
					{
						type: 'component',
						componentName: 'HierarchyComponent',
						isClosable: false,
						title: 'Hierarchy'
					}, {
						type: 'component',
						componentName: 'EntityViewComponent',
						isClosable: false,
						title: 'Entities',
						height: 10
					}
					]
				},
				{
					type: 'column',
					width: 70,
					content: [{
						type: 'row',
						height: 90,
						content: [{
							type: 'component',
							componentName: 'ViewPortComponent',
							isClosable: false,
							reorderEnabled: false,
							title: 'ViewPort',
							header: {
								show: false
							},
							id: 'renderView'
						}]
					}, {
						type: 'row',
						height: 10,
						content: [{
							type: 'component',
							componentName: 'ConsoleViewComponent',
							width: 70,
							isClosable: false,
							reorderEnabled: false,
							title: 'Console'
						}]
					}]
				},
				{
					type: 'column',
					content: [{
						type: 'component',
						componentName: 'FavoritesComponent',
						isClosable: false,
						title: 'Favorites',
						height: 10
					}, {
						type: 'component',
						componentName: 'TreeViewComponent',
						isClosable: false,
						title: 'Data Explorer'
					},
					{
						type: 'component',
						componentName: 'ContentViewComponent',
						isClosable: false,
						title: 'Data',
						height: 30
					}
					]
				}

				]
			}]
		};
		const page = document.getElementById('page');
		if (page === undefined || page === null) {
			LogError('Failed to get page');
			return;
		}
		const dom = document.createElement('div');
		dom.setAttribute('id', 'GoldenLayoutContainer');
		page.appendChild(dom);
		this.layout = new GoldenLayout(config, dom);

		this.layout.registerComponent('example', function (container: any, state: any) {
			container.getElement().html('<h2>' + state.text + '</h2>');
		});
		this.layout.on('componentCreated', function (component: any) {
			/*
			console.log(component);
			const elem = component.container._element[0];
			const scrollbar = elem.find('.infinite-tree-scroll');
			if (scrollbar.length > 0) {
				component.ps = new PerfectScrollbar(scrollbar[0]);
				const content = elem.find('.lm_content')[0];
				content.setAttribute('style', 'overflow:hidden');
			} else {
				const content = elem.find('.lm_content');
				component.ps = new PerfectScrollbar(content[0]);
			}

			component.container.on('resize', function() {
				component.ps.update();
			});
*/
		});

		this.layout.registerComponent('ViewPortComponent', ViewPortComponent);
		this.layout.registerComponent('HierarchyComponent', HierarchyComponent);
		this.layout.registerComponent('InspectorComponent', InspectorComponent);
		this.layout.registerComponent('TreeViewComponent', TreeViewComponent);
		this.layout.registerComponent('ContentViewComponent', ContentViewComponent);
		this.layout.registerComponent('HistoryComponent', HistoryComponent);
		this.layout.registerComponent('FavoritesComponent', FavoritesComponent);
		this.layout.registerComponent('EntityViewComponent', EntityViewComponent);
		this.layout.registerComponent('ConsoleViewComponent', ConsoleViewComponent);

		/*
		this.layout.on('initialised', function() {
			$('.lm_content .infinite-tree-scroll').each(function(e) {
				const scope = this;

				$(this).on('DOMSubtreeModified', function() {
					// scope.ps.update();
				});
			});
		});

 */
		this.layout.init();
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
