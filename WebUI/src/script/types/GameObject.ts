import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { SetTransformCommand } from '@/script/commands/SetTransformCommand';
import { MoveObjectMessage } from '@/script/messages/MoveObjectMessage';
import { Guid } from '@/script/types/Guid';
import { CtrRef } from '@/script/types/CtrRef';
import { GameObjectParentData } from '@/script/types/GameObjectParentData';
import { GameEntityData } from '@/script/types/GameEntityData';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { signals } from '@/script/modules/Signals';
import * as THREE from 'three';
import EnableBlueprintCommand from '@/script/commands/EnableBlueprintCommand';
import DisableBlueprintCommand from '@/script/commands/DisableBlueprintCommand';
import { IGameEntity } from '@/script/interfaces/IGameEntity';
import { RAYCAST_LAYER } from '@/script/types/Enums';
import Instance from '@/script/types/ebx/Instance';
import Partition from '@/script/types/ebx/Partition';
import { FBPartition } from '@/script/types/gameData/FBPartition';
import { Dictionary } from 'typescript-collections';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';

/*
	GameObjects dont have meshes, instead they have GameEntities that hold the AABBs. When a GameObject is hidden we set
	their GameEntities to visible = false. GameObjects should always be visible as we want to render their children even
	when the parent is hidden. Renderer ignores an object if its visible flag is false, so it would ignore their children.
*/
export class GameObject extends THREE.Object3D implements IGameEntity {
	public guid: Guid;
	public transform: LinearTransform;
	public parentData: GameObjectParentData;
	public blueprintCtrRef: CtrRef;
	public variation: number;
	public gameEntitiesData: GameEntityData[];
	public isVanilla: boolean;
	public selected: boolean = false;
	public highlighted: boolean = false;
	// private completeBoundingBox: THREE.Box3;
	private _enabled: boolean = true;
	private _raycastEnabled: boolean = true;
	public parent: GameObject;
	public isUserModified: boolean;
	public originalRef: CtrRef | undefined;
	public overrides = new Dictionary<string, IEBXFieldData>(); // guid, field

	public get localTransform(): LinearTransform {
		const parentWorldInverse = new THREE.Matrix4().getInverse(this.parent.matrixWorld);
		return new LinearTransform().setFromMatrix(new THREE.Matrix4().multiplyMatrices(parentWorldInverse, this.matrixWorld));
	}

	public set localTransform(newValue: LinearTransform) {
		this.matrix = newValue.toMatrix();
	}

	constructor(guid: Guid = Guid.create(), name: string = 'Unnamed GameObject',
		transform: LinearTransform = new LinearTransform(), parentData: GameObjectParentData = new GameObjectParentData(),
		blueprintCtrRef: CtrRef = new CtrRef(), variation: number = 0, gameEntities: GameEntityData[] = [], isVanilla: boolean = false, isUserModified: boolean = false, originalRef: CtrRef | undefined = undefined) {
		super();

		this.guid = guid;
		this.name = name;
		this.transform = transform;
		this.parentData = parentData;
		this.blueprintCtrRef = blueprintCtrRef;
		this.variation = variation;
		this.children = [];
		this.gameEntitiesData = gameEntities;
		this.isVanilla = isVanilla;

		this.matrixAutoUpdate = false;
		this.visible = false;
		this.isUserModified = isUserModified;
		this.originalRef = originalRef;
		// this.completeBoundingBox = new THREE.Box3();
		// Update the matrix after initialization.
		this.updateMatrix();

		this.layers.enable(RAYCAST_LAYER.GAMEOBJECT);
		this.layers.disable(RAYCAST_LAYER.GAMEENTITY);
	}

	public get partition(): Promise<FBPartition> | null {
		const partition = window.editor.fbdMan.getPartitionByName(this.blueprintCtrRef.name);
		if (!partition) {
			return null;
		}
		return partition.data.then((res) => {
			return partition;
		});
	}

	public static CreateWithTransferData(gameObjectTransferData: GameObjectTransferData) {
		return new this(
			gameObjectTransferData.guid,
			gameObjectTransferData.name,
			gameObjectTransferData.transform,
			gameObjectTransferData.parentData,
			gameObjectTransferData.blueprintCtrRef,
			gameObjectTransferData.variation,
			gameObjectTransferData.gameEntities,
			gameObjectTransferData.isVanilla,
			gameObjectTransferData.isUserModified,
			gameObjectTransferData.originalRef
		);
	}

	public descendantOf(parentGameObject: GameObject): boolean {
		if (!this.parent || this.parent.type === 'Scene') {
			return false;
		}
		if (this.parent === parentGameObject) {
			return true;
		}

		for (const child of this.children) {
			if (child.constructor !== GameObject) continue;

			if ((child as GameObject).descendantOf(parentGameObject)) {
				return true;
			}
		}

		return false;
	}

	public getCleanName() {
		return this.name.replace(/^.*[\\/]/, '');
	}

	public hasMoved() {
		return !this.transform.toMatrix().equals(this.matrixWorld);
	}

	public getGameObjectTransferData() {
		return new GameObjectTransferData({
			guid: this.guid,
			name: this.name,
			blueprintCtrRef: this.blueprintCtrRef,
			parentData: this.parentData,
			transform: this.transform,
			variation: this.variation,
			overrides: this.overrides
		});
	}

