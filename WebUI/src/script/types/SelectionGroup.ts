import { GameObject } from '@/script/types/GameObject';
import * as THREE from 'three';
import { signals } from '@/script/modules/Signals';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { SetTransformCommand } from '@/script/commands/SetTransformCommand';
import BulkCommand from '@/script/commands/BulkCommand';
import { Guid } from '@/script/types/Guid';

export class SelectionGroup extends THREE.Object3D {
	public selectedGameObjects: GameObject[] = [];
	public transform: LinearTransform = new LinearTransform();

	constructor() {
		super();
		this.type = 'SelectionGroup';
		this.name = 'Selection Group';
		this.visible = true;
		// signals.objectChanged.connect(this.onObjectChanged.bind(this));
	}

	public onMove() {
		this.updateSelectedGameObjects();
		signals.selectionGroupChanged.emit(this, 'transform', this.transform);
	}

	/*
	 Moves all selected objects relative to the selection group. As SelectionGroup doesn't add the selected objects as
	 children, we have to manually calculate their new matrices. First we calc the SelectionGroup's transformation
	 matrix with the new and old SelectionGroup's matrices. Then we calc each GameObject transform relative to SelectionGroup
	 so we can now apply the transformation matrix to get their new matrices.
	 */
	public updateSelectedGameObjects() {
		const selectionGroupWorld = this.transform.toMatrix();
		const selectionGroupWorldNew = this.matrixWorld;
		// Ignore if it hasn't moved.
		if (selectionGroupWorld.equals(selectionGroupWorldNew)) {
			this.transform = new LinearTransform().setFromMatrix(selectionGroupWorldNew);
			return;
		}
		const oldMatrixInverse = new THREE.Matrix4().getInverse(selectionGroupWorld);
		const transformMatrix = new THREE.Matrix4().multiplyMatrices(selectionGroupWorldNew, oldMatrixInverse);

		const childLocal = new THREE.Matrix4();
		const childLocalNew = new THREE.Matrix4();
		const childWorldNew = new THREE.Matrix4();
		const parentWorldInverse = new THREE.Matrix4();

		for (const go of this.selectedGameObjects) {
			childLocal.multiplyMatrices(go.matrixWorld, oldMatrixInverse); // calculates go's matrix relative to selectiongroup
			childLocalNew.multiplyMatrices(transformMatrix, childLocal); // calculates go's new matrix with transformation matrix
			childWorldNew.multiplyMatrices(childLocalNew, selectionGroupWorld); // local to world transform

			// If there is no parent, the local matrix is the world matrix
			if (go.parent == null) {
				console.warn('Found GameObject without parent, this should never happen. Guid: ' + go.guid.toString());
				go.matrix = childWorldNew.clone();
			// If it has a parent, calculate the local matrix relative to it
			} else {
				parentWorldInverse.getInverse(go.parent.matrixWorld);
				go.matrix.multiplyMatrices(childWorldNew, parentWorldInverse);
			}
			go.matrixAutoUpdate = false;
			signals.objectChanged.emit(go, 'transform', go.transform);
		}
		// Save new matrix.
		this.transform = new LinearTransform().setFromMatrix(selectionGroupWorldNew);
	}

	private onObjectChanged(gameObject: GameObject) {
		if (this.selectedGameObjects.length === 0 || gameObject == null) {
			return;
		}
		if (gameObject.guid === this.selectedGameObjects[0].guid) {
			// this.setMatrix(gameObject.matrixWorld);
		}
	}

	public onMoveEnd() {
		const commands: SetTransformCommand[] = [];
		this.selectedGameObjects.forEach((go: GameObject) => {
			const command = new SetTransformCommand(new GameObjectTransferData({
				guid: go.guid,
				transform: go.transform
			}), go.transform);
			commands.push(command);
		});
		editor.execute(new BulkCommand(commands));
	}

	public setMatrix(matrix: THREE.Matrix4) {
		this.transform = new LinearTransform().setFromMatrix(matrix);
		matrix.decompose(this.position, this.quaternion, this.scale);
		this.updateMatrix();
		signals.selectionGroupChanged.emit(this, 'transform', this.transform);
	}

	public select(gameObject: GameObject, multiSelection: boolean, moveGizmo: boolean) {
		if (gameObject === null || gameObject === undefined) {
			return;
		}

		if (!multiSelection) {
			this.deselectAll();
		}

		// If first object move group to its position
		if (this.selectedGameObjects.length === 0 || moveGizmo) {
			this.setMatrix(gameObject.matrixWorld);
		}

		if (multiSelection) {
			// If object is already selected and its multiSelection deselect it.
			if (gameObject.selected) {
				this.deselect(gameObject);
				return;
			}
		}

		this.selectedGameObjects.push(gameObject);
		gameObject.onSelect();
	}

	private deselectAll() {
		for (const go of this.selectedGameObjects) {
			(go as GameObject).onDeselect();
		}
		this.selectedGameObjects = [];
	}

	// Find game object, deselect it and remove it from array.

	public deselect(gameObject: GameObject) {
		for (let i = 0; i < this.selectedGameObjects.length; i++) {
			if (this.selectedGameObjects[i].guid === gameObject.guid) {
				gameObject.onDeselect();
				this.selectedGameObjects.splice(i, 1);
				return;
			}
		}
	}

	public selectParent() {
		if (this.selectedGameObjects.length !== 1) {
			return;
		}

		const go = this.selectedGameObjects[0] as GameObject;
		if (go.parent != null && go.parent.constructor.name === 'GameObject') {
			this.select(go.parent as GameObject, false, true);
		}
	}

	public isSelected(go: GameObject) {
		return this.selectedGameObjects.includes(go);
	}
}
