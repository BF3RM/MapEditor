import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { MoveObjectMessage } from '@/script/messages/MoveObjectMessage';
import { Guid } from '@/script/types/Guid';
import { CtrRef } from '@/script/types/CtrRef';
import { GameObjectParentData } from '@/script/types/GameObjectParentData';
import { GameEntityData } from '@/script/types/GameEntityData';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { signals } from '@/script/modules/Signals';
import * as THREE from 'three';
import { IGameEntity } from '@/script/interfaces/IGameEntity';
import { GAMEOBJECT_ORIGIN, REALM } from '@/script/types/Enums';
import { FBPartition } from '@/script/types/gameData/FBPartition';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';
import { isPrintable } from '@/script/modules/Utils';
import { SpatialGameEntity } from './SpatialGameEntity';

/**
	GameObjects dont have meshes, instead they have GameEntities that hold the AABBs. When a GameObject is hidden we set
	their GameEntities to visible = false. GameObjects should always be visible as we want to render their children even
	when the parent is hidden. Renderer ignores an object if its visible flag is false, so it would ignore their children.
 */
export class GameObject extends THREE.Object3D implements IGameEntity {
	public guid: Guid;

	// Holds the transform of the last client update. It doesn't update if its a web-only move (like moving before releasing left-click)
	public transform: LinearTransform;
	public parentData: GameObjectParentData;
	public blueprintCtrRef: CtrRef;
	public variation: number;
	public gameEntitiesData: GameEntityData[];
	public origin: GAMEOBJECT_ORIGIN;
	public selected: boolean = false;
	public highlighted: boolean = false;
	private _enabled: boolean = true;
	private _raycastEnabled: boolean = true;
	public declare parent: GameObject;
	public isUserModified: boolean;
	public originalRef: CtrRef | undefined;
	// public overrides = new Dictionary<string, IEBXFieldData>()// guid, field
	public overrides: { [path: string]: IEBXFieldData } = {};
	public realm: REALM;

	public get localTransform(): LinearTransform {
		if (this.parent) {
			const parentWorldInverse = new THREE.Matrix4().copy(this.parent.matrixWorld).invert();
			return new LinearTransform().setFromMatrix(
				new THREE.Matrix4().multiplyMatrices(parentWorldInverse, this.matrixWorld)
			);
		} else {
			return new LinearTransform().setFromMatrix(this.matrixWorld);
		}
	}

	public set localTransform(newValue: LinearTransform) {
		this.matrix = newValue.toMatrix();
	}

