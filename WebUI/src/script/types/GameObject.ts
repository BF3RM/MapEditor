import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { SetTransformCommand } from '@/script/commands/SetTransformCommand';
import { MoveObjectMessage } from '@/script/messages/MoveObjectMessage';
import { Guid } from 'guid-typescript';
import { CtrRef } from '@/script/types/CtrRef';
import { GameObjectParentData } from '@/script/types/GameObjectParentData';
import { GameEntityData } from '@/script/types/GameEntityData';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { signals } from '@/script/modules/Signals';
import * as THREE from 'three';

export class GameObject extends THREE.Object3D {
	public guid: Guid;
	public typeName: string;
	public transform: LinearTransform;
	public parentData: GameObjectParentData;
	public blueprintCtrRef: CtrRef;
	public variation: number;
	public children: GameObject[];
	public gameEntities: GameEntityData[];

	public selected: boolean;
	public enabled: boolean;
	public highlighted: boolean;
	private completeBoundingBox: THREE.Box3;

	constructor(guid: Guid = Guid.create(), typeName: string = 'GameObject', name: string = 'Unnamed GameObject', transform: LinearTransform = new LinearTransform(), parentData: GameObjectParentData = new GameObjectParentData(), blueprintCtrRef: CtrRef = new CtrRef(), variation: number = 0, gameEntities: GameEntityData[] = []) {
		super();

		this.guid = guid;
		this.typeName = typeName;
		this.name = name;
		this.transform = transform;
		this.parentData = parentData;
		this.blueprintCtrRef = blueprintCtrRef;
		this.variation = variation;
		this.children = [];
		this.gameEntities = gameEntities;

		this.selected = false;
		this.matrixAutoUpdate = false;
		this.visible = true;
		this.enabled = true;
		this.highlighted = false;

		this.completeBoundingBox = new THREE.Box3();

		// Update the matrix after initialization.
		this.updateTransform();
		this.updateMatrix();
	}

	public getBlueprint() {
		return editor.blueprintManager.getBlueprintByGuid(this.blueprintCtrRef.instanceGuid);
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

	public renderInit() {
		this.updateTransform();
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
		const matrix = new THREE.Matrix4();
		matrix.set(
			this.transform.left.x, this.transform.up.x, this.transform.forward.x, this.transform.trans.x,
			this.transform.left.y, this.transform.up.y, this.transform.forward.y, this.transform.trans.y,
			this.transform.left.z, this.transform.up.z, this.transform.forward.z, this.transform.trans.z,
			0, 0, 0, 1);

		// As the position is local, we have to detach the object from its parent first
		const parent = this.parent;

		// remove child from parent and add it to scene
		if (parent !== null) {
			THREE.SceneUtils.detach(this, parent, editor.threeManager.scene);
		}

		matrix.decompose(this.position, this.quaternion, this.scale);
		this.updateMatrix();
		// remove child from scene and add it to parent
		if (parent !== null) {
			THREE.SceneUtils.attach(this, editor.threeManager.scene, parent);
		}
	}

	public updateWorldTransform(updateChild = false) {
		this.transform = new LinearTransform().setFromMatrix(this.matrixWorld);

		if (updateChild) {
			for (const key in this.children) {
				const child = this.children[key];
				if (child instanceof GameObject) {
					console.log('Updating child');
					child.updateWorldTransform(true);
				}
			}
		}
	}

	public update(deltaTime: number) {
		// this.updateTransform( );
	}

	public setTransform(linearTransform: LinearTransform) {
		this.transform = linearTransform;
		this.updateTransform();

		for (const key in this.children) {
			const child = this.children[key];
			if (child.constructor.name === 'GameObject') {
				child.updateWorldTransform();
			}
		}

		editor.threeManager.Render();
		signals.objectChanged.emit(this, 'transform', linearTransform);
	}

	public setName(name: string) {
		this.name = name;
		signals.objectChanged.emit(this, 'name', name);
	}

	public setVariation(key: number) {
		this.variation = key;
		signals.objectChanged.emit(this, 'variation', key);
	}

	public Clone(guid: Guid) {
		if (guid === undefined) {
			guid = Guid.create();
		}

		// TODO: Create a new GameObject with a new GUID
		// return new GameObject(guid, this.name, this.transform, this.objectParent, this.children, this.gameObjectTransferData);
	}

	public onMoveStart() {
		console.log('move start');
		// TODO: Validate that the object exists
	}

	public onMove() {
		const scope = this;
		if (!scope.hasMoved()) {
			return;
		}
		const transform = new LinearTransform().setFromMatrix(scope.matrixWorld);
		signals.objectChanged.emit(this, 'transform', transform);
		// Send move message to client
	}

	public onMoveEnd() {
		const scope = this;
		if (!scope.hasMoved()) {
			return; // No position change
		}
		const transform = new LinearTransform().setFromMatrix(scope.matrixWorld);
		const command = new SetTransformCommand(new GameObjectTransferData({
			guid: this.guid,
			transform: this.transform
		}), transform);
		editor.execute(command);
		signals.objectChanged.emit(this, 'transform', transform);

		// Send move command to server
	}

	public Select() {
		this.onSelected();
	}

	public Deselect() {
		this.onDeselected();
	}

	public Highlight() {
		this.highlighted = true;

		for (let i = 0; i < this.children.length; i++) {
			this.children[i].Highlight();
		}
	}

	public Unhighlight() {
		this.highlighted = false;

		for (let i = 0; i < this.children.length; i++) {
			this.children[i].Unhighlight();
		}
	}

	public onSelected() {
		console.log(this);
		if (!this.enabled) {
			window.LogError('Attempted to select a disabled gameObject');
			return;
		}
		for (const key in this.children) {
			const child = this.children[key];
			if (child.constructor.name === 'GameObject') {
				child.Select();
			}
		}
		this.selected = true;
	}

	public onDeselected() {
		if (!this.enabled) {
			window.LogError('Attempted to deselect a disabled gameObject');
			return;
		}
		for (const key in this.children) {
			const child = this.children[key];
			if (child.constructor.name === 'GameObject') {
				child.Deselect();
			}
		}
		this.selected = false;
	}

	public Enable() {
		for (const key in this.children) {
			const child = this.children[key];
			if (child.constructor.name === 'GameObject') {
				child.Enable();
			} else {
				child.visible = true;
			}
		}
		this.visible = true;
		this.enabled = true;
		signals.objectChanged.emit(this, 'enabled', this.enabled);
	}

	public Disable() {
		for (const key in this.children) {
			const child = this.children[key];
			if (child.constructor.name === 'GameObject') {
				child.Disable();
			} else {
				child.visible = false;
			}
		}
		this.visible = false;
		this.enabled = false;
		signals.objectChanged.emit(this, 'enabled', this.enabled);
	}

	public getNode() {
		return {
			id: this.guid,
			name: this.getCleanName(),
			type: this.typeName,
			parentGuid: this.parentData.guid,
			draggable: true,
			droppable: true,
			children: [],
			state: {
				filtered: this.enabled
			}
		};
	}
}
