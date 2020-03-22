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

export class GameObject extends THREE.Object3D implements IGameEntity {
	public guid: Guid;
	public typeName: string;
	public transform: LinearTransform;
	public parentData: GameObjectParentData;
	public blueprintCtrRef: CtrRef;
	public variation: number;
	public gameEntitiesData: GameEntityData[];

	public selected: boolean;
	public highlighted: boolean;
	private completeBoundingBox: THREE.Box3;
	private _enabled: boolean;

	constructor(guid: Guid = Guid.create(), typeName: string = 'GameObject', name: string = 'Unnamed GameObject',
		transform: LinearTransform = new LinearTransform(), parentData: GameObjectParentData = new GameObjectParentData(),
		blueprintCtrRef: CtrRef = new CtrRef(), variation: number = 0, gameEntities: GameEntityData[] = []) {
		super();

		this.guid = guid;
		this.typeName = typeName;
		this.name = name;
		this.transform = transform;
		this.parentData = parentData;
		this.blueprintCtrRef = blueprintCtrRef;
		this.variation = variation;
		this.children = [];
		this.gameEntitiesData = gameEntities;

		this.selected = false;
		this.matrixAutoUpdate = true;
		this.visible = false;
		this._enabled = true;
		this.highlighted = false;

		this.completeBoundingBox = new THREE.Box3();
		// Update the matrix after initialization.
		this.updateMatrix();
	}

	public static CreateWithTransferData(gameObjectTransferData: GameObjectTransferData) {
		return new this(
			gameObjectTransferData.guid,
			gameObjectTransferData.typeName,
			gameObjectTransferData.name,
			gameObjectTransferData.transform,
			gameObjectTransferData.parentData,
			gameObjectTransferData.blueprintCtrRef,
			gameObjectTransferData.variation,
			gameObjectTransferData.gameEntities
		);
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
			variation: this.variation
		});
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
		const matrix = this.transform.toMatrix();
		const parent = this.parent;
		if (parent !== null && parent.type !== 'Scene') {
			editor.threeManager.attachToScene(this as GameObject);
		}
		matrix.decompose(this.position, this.quaternion, this.scale);
		this.updateMatrix();
	}

	public setTransform(linearTransform: LinearTransform) {
		this.transform = linearTransform;
		this.updateTransform();
		editor.threeManager.setPendingRender();
		// signals.objectChanged.emit(this, 'transform', linearTransform);
	}

	public onMoveEnd(force: boolean = false) {
		const scope = this;
		if (!scope.hasMoved() && !force) {
			return; // No position change
		}
		this.updateMatrixWorld(true);
		const transform = new LinearTransform().setFromMatrix(scope.matrixWorld);
		const command = new SetTransformCommand(new GameObjectTransferData({
			guid: this.guid,
			transform: this.transform
		}), transform);
		editor.execute(command);
		// signals.objectChanged.emit(this, 'transform', transform);

		// Send move command to server
	}

	public setName(name: string) {
		this.name = name;
		// signals.objectChanged.emit(this, 'name', name);
	}

	public setVariation(key: number) {
		this.variation = key;
		// signals.objectChanged.emit(this, 'variation', key);
	}

	public getLinearTransform() {
		new LinearTransform().setFromMatrix(this.matrixWorld);
	}

	public Enable() {
		for (const child of this.children) {
			if (child.constructor.name === 'GameObject') {
				(child as GameObject).Enable();
			} else {
				(child as GameObject).visible = true;
			}
		}
		this.visible = true;
		this._enabled = true;
		// signals.objectChanged.emit(this, 'enabled', this.enabled);
	}

	public Disable() {
		for (const child of this.children) {
			if (child.constructor.name === 'GameObject') {
				(child as GameObject).Disable();
			} else {
				(child as GameObject).visible = false;
			}
		}
		this.visible = false;
		this._enabled = false;
		// signals.objectChanged.emit(this, 'enabled', this.enabled);
	}

	set enabled(value: boolean) {
		if (value) {
			window.editor.execute(new EnableBlueprintCommand(this.getGameObjectTransferData()));
		} else {
			window.editor.execute(new DisableBlueprintCommand(this.getGameObjectTransferData()));
		}
	}

	onSelect() {
		this.visible = true;
		this.selected = true;
		this.children.forEach(go => (go as GameObject).onSelect());
	}

	onDeselect() {
		this.visible = false;
		this.selected = false;
		this.children.forEach(go => (go as GameObject).onDeselect());
	}

	onHighlight() {
		this.visible = true;
		this.highlighted = true;
		this.children.forEach(go => (go as GameObject).onHighlight());
	}

	onUnhighlight() {
		this.visible = false;
		this.highlighted = false;
		this.children.forEach(go => (go as GameObject).onUnhighlight());
	}
}