	public getAllChildren():GameObject[] {
		const out = [] as GameObject[];
		this.children.forEach((go) => {
			if (go instanceof GameObject) {
				console.log(go);
				out.push(go);
				out.concat(go.getAllChildren());
			}
		});
		return out;
	}

	public getChanges() {
		const scope = this;
		const changes: any = {};
		// Add more realtime-updates here.
		if (scope.hasMoved()) {
			const gameObjectTransferData = new GameObjectTransferData({
				guid: scope.guid,
				transform: new LinearTransform().setFromMatrix(scope.matrixWorld)
			});

			changes.transform = new MoveObjectMessage(gameObjectTransferData);
		}

		if (Object.keys(changes).length === 0) {
			return false;
		}

		return changes;
	}

	public updateTransform() {
		this.setWorldMatrix(this.transform.toMatrix());
	}

	/**
	 * Translates world matrix to local in order to set the matrix.
	 */
	public setWorldMatrix(worldMatrix: THREE.Matrix4) {
		const matrix = worldMatrix;
		if (!this.parent) {
			console.warn('Found GameObject without parent, this should never happen. Guid: ' + this.guid.toString());
		} else if (this.parent.type !== 'Scene') {
			// Calculate local transform.
			const parentWorldInverse = new THREE.Matrix4();
			parentWorldInverse.getInverse(this.parent.matrixWorld);
			matrix.multiplyMatrices(parentWorldInverse, matrix);
		}
		matrix.decompose(this.position, this.quaternion, this.scale);
		this.updateMatrix(); // Matrix will update in next render call.
	}

	public setTransform(linearTransform: LinearTransform) {
		const oldTransform = this.transform.clone();
		this.transform = linearTransform;
		this.updateTransform();
		if (this.originalRef !== undefined && this.parent.partition) {
			this.parent.partition.then((res) => {
				// @ts-ignore
				const instance = res.getInstance(this.originalRef.instanceGuid);
				console.log(instance);
				if (instance) {
					const transform = new LinearTransform().setFromMatrix(this.matrix);
					if (this.originalRef) {
						this.parent.setOverride(this.originalRef, { guid: this.guid, reference: this.originalRef, field: 'blueprintTransform', value: transform, oldValue: oldTransform, type: 'LinearTransform' });
					}
					instance.fields.blueprintTransform.value.set(transform);

					console.log(instance.fields.blueprintTransform.value);
				}
			});
		}
		editor.threeManager.setPendingRender();
		editor.threeManager.nextFrame(() => signals.objectChanged.emit(this, 'transform', linearTransform));
	}

	public setOverride(ref: CtrRef, override: IEBXFieldData) {
		if (this.overrides.getValue(override.field) !== undefined) {
			// @ts-ignore
			this.overrides.getValue(override.field).value = override;
		} else {
			this.overrides.setValue(override.field, override);
		}
	}

	public setName(name: string) {
		this.name = name;
		signals.objectChanged.emit(this, 'name', name);
	}

	public setVariation(key: number) {
		this.variation = key;
		signals.objectChanged.emit(this, 'variation', key);
	}

	public getLinearTransform() {
		new LinearTransform().setFromMatrix(this.matrixWorld);
	}

	set raycastEnabled(value: boolean) {
		for (const child of this.children) {
			if (child instanceof GameObject) {
				(child).raycastEnabled = value;
			}
		}
		this._raycastEnabled = value;
		signals.objectChanged.emit(this, 'raycastEnabled', this.raycastEnabled);
	}

	get raycastEnabled() {
		return this._raycastEnabled;
	}

	public Enable() {
		for (const child of this.children) {
			if (child instanceof GameObject) {
				(child).Enable();
			}
		}
		this._enabled = true;
		signals.objectChanged.emit(this, 'enabled', this.enabled);
	}

	public Disable() {
		for (const child of this.children) {
			if (child instanceof GameObject) {
				(child).Disable();
			}
		}
		this._enabled = false;
		signals.objectChanged.emit(this, 'enabled', this.enabled);
	}

	get enabled() {
		return this._enabled;
	}

	onSelect() {
		this.selected = true;
		this.visible = true;
		this.makeParentsVisible();
		this.children.forEach(go => (go as GameObject).onSelect());
	}

	onDeselect() {
		this.selected = false;
		this.visible = false;
		this.makeParentsInvisible();
		this.children.forEach(go => (go as GameObject).onDeselect());
	}

	onHighlight() {
		if (this.selected) return;
		this.highlighted = true;
		this.visible = true;
		this.makeParentsVisible();
		this.children.forEach(go => (go as GameObject).onHighlight());
	}

	onUnhighlight() {
		if (this.selected) return;
		this.highlighted = false;
		this.visible = false;
		this.makeParentsInvisible();
		this.children.forEach(go => (go as GameObject).onUnhighlight());
	}

	makeParentsInvisible() {
		if (this.parent !== null && this.parent.constructor === GameObject) {
			this.parent.visible = false;
			(this.parent).makeParentsInvisible();
		}
		editor.selectionGroup.makeParentsVisible();
	}

	makeParentsVisible() {
		if (this.parent !== null && this.parent.constructor === GameObject) {
			this.parent.visible = true;
			(this.parent).makeParentsVisible();
		}
	}
}
