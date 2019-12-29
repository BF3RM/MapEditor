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

export class EditorCore {
	public raycastTransform = new LinearTransform();
	public screenToWorldTransform = new LinearTransform();
	private previewBlueprint: Blueprint | null;
	private isPreviewBlueprintSpawned = false;
	private isUpdating = false;
	private lastUpdateTime: number;
	private deltaTime: number;
	private pendingUpdates = new Map<Guid, GameObject>();
	private rl = this.renderLoop.bind(this);
	private updateRequested = false;

	constructor() {
		this.previewBlueprint = null;

		this.lastUpdateTime = 0;
		this.deltaTime = 1.0 / 30.0;

		this.renderLoop(); // first call to init loop using the requestAnimationFrame
	}

	public getRaycastTransform() {
		return this.raycastTransform.clone();
	}

	public setUpdating(value: boolean) {
		this.isUpdating = value;
		if (value) {
			this.renderLoop();
		}
	}

	public RequestUpdate() {
		this.updateRequested = true;
		this.setUpdating(true);
	}

	public renderLoop() {
		const scope = this;
		// GameObject update

		// This var is checked twice because we might have stopped the rendering during the last update.
		if (!scope.isUpdating) {
			return;
		}
		if (scope.lastUpdateTime === 0 ||
			scope.lastUpdateTime + (scope.deltaTime * 1000.0) <= Date.now()) {
			scope.lastUpdateTime = Date.now();

			/* for ( var key in this.gameObjects )
			{
				var object = this.gameObjects[key];

				if (object.update != undefined)
					object.update( this.deltaTime );

			}
			*/

			this.pendingUpdates.forEach((gameObject, guid) => {
				const changes = gameObject.getChanges();
				if (!changes) {
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
		}
		// An update was requested outside of the usual ThreeJS render loop, this probably means some command has been executed.
		if (this.updateRequested) {
			editor.threeManager.Render();
			this.updateRequested = false;
		}
		// TODO: Add an FPS and rendering indecator.
		if (this.isUpdating) {
			window.requestAnimationFrame(this.rl);
		}
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

	public onSelectGameObject(gameObject: GameObject) {
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
			editor.threeManager.ShowGizmo();
		}
		editor.threeManager.AttachGizmoTo(editor.selectionGroup);
		editor.threeManager.Render();
		*/
		this.RequestUpdate();
		signals.selectedGameObject.emit(gameObject.guid);
		return true;
	}

	public onDeselectedGameObject(guid: Guid) {
		const scope = editor;
		const gameObject = scope.gameObjects.getValue(guid);
		if (gameObject === undefined) {
			return;
		}
		scope.threeManager.RemoveFromScene(gameObject);

		signals.deselectedGameObject.emit(guid);
		if (scope.selectionGroup.children.length === 0) {
			scope.threeManager.HideGizmo();
		}
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
}
