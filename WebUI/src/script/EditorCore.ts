import {LinearTransform} from './types/primitives/LinearTransform';
import {GameObjectTransferData} from '@/script/types/GameObjectTransferData';
import { PreviewDestroyMessage } from './messages/PreviewDestroyMessage';
import {Blueprint} from '@/script/types/Blueprint';
import * as Collections from 'typescript-collections';
import {Guid} from 'guid-typescript';
import {GameObject} from '@/script/types/GameObject';
import {Message} from '@/script/messages/Message';
import {LogError} from '@/script/modules/Logger';
import {signals} from '@/script/modules/Signals';
import {SetScreenToWorldTransformMessage} from '@/script/messages/SetScreenToWorldTransformMessage';
import {Vec3} from '@/script/types/primitives/Vec3';
import {MoveObjectMessage} from '@/script/messages/MoveObjectMessage';
import {PreviewSpawnMessage} from '@/script/messages/PreviewSpawnMessage';

export class EditorCore {
	public raycastTransform = new LinearTransform();
	public screenToWorldTransform = new LinearTransform();
	private previewBlueprint: Blueprint | null;
	private isPreviewBlueprintSpawned = false;
	private isUpdating = false;
	private lastUpdateTime: number;
	private deltaTime: number;
	private pendingUpdates = new Collections.Dictionary<Guid, GameObject>();
	private _renderLoop: OmitThisParameter<() => void>;


	constructor() {
		this.previewBlueprint = null;

		this.lastUpdateTime = 0;
		this.deltaTime = 1.0 / 30.0;

		this._renderLoop = this.renderLoop.bind(this);
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

	public renderLoop() {
		const scope = this;
		// GameObject update

		// This var is checked twice because we might have stopped the rendering during the last update.
		if (!scope.isUpdating) {
			return;
		}
		if ( scope.lastUpdateTime === 0 ||
			scope.lastUpdateTime + (scope.deltaTime * 1000.0) <= Date.now()) {
			scope.lastUpdateTime = Date.now();

			/*for ( var key in this.gameObjects )
			{
				var object = this.gameObjects[key];

				if (object.update != undefined)
					object.update( this.deltaTime );

			}
			*/

			this.pendingUpdates.forEach((guid, gameObject) => {
				const changes = gameObject.getChanges();
				if (!changes) {
					return;
				}
				for (const changeKey in changes) {
					if (!changes.hasOwnProperty(changeKey)) {
						continue;
					}
					const change = changes[changeKey];
					editor.vext.SendMessage(change);
				}
			});
			this.pendingUpdates.clear();
		}

		if (this.isUpdating) {
			window.requestAnimationFrame( this._renderLoop );
		}
	}
	public addPending(guid: Guid, gameObject: GameObject) {
		this.pendingUpdates.setValue(guid, gameObject);
	}

	public onSelectedGameObject(guid: Guid, isMultiSelection: boolean, scrollTo: boolean) {
		const gameObject = editor.gameObjects.getValue(guid);

		if (gameObject === undefined) {
			LogError('Failed to select gameobject: ' + guid);
			return;
		}

		// If the object is not in the scene we add it
		if (gameObject.parent === null || gameObject.parent === undefined) {
			editor.threeManager.scene.add(gameObject);
		}

		// If the object is already in this group and it's a multiselection we deselect it
		if (gameObject.parent === editor.selectionGroup && isMultiSelection) {
			editor.Deselect(guid);
			return;
		}

		// If we are selecting an object already selected (single selection)
		if (gameObject.parent === editor.selectionGroup && !isMultiSelection && editor.selectionGroup.children.length === 1 && editor.selectionGroup.children[0] === gameObject) {
			return;
		}

		// Clear selection group when it's a single selection
		if (!isMultiSelection && editor.selectionGroup.children.length !== 0) {
			for (let i = editor.selectionGroup.children.length - 1; i >= 0; i--) {
				editor.Deselect(editor.selectionGroup.children[i].guid);
			}
		}

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
	}

	public onDeselectedGameObject(guid: Guid) {
		const scope = editor;
		const gameObject = scope.gameObjects.getValue(guid);
		if (gameObject === undefined) {
			return;
		}
		scope.selectionGroup.DeselectObject(gameObject);

		scope.threeManager.scene.remove(gameObject);

		signals.deselectedGameObject.emit(guid);
		if (scope.selectionGroup.children.length === 0) {
			scope.threeManager.HideGizmo();
		}
		scope.threeManager.Render();
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
			transform: this.screenToWorldTransform.clone(),
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
			variation: this.previewBlueprint.getDefaultVariation(),
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
