import { LinearTransform } from './types/primitives/LinearTransform';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { PreviewDestroyMessage } from './messages/PreviewDestroyMessage';
import { Blueprint } from '@/script/types/Blueprint';
import { Guid } from '@/script/types/Guid';
import { GameObject } from '@/script/types/GameObject';
import { LogError } from '@/script/modules/Logger';
import { signals } from '@/script/modules/Signals';
import { SetScreenToWorldTransformMessage } from '@/script/messages/SetScreenToWorldTransformMessage';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { MoveObjectMessage } from '@/script/messages/MoveObjectMessage';
import { PreviewSpawnMessage } from '@/script/messages/PreviewSpawnMessage';
import Stats from 'three/examples/jsm/libs/stats.module';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { InputControls } from '@/script/modules/InputControls';
import { Dictionary } from 'typescript-collections';

export class EditorCore {
	public raycastTransform = new LinearTransform();
	public screenToWorldTransform = new LinearTransform();
	private previewBlueprint: Blueprint | null;
	private isPreviewBlueprintSpawned = false;
	private isUpdating = false;
	private lastUpdateTime: number;
	private deltaTime: number;
	private pendingUpdates = new Map<Guid, GameObject>();
	private updateRequested = false;
	public highlightedObjects: Dictionary<Guid, GameObject> = new Dictionary<Guid, GameObject>();

	// @ts-ignore
	public stats = new Stats();

	constructor() {
		this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
		signals.editor.Ready.connect(this.renderLoop.bind(this));
		this.previewBlueprint = null;

		this.lastUpdateTime = 0;
		this.deltaTime = 1.0 / 30.0;
	}

	public getRaycastTransform() {
		return this.raycastTransform.clone();
	}

	public setUpdating(value: boolean) {
		this.isUpdating = value;
		if (value) {
			editor.threeManager.setPendingRender();
		}
	}

	public RequestUpdate() {
		this.updateRequested = true;
		this.setUpdating(true);
	}

	public renderLoop() {
		const scope = this;
		// eslint-disable-next-line no-prototype-builtins
		if (!window.hasOwnProperty('editor')) {
			return;
		}
		scope.stats.begin();
		// GameObject update
		this.pendingUpdates.forEach((gameObject, guid) => {
			const changes = gameObject.getChanges();
			if (!changes || !window.vext.doneExecuting) {
				return;
			}
			for (const changeKey in changes) {
				if (!(changeKey in changes)) {
					continue;
				}
				const change = changes[changeKey];
				window.vext.SendMessage(change);
			}
		});
		this.pendingUpdates.clear();
		// An update was requested outside of the usual ThreeJS render loop, this probably means some command has been executed.
		if (this.updateRequested) {
			editor.threeManager.setPendingRender();
			this.updateRequested = false;
		}
		// TODO: Add an FPS and rendering indicator.
		requestAnimationFrame(this.renderLoop.bind(this));
		editor.threeManager.RenderLoop();
		scope.stats.end();
	}

	public addPending(guid: Guid, gameObject: GameObject) {
		this.pendingUpdates.set(guid, gameObject);
	}

	public getGameObjectFromGameObjectTransferData(gameObjectTransferData: GameObjectTransferData, callerName: string) {
		const gameObject = editor.getGameObjectByGuid(gameObjectTransferData.guid);

		if (gameObject === undefined) {
			window.LogError(callerName + ': Couldn\'t find the GameObject for GameObjectTransferData. Name: ' + gameObjectTransferData.name + ' | Guid: ' + gameObjectTransferData.guid);
			return;
		}
		return gameObject;
	}

	public onPreviewDragStart(blueprint: Blueprint) {
		this.previewBlueprint = blueprint;
	}

	public GetMouseToScreenPosition(e: MouseEvent) {
		const direction = editor.threeManager.getMouse3D(e);
		const coordinates = InputControls.getMousePos(e);
		const s2wMessage = new SetScreenToWorldTransformMessage(new Vec3(direction.x, direction.y, direction.z), coordinates);
		window.vext.SendMessage(s2wMessage);
	}

