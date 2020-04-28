import { LinearTransform } from './types/primitives/LinearTransform';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { PreviewDestroyMessage } from './messages/PreviewDestroyMessage';
import { Blueprint } from '@/script/types/Blueprint';
import * as Collections from 'typescript-collections';
import { Guid } from '@/script/types/Guid';
import { GameObject } from '@/script/types/GameObject';
import { Message } from '@/script/messages/Message';
import { LogError } from '@/script/modules/Logger';
import { signals } from '@/script/modules/Signals';
import { SetScreenToWorldTransformMessage } from '@/script/messages/SetScreenToWorldTransformMessage';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { MoveObjectMessage } from '@/script/messages/MoveObjectMessage';
import { PreviewSpawnMessage } from '@/script/messages/PreviewSpawnMessage';
import { GIZMO_MODE } from '@/script/modules/THREEManager';
import Stats from 'three/examples/jsm/libs/stats.module';

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
	public highlightedObjectGuid: Guid | null = null;

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
			// this.renderLoop();
		}
	}

	public RequestUpdate() {
		this.updateRequested = true;
		this.setUpdating(true);
	}

	public renderLoop() {
		const scope = this;
		scope.stats.begin();
		// GameObject update
		this.pendingUpdates.forEach((gameObject, guid) => {
			const changes = gameObject.getChanges();
			if (!changes || !editor.vext.doneExecuting) {
				return;
			}
			for (const changeKey in changes) {
				if (!(changeKey in changes)) {
					continue;
				}
				const change = changes[changeKey];
				editor.vext.SendMessage(change);
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

	public onSelectGameObject(gameObject: GameObject, isMultiSelection?:boolean) {
		editor.threeManager.onSelectGameObject(gameObject);
		/*

		// If the object is already in this group and it's a multiselection we deselect it
		if (gameObject.parent === editor.selectionGroup && isMultiSelection) {
			editor.Deselect(guid);
			return false;
		}

		// If we are selecting an object already selected (single selection)
		if (gameObject.parent === editor.selectionGroup && !isMultiSelection && editor.selectionGroup.children.length === 1 && editor.selectionGroup.children[0] === gameObject) {
			return false;
		}

		// Clear selection group when it's a single selection
		if (!isMultiSelection && editor.selectionGroup.children.length !== 0) {
			for (let i = editor.selectionGroup.children.length - 1; i >= 0; i--) {
				editor.Deselect(editor.selectionGroup.children[i].guid);
			}
		}
		editor.threeManager.scene.attach(gameObject);
		if (editor.selectionGroup.children.length === 0) {
			editor.selectionGroup.setTransform(new LinearTransform().setFromMatrix(gameObject.matrixWorld));
		}
		editor.selectionGroup.AttachObject(gameObject);

		signals.selectedGameObject.emit(guid, isMultiSelection, scrollTo);

		editor.selectionGroup.Select();
		if (editor.selectionGroup.children.length !== 0) {
			editor.threeManager.showGizmo();
		}
		editor.threeManager.AttachGizmoTo(editor.selectionGroup);
		editor.threeManager.setPendingRender();
		*/
		this.RequestUpdate();
		signals.selectedGameObject.emit(gameObject.guid, isMultiSelection);
		return true;
	}

	public onPreviewDragStart(blueprint: Blueprint) {
		this.previewBlueprint = blueprint;
	}

	public onPreviewDrag(e: MouseEvent) {
		const direction = editor.threeManager.getMouse3D(e);
		const s2wMessage = new SetScreenToWorldTransformMessage(new Vec3(direction.x, direction.y, direction.z));
		editor.vext.SendMessage(s2wMessage);

		if (this.previewBlueprint == null || !this.isPreviewBlueprintSpawned) {
			return;
		}

		const gameObjectTransferData = new GameObjectTransferData({
			guid: editor.config.PreviewGameObjectGuid,
			transform: this.screenToWorldTransform.clone()
		});

		editor.vext.SendMessage(new MoveObjectMessage(gameObjectTransferData));
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

		editor.vext.SendMessage(new PreviewSpawnMessage(gameObjectTransferData));
		this.isPreviewBlueprintSpawned = true;
	}

	public onPreviewStop() {
		const gameObjectTransferData = new GameObjectTransferData({ guid: editor.config.PreviewGameObjectGuid });
		editor.vext.SendMessage(new PreviewDestroyMessage(gameObjectTransferData));
		this.isPreviewBlueprintSpawned = false;
	}

	public onPreviewDrop() {
		if (this.previewBlueprint === null) {
			return;
		}
		editor.SpawnBlueprint(this.previewBlueprint, this.screenToWorldTransform, this.previewBlueprint.getDefaultVariation());

		const gameObjectTransferData = new GameObjectTransferData({ guid: editor.config.PreviewGameObjectGuid });
		editor.vext.SendMessage(new PreviewDestroyMessage(gameObjectTransferData));
		this.isPreviewBlueprintSpawned = false;
		this.previewBlueprint = null;
	}

	public select(guid: Guid, multiSelection: boolean, moveGizmo: boolean) {
		const gameObject = editor.gameObjects.getValue(guid) as GameObject;
		if (this.highlightedObjectGuid === guid) {
			this.unhighlight();
		}

		if (gameObject === undefined) {
			LogError('Failed to select gameobject: ' + guid);
			return false;
		}

		editor.selectionGroup.select(gameObject, multiSelection, moveGizmo);
		editor.threeManager.setGizmoMode(GIZMO_MODE.translate); // should it?
		return editor.editorCore.onSelectGameObject(gameObject, multiSelection);
	}

	public deselect(guid: Guid) {
		const scope = editor;
		const gameObject = scope.gameObjects.getValue(guid);
		if (gameObject === undefined) {
			return;
		}
		// scope.threeManager.removeFromScene(gameObject);
		editor.selectionGroup.deselect(gameObject);
		// TODO
		signals.deselectedGameObject.emit(guid);
		if (scope.selectionGroup.selectedGameObjects.length === 0) {
			scope.threeManager.hideGizmo();
		}
	}

	public highlight(guid: Guid) {
		// Ignore if already highlighted
		if (this.highlightedObjectGuid === guid) {
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
		this.unhighlight();
		gameObject.onHighlight();
		this.highlightedObjectGuid = guid;
	}

	public unhighlight() {
		if (this.highlightedObjectGuid == null) return;
		const gameObject = editor.gameObjects.getValue(this.highlightedObjectGuid) as GameObject;
		if (gameObject) {
			gameObject.onUnhighlight();
		}
		this.highlightedObjectGuid = null;
	}
}