	constructor(
		guid: Guid = Guid.create(),
		name: string = 'Unnamed GameObject',
		transform: LinearTransform = new LinearTransform(),
		parentData: GameObjectParentData = new GameObjectParentData(),
		blueprintCtrRef: CtrRef = new CtrRef(),
		variation: number = 0,
		gameEntities: GameEntityData[] = [],
		origin: GAMEOBJECT_ORIGIN = GAMEOBJECT_ORIGIN.CUSTOM,
		isUserModified: boolean = false,
		originalRef: CtrRef | undefined = undefined,
		realm: REALM = REALM.CLIENT_AND_SERVER
	) {
		super();
		this.guid = guid;
		this.name = name;
		this.transform = transform;
		this.parentData = parentData;
		this.blueprintCtrRef = blueprintCtrRef;
		this.variation = variation;
		this.children = [];
		this.gameEntitiesData = gameEntities;
		this.origin = origin;

		this.matrixAutoUpdate = false;
		this.visible = false;
		this.isUserModified = isUserModified;
		this.originalRef = originalRef;
		this.realm = realm;
		this.setWorldMatrix(this.transform.toMatrix(), true);
		// Update the matrix after initialization.
		this.updateMatrix();
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
			gameObjectTransferData.origin,
			gameObjectTransferData.isUserModified,
			gameObjectTransferData.originalRef,
			gameObjectTransferData.realm
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
			origin: this.origin,
			transform: this.transform,
			variation: this.variation,
			overrides: this.overrides,
			realm: this.realm
		});
	}

	public getAllChildren(): GameObject[] {
		const out = [] as GameObject[];
		this.children.forEach((go) => {
			if (go instanceof GameObject) {
				// console.log(go);
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

	/**
	 * Updates GameObjects' transforms and SpatialGameEntities' matrices.
	 */
	public updateChildrenMatrices(updateTransform: boolean) {
		if (updateTransform) {
			this.transform = new LinearTransform().setFromMatrix(this.matrixWorld);
		}

		for (const child of this.children) {
			(child as any).updateChildrenMatrices();
		}
	}

	/**
	 * Translates world matrix to local in order to set the matrix.
	 */
	public setWorldMatrix(worldMatrix: THREE.Matrix4, updateTransform: boolean) {
		// Move respective to the parent if it has one
		if (this.parent) {
			// Calculate local transform.
			const parentWorldInverse = new THREE.Matrix4();
			parentWorldInverse.copy(this.parent.matrixWorld).invert();
			worldMatrix.multiplyMatrices(parentWorldInverse, worldMatrix);
		}

		worldMatrix.decompose(this.position, this.quaternion, this.scale);
		this.updateMatrix(); // Matrix will be updated in next render call.
		this.updateMatrixWorld(true);
		// Update matrices of spatial entities and update gameobjects' transforms if it's not
		// a web-only change after the matrix is recalculated in the next frame
		editor.threeManager.nextFrame(() => {
			this.updateChildrenMatrices(updateTransform);
		});
	}

	public setTransform(linearTransform: LinearTransform) {
		const oldTransform = this.transform.clone();
		this.setWorldMatrix(linearTransform.toMatrix(), true);

		if (this.originalRef !== undefined && this.parent && this.parent.partition) {
			this.parent.partition.then((res) => {
				// @ts-ignore
				const instance = res.getInstance(this.originalRef.instanceGuid);
				console.log(instance);
				if (instance) {
					const transform = new LinearTransform().setFromMatrix(this.matrix);
					if (this.originalRef) {
						this.parent.setOverride({
							field: 'blueprintTransform',
							value: transform,
							oldValue: oldTransform,
							type: 'LinearTransform'
						});
					}
					instance.fields.blueprintTransform.value.set(transform);
				}
			});
		}
		editor.threeManager.setPendingRender();
		editor.threeManager.nextFrame(() => signals.objectChanged.emit(this, 'transform', linearTransform));
	}

	private _GetPath(field: IEBXFieldData, path: string): string {
		if (!isPrintable(field.type)) {
			if (path === '') {
				path = field.field;
			} else {
				path = path + '.' + field.field;
			}
			return this._GetPath(field.value, path);
		}
		if (path === '') {
			return field.field;
		}
		return path + '.' + field.field;
	}

	public setOverride(newOverride: IEBXFieldData) {
		const path = this._GetPath(newOverride, '');

		this.overrides = {
			...this.overrides,
			[path]: newOverride
		};

		console.log(this.overrides);
		// this.overrides.setValue(path, newOverride);
	}

	public ApplyOverrides() {}

	public setName(name: string) {
		this.name = name;
		signals.objectChanged.emit(this, 'name', name);
	}

	public setVariation(key: number) {
		this.variation = key;
		signals.objectChanged.emit(this, 'variation', key);
	}

	public setRealm(realm: REALM) {
		this.realm = realm;
		signals.objectChanged.emit(this, 'realm', realm);
	}

	public getLinearTransform() {
		new LinearTransform().setFromMatrix(this.matrixWorld);
	}

	set raycastEnabled(value: boolean) {
		for (const child of this.children) {
			if (child instanceof GameObject) {
				child.raycastEnabled = value;
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
				child.Enable();
			}
		}
		this._enabled = true;
		signals.objectChanged.emit(this, 'enabled', this.enabled);
	}

	public Disable() {
		for (const child of this.children) {
			if (child instanceof GameObject) {
				child.Disable();
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
		this.children.forEach((go) => (go as unknown as IGameEntity).onSelect());
	}

	onDeselect() {
		this.selected = false;
		this.visible = false;
		this.makeParentsInvisible();
		this.children.forEach((go) => (go as unknown as IGameEntity).onDeselect());
	}

	onHighlight() {
		if (this.selected) return;
		this.highlighted = true;
		this.visible = true;
		this.makeParentsVisible();
		this.children.forEach((go) => (go as unknown as IGameEntity).onHighlight());
	}

	onUnhighlight() {
		if (this.selected) return;
		this.highlighted = false;
		this.visible = false;
		this.makeParentsInvisible();
		this.children.forEach((go) => (go as unknown as IGameEntity).onUnhighlight());
	}

	makeParentsInvisible() {
		if (this.parent !== null && this.parent.constructor === GameObject) {
			this.parent.visible = false;
			this.parent.makeParentsInvisible();
		}
		editor.selectionGroup.makeParentsVisible();
	}

	makeParentsVisible() {
		if (this.parent !== null && this.parent.constructor === GameObject) {
			this.parent.visible = true;
			this.parent.makeParentsVisible();
		}
	}

	private MergeOverride(out: any, override: IEBXFieldData): Object {
		if (out[override.field]) {
			if (isPrintable(override.type)) {
				out[override.field].value = override.value;
				return out;
			} else {
				return this.MergeOverride(out[override.field], override.value);
			}
		} else {
			if (isPrintable(override.type)) {
				out[override.field] = override.value;
			} else {
				out[override.field] = {};
				return this.MergeOverride(out[override.field], override.value);
			}
			return out;
		}
	}

	public get EBXOverrides(): any {
		const out: any = {};
		for (const override of Object.values(this.overrides)) {
			this.MergeOverride(out, override);
		}
		console.log(out);
		if (this.blueprintCtrRef.typeName === 'PrefabBlueprint') {
			return out.objects;
		}
		return out.object;
	}

	public isSelectableWithRaycast(): boolean {
		if (this.name === 'Gameplay/Logic/ShowRoom' || !this.raycastEnabled) {
			return false;
		}

		return true;
	}
}