	public onPreviewDrag(e: MouseEvent) {
		// this.GetMouseToScreenPosition(e);
		if (this.previewBlueprint == null || !this.isPreviewBlueprintSpawned) {
			return;
		}

		const gameObjectTransferData = new GameObjectTransferData({
			guid: editor.config.PreviewGameObjectGuid,
			transform: this.screenToWorldTransform.clone()
		});

		window.vext.SendMessage(new MoveObjectMessage(gameObjectTransferData));
	}

	public onPreviewDragStop() {
		this.previewBlueprint = null;
		this.isPreviewBlueprintSpawned = false;
	}

	public onPreviewStart() {
		if (this.previewBlueprint == null) {
			LogError('EditorCore.js:onPreviewStart(): this.previewBlueprint was null.');
			return;
		}

		const gameObjectTransferData = new GameObjectTransferData({
			guid: editor.config.PreviewGameObjectGuid,
			blueprintCtrRef: this.previewBlueprint.getCtrRef(),
			transform: this.screenToWorldTransform.clone(),
			variation: this.previewBlueprint.getDefaultVariation()
		});

		window.vext.SendMessage(new PreviewSpawnMessage(gameObjectTransferData));
		this.isPreviewBlueprintSpawned = true;
	}

	public onPreviewStop() {
		const gameObjectTransferData = new GameObjectTransferData({ guid: editor.config.PreviewGameObjectGuid });
		window.vext.SendMessage(new PreviewDestroyMessage(gameObjectTransferData));
		this.isPreviewBlueprintSpawned = false;
	}

	public onPreviewDrop() {
		if (this.previewBlueprint === null) {
			return;
		}
		editor.SpawnBlueprint(this.previewBlueprint, this.screenToWorldTransform, this.previewBlueprint.getDefaultVariation());

		const gameObjectTransferData = new GameObjectTransferData({ guid: editor.config.PreviewGameObjectGuid });
		window.vext.SendMessage(new PreviewDestroyMessage(gameObjectTransferData));
		this.isPreviewBlueprintSpawned = false;
		this.previewBlueprint = null;
	}

	public select(guid: Guid, multiSelection: boolean, scrollTo: boolean, moveGizmo: boolean) {
		const gameObject = editor.gameObjects.getValue(guid) as GameObject;
		// this.unhighlight();
		// When selecting nothing, deselect all if its not multi selection.
		if (guid.equals(Guid.createEmpty())) {
			console.log('Deselecting');
			if (!multiSelection) {
				editor.selectionGroup.deselectAll();
				editor.threeManager.hideGizmo();
			}
			return;
		}
		if (gameObject === undefined) {
			LogError('Failed to select gameobject: ' + guid);
			return false;
		}

		if (editor.selectionGroup.selectedGameObjects.length === 0) {
			editor.threeManager.showGizmo();
		}

		editor.selectionGroup.select(gameObject, multiSelection, scrollTo, moveGizmo);
		editor.threeManager.setPendingRender();
	}

	public deselect(guid: Guid) {
		console.log('Deselecting');
		const scope = editor;
		const gameObject = scope.gameObjects.getValue(guid);
		if (gameObject === undefined) {
			return;
		}
		editor.selectionGroup.deselect(gameObject);
		if (scope.selectionGroup.selectedGameObjects.length === 0) {
			scope.threeManager.hideGizmo();
		}
	}

	public highlight(guid: Guid, multiple = false) {
		// Ignore if already highlighted
		if (this.highlightedObjects.containsKey(guid)) {
			return;
		}
		const gameObject = editor.gameObjects.getValue(guid) as GameObject;
		// Ignore if selected
		if (gameObject.selected) {
			return;
		}

		if (!gameObject) {
			LogError('Failed to highlight gameobject: ' + guid);
			return false;
		}
		if (!multiple) {
			this.unhighlight();
		}
		gameObject.onHighlight();
		this.highlightedObjects.setValue(guid, gameObject);
		editor.threeManager.setPendingRender();
	}

	public unhighlight(guid?: Guid) {
		if (guid !== undefined) {
			const gameObject = editor.gameObjects.getValue(guid) as GameObject;
			if (!gameObject.selected) {
				gameObject.onUnhighlight();
				this.highlightedObjects.remove(guid);
			}
		} else {
			for (const gameObject of this.highlightedObjects.values()) {
				if (!gameObject.selected) {
					gameObject.onUnhighlight();
					this.highlightedObjects.remove(gameObject.guid);
				}
			}
		}
		editor.threeManager.setPendingRender();
	}
}
