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
	/** Placed but deliberately not instantiated (GH #394): no engine entities behind it. */
	public isPlaceholder = false;
	public originalRef: CtrRef | undefined;
	// public overrides = new Dictionary<string, IEBXFieldData>()// guid, field
	public overrides: { [path: string]: IEBXFieldData } = {};
	/**
	 * Applied (BLUEPRINT-layer) overrides for this object's blueprint: shared by every instance of
	 * it, and distinct from `overrides`, which belong to this instance alone.
	 *
	 * Apply used to delete the instance override and show nothing in its place, so an applied
	 * change looked reverted and a second apply looked like a no-op. Keeping the layer visible is
	 * the point: vanilla <- blueprint overrides <- personal overrides.
	 */
	public blueprintOverrides: { [path: string]: IEBXFieldData } = {};
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
		realm: REALM = REALM.CLIENT_AND_SERVER,
		overrides: { [path: string]: IEBXFieldData } = {},
		isPlaceholder: boolean = false,
		blueprintOverrides: { [path: string]: IEBXFieldData } = {}
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
		this.isPlaceholder = isPlaceholder;
		this.originalRef = originalRef;
		this.realm = realm;
		// Carry per-instance EBX overrides through construction. The ext sends them in the
		// transfer data (GameObject:GetGameObjectTransferData), keyed by dot-path. Without this,
		// a GameObject rebuilt on reselect/duplicate (CreateWithTransferData) started with an
		// empty overrides map, so the inspector showed the prefab's ORIGINAL values instead of
		// this instance's edits. Normalize an array payload (legacy) into the path-keyed map.
		if (Array.isArray(overrides)) {
			const map: { [path: string]: IEBXFieldData } = {};
			for (const o of overrides as IEBXFieldData[]) {
				map[this._GetPath(o, '')] = o;
			}
			this.overrides = map;
		} else {
			this.overrides = overrides || {};
		}
		// Same normalization as above: the ext may send this as an array or a path-keyed map.
		if (Array.isArray(blueprintOverrides)) {
			const bpMap: { [path: string]: IEBXFieldData } = {};
			for (const o of blueprintOverrides as IEBXFieldData[]) {
				bpMap[this._GetPath(o, '')] = o;
			}
			this.blueprintOverrides = bpMap;
		} else {
			this.blueprintOverrides = blueprintOverrides || {};
		}

		this.setWorldMatrix(this.transform.toMatrix(), true);
		// Update the matrix after initialization.
		this.updateMatrix();
	}

	public get partition(): Promise<FBPartition> | null {
		// registerPartition = get-or-create: returns the preloaded partition, or lazily
		// registers one so its data still loads. Avoids the null -> stuck-loading path.
		const partition = window.editor.fbdMan.registerPartition(this.blueprintCtrRef.name, this.blueprintCtrRef.partitionGuid);
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
			gameObjectTransferData.realm,
			gameObjectTransferData.overrides as any,
			gameObjectTransferData.isPlaceholder,
			(gameObjectTransferData as any).blueprintOverrides
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

		// A field set back to its base value is NOT an override — drop it from tracking. This is
		// what makes Revert (which re-sends the field's captured base value) actually clear the
		// entry, instead of leaving a no-op "base -> base" row lingering in the Overrides panel.
		// It also naturally un-tracks a field the user manually types back to its base value.
		if (this._isRevertToBase(newOverride)) {
			if (this.overrides[path] !== undefined) {
				const next = { ...this.overrides };
				delete next[path];
				this.overrides = next;
			}
			return;
		}

		this.overrides = {
			...this.overrides,
			[path]: newOverride
		};
	}

	// Walk an override chain to its printable leaf and check whether the new value equals the
	// base value the leaf captured at edit time (Property.vue oldValue).
	private _isRevertToBase(node: IEBXFieldData): boolean {
		let leaf: IEBXFieldData = node;
		while (leaf && !isPrintable(leaf.type)) {
			leaf = leaf.value as IEBXFieldData;
		}
		if (!leaf) {
			return false;
		}
		const oldValue = (leaf as any).oldValue;
		if (oldValue === undefined) {
			return false;
		}
		return this._valuesEqual(leaf.value, oldValue);
	}

	private _valuesEqual(a: any, b: any): boolean {
		if (a === b) {
			return true;
		}
		if (a && b && typeof a === 'object' && typeof b === 'object') {
			return JSON.stringify(a) === JSON.stringify(b);
		}
		return false;
	}

	public ApplyOverrides() {}

	// Flattens the per-path override map into a display list for the inspector's override panel.
	// Each override is a nested IEBXFieldData chain (field -> value -> field -> ... -> leaf); we
	// descend to the printable leaf to read the new value and the oldValue the leaf control
	// captured at edit time (Property.vue onChangeValue), so the panel can show new vs original
	// without re-walking the blueprint partition.
	public get overrideSummary(): { path: string; label: string; newValue: any; oldValue: any }[] {
		const out: { path: string; label: string; newValue: any; oldValue: any }[] = [];
		for (const [path, override] of Object.entries(this.overrides)) {
			let node: IEBXFieldData = override;
			while (node && !isPrintable(node.type)) {
				node = node.value as IEBXFieldData;
			}
			if (node) {
				const segments = path.split('.');
				out.push({
					path,
					label: segments[segments.length - 1] || path,
					newValue: node.value,
					oldValue: (node as any).oldValue
				});
			}
		}
		return out;
	}

	/**
	 * The BLUEPRINT layer, in the same shape as overrideSummary.
	 *
	 * These are applied overrides: they belong to every instance of the blueprint rather than to
	 * this object. Apply used to clear the personal override and show nothing in its place, so the
	 * panel emptied and the change read as reverted.
	 */
	public get blueprintOverrideSummary(): { path: string; label: string; newValue: any }[] {
		const out: { path: string; label: string; newValue: any }[] = [];
		for (const [path, override] of Object.entries(this.blueprintOverrides || {})) {
			let node: IEBXFieldData = override as IEBXFieldData;
			while (node && !isPrintable(node.type)) {
				node = node.value as IEBXFieldData;
			}
			if (node) {
				const segments = path.split('.');
				out.push({ path, label: segments[segments.length - 1] || path, newValue: node.value });
			}
		}
		return out;
	}

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
