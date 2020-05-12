import { GameObject } from '@/script/types/GameObject';
import * as THREE from 'three';
import { signals } from '@/script/modules/Signals';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { SetTransformCommand } from '@/script/commands/SetTransformCommand';
import BulkCommand from '@/script/commands/BulkCommand';

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

	public onClientOnlyMove() {
		// Calculate the matrices of the selected objects.
		this.updateSelectedGameObjects();
		signals.selectionGroupChanged.emit(this, 'transform', this.transform);
	}

	public onClientOnlyMoveEnd() {
		// Only one object selected
		if (this.selectedGameObjects.length === 1) {
			const gameObject = this.selectedGameObjects[0];
			const transform = new LinearTransform().setFromMatrix(gameObject.matrixWorld);
			const command = new SetTransformCommand(new GameObjectTransferData({
				guid: gameObject.guid,
				transform: gameObject.transform
			}), transform);
			editor.execute(command);
			return;
		}

		const commands = [];

		for (const gameObject of this.selectedGameObjects) {
			if (!gameObject.hasMoved()) {
				return; // No position change
			}
			// this.updateMatrixWorld(true);
			const transform = new LinearTransform().setFromMatrix(gameObject.matrixWorld);
			const command = new SetTransformCommand(new GameObjectTransferData({
				guid: gameObject.guid,
				transform: gameObject.transform
			}), transform);
			commands.push(command);
		}

		if (commands.length === 0) {
			return;
		}

		editor.execute(new BulkCommand(commands));
	}

	/**
	 * Moves all selected objects relative to the selection group. As SelectionGroup doesn't add the selected objects as
	 * children, we have to manually calculate their new matrices. First we calc the SelectionGroup's transformation
	 * matrix with the new and old SelectionGroup's matrices. Then we calc each GameObject transform relative to SelectionGroup
	 * so we can now apply the transformation matrix to get their new matrices.
	 */
	public updateSelectedGameObjects() {
		const selectionGroupWorld = this.transform.toMatrix();
		const selectionGroupWorldNew = this.matrixWorld;
		// Ignore if it hasn't moved.
		if (selectionGroupWorld.equals(selectionGroupWorldNew)) {
			this.transform = new LinearTransform().setFromMatrix(selectionGroupWorldNew);
			return;
		}
		const selectionOldMatrixInverse = new THREE.Matrix4().getInverse(selectionGroupWorld);
		const transformMatrix = new THREE.Matrix4().multiplyMatrices(selectionGroupWorldNew, selectionOldMatrixInverse);
		const childLocal = new THREE.Matrix4();
		const childLocalNew = new THREE.Matrix4();
		const childWorldNew = new THREE.Matrix4();

		for (const go of this.selectedGameObjects) {
			childLocal.multiplyMatrices(go.matrixWorld, selectionOldMatrixInverse); // calculates go's matrix relative to selection group
			childLocalNew.multiplyMatrices(transformMatrix, childLocal); // calculates go's new matrix with transformation matrix
			childWorldNew.multiplyMatrices(childLocalNew, selectionGroupWorld); // local to world transform
			go.setWorldMatrix(childWorldNew);
			// Matrix is recalculated on render, we call the signal in the next frame.
			editor.threeManager.nextFrame(() => signals.objectChanged.emit(go, 'transform', go.transform));
		}
		// Save new matrix.
		this.transform = new LinearTransform().setFromMatrix(selectionGroupWorldNew);
	}

	public setMatrix(matrix: THREE.Matrix4) {
		this.transform = new LinearTransform().setFromMatrix(matrix);
		matrix.decompose(this.position, this.quaternion, this.scale);
		this.updateMatrix();
		editor.threeManager.nextFrame(() => signals.selectionGroupChanged.emit(this, 'transform', this.transform));
	}

	public select(gameObject: GameObject, multiSelection: boolean, moveGizmo: boolean) {
		if (!gameObject) {
			return;
		}

		if (!multiSelection) {
			this.deselectAll();
		}

		if (multiSelection) {
			// If object is already selected and its multiSelection deselect it.
			if (gameObject.selected) {
				// Edge case:
				// Can't deselect a child of a GameObject that is currently selected.
				if (!this.isSelected(gameObject)) {
					// TODO: Maybe add a ui console message?
					return;
				}

				this.deselect(gameObject);
				return;
			}
			// Edge case:
			// Selecting a parent of a selected object(s) should deselect that/those object(s) first.
			if (this.selectedGameObjects.length > 0 && gameObject.children.length > 0) {
				// Find out if each selected objects are descendants of the new object.
				for (const selectedGo of this.selectedGameObjects) {
					if ((selectedGo as GameObject).descendantOf(gameObject)) {
						this.deselect(selectedGo);
					}
				}
			}
		}

		// If first object move group to its position
		if (this.selectedGameObjects.length === 0 || moveGizmo) {
			this.setMatrix(gameObject.matrixWorld);
		}
		this.selectedGameObjects.push(gameObject);
		gameObject.onSelect();
		this.makeParentsVisible();
	}

	public deselectAll() {
		for (const go of this.selectedGameObjects) {
			(go as GameObject).onDeselect();
		}

		this.makeParentsInvisible();
		this.selectedGameObjects = [];
	}

	// Find game object, deselect it and remove it from array.
	public deselect(gameObject: GameObject) {
		const index = this.selectedGameObjects.findIndex((go) => go.guid === gameObject.guid);
		console.log(index);
		if (index === -1) return;
		gameObject.onDeselect();
		this.makeParentsInvisible();
		this.selectedGameObjects.splice(index, 1);
		this.makeParentsVisible();
	}

	private makeParentsInvisible() {
		for (const go of this.selectedGameObjects) {
			go.makeParentsInvisible();
		}
	}

	private makeParentsVisible() {
		for (const go of this.selectedGameObjects) {
			go.makeParentsVisible();
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
