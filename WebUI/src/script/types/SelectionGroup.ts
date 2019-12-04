import { GameObject } from '@/script/types/GameObject';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Guid } from '@/script/types/Guid';
import { signals } from '@/script/modules/Signals';
import * as THREE from 'three';

export class SelectionGroup extends GameObject {
	public children: GameObject[];

	constructor(update: boolean = true) {
		super();

		this.guid = Guid.create();
		this.type = 'SelectionGroup';
		this.name = 'Selection Group';
		this.transform = new LinearTransform();
		this.children = [];

		// Update the matrix after initialization.
		if (update) {
			this.updateTransform();
		}
	}

	// We move the children but not the group, as it's not synced.

	public onMoveStart() {
		// console.log("move start");
	}

	public onMove() {
		// console.log("moving");
		const scope = this;
		if (!scope.hasMoved()) {
			return;
		}
		// scope.transform = new LinearTransform().setFromMatrix(scope.matrixWorld);

		scope.children.every((child) => child.onMove());
		signals.selectionGroupMoved.emit();
	}

	public onMoveEnd() {
		// console.log("move end");
		const scope = this;
		if (!scope.hasMoved()) {
			return; // No position change
		}
		scope.transform = new LinearTransform().setFromMatrix(scope.matrixWorld);

		scope.children.every((child) => child.onMoveEnd());

		signals.selectionGroupMoved.emit();
	}

	public hasMoved() {
		return !this.transform.toMatrix().equals(this.matrixWorld);
	}

	public setTransform(linearTransform: LinearTransform) {
		this.transform = linearTransform;
		this.updateTransform();
	}

	public updateTransform() {
		const matrix = new THREE.Matrix4();
		matrix.set(
			this.transform.left.x, this.transform.up.x, this.transform.forward.x, this.transform.trans.x,
			this.transform.left.y, this.transform.up.y, this.transform.forward.y, this.transform.trans.y,
			this.transform.left.z, this.transform.up.z, this.transform.forward.z, this.transform.trans.z,
			0, 0, 0, 1);

		// To move the group without moving the children we have to detach them first
		const temp = [];

		for (let i = this.children.length - 1; i >= 0; i--) {
			// TODO: matrix should be calculated here doing the average of all children's positions, maybe
			temp[i] = this.children[i];
			this.DetachObject(this.children[i]);
		}

		matrix.decompose(this.position, this.quaternion, this.scale);

		// window.editor.threeManager.Render();

		for (let i = temp.length - 1; i >= 0; i--) {
			this.AttachObject(temp[i]);
		}
		// window.editor.threeManager.Render();
	}

	public Select() {
		this.onSelected();
	}

	public Deselect() {
		this.onDeselected();
	}

	public onSelected() {
		for (let i = this.children.length - 1; i >= 0; i--) {
			this.children[i].Select();
		}
		this.Center();
	}

	public onDeselected() {
		for (let i = this.children.length - 1; i >= 0; i--) {
			this.children[i].Deselect();
		}
		this.Center();
	}

	public DetachObject(gameObject: GameObject) {
		if (gameObject.parent !== this) {
			console.error('Tried to detach a children that is no longer in this group');
		}
		// remove child from parent and add it to its parent
		if (gameObject.parentData.guid.equals(Guid.createEmpty()) && gameObject.parentData.typeName !== 'root') {
			const parent = editor.getGameObjectByGuid(gameObject.parentData.guid);
			if (parent != null) {
				parent.attach(gameObject);
			} else {
				console.error('Object parent doesn\'t exist');
			}
		}
	}

	public AttachObject(gameObject: GameObject) {
		// don't do anything if the target group it the object group already
		if (gameObject.parent === this) {
			return;
		}

		this.attach(gameObject);
	}

	public Center() {
		const temp = [];
		let x = 0;
		let z = 0;
		let y = 0;

		for (let i = this.children.length - 1; i >= 0; i--) {
			// TODO: matrix should be calculated here doing the average of all children's positions, maybe
			x += this.children[i].matrixWorld.elements[12];
			y += this.children[i].matrixWorld.elements[13];
			z += this.children[i].matrixWorld.elements[14];
		}

		x = x / (this.children.length);
		y = y / (this.children.length);
		z = z / (this.children.length);

		for (let i = this.children.length - 1; i >= 0; i--) {
			// TODO: matrix should be calculated here doing the average of all children's positions, maybe
			temp[i] = this.children[i];
			this.DetachObject(this.children[i]);
		}
		this.position.set(x, y, z);
		editor.threeManager.Render();

		for (let i = temp.length - 1; i >= 0; i--) {
			this.AttachObject(temp[i]);
		}
	}

	public DeselectObject(gameObject: GameObject) {
		if (gameObject.parent === this) {
			gameObject.Deselect();
			this.DetachObject(gameObject);
		}
		this.onDeselected();
	}
}
