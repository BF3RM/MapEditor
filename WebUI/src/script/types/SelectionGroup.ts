import { GameObject } from '@/script/types/GameObject';
import { Guid } from '@/script/types/Guid';
import * as THREE from 'three';

export class SelectionGroup extends GameObject {
	public selectedGameObjects: GameObject[] = [];
	constructor() {
		super();

		const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
		const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
		const cube = new THREE.Mesh(geometry, material);
		this.add(cube); // Temporary, just to see where the selection group is

		this.guid = Guid.create();
		this.type = 'SelectionGroup';
		this.name = 'Selection Group';
		this.visible = true;
	}

	public select(gameObject: GameObject, multiSelection: boolean) {
		if (gameObject === null || gameObject === undefined) {
			return;
		}

		// If first object move group to its position
		if (this.selectedGameObjects.length === 0) {
			this.setTransform(gameObject.transform);
			console.log('first object');
		}

		if (multiSelection) {
			// If object is already selected and its multiSelection deselect it.
			if (gameObject.selected) {
				this.deselect(gameObject);
				return;
			}
		} else {
			// Deselect all selected GameObjects.
			for (const go of this.selectedGameObjects) {
				(go as GameObject).onDeselect();
			}
			this.selectedGameObjects = [];
		}

		this.selectedGameObjects.push(gameObject);
		gameObject.onSelect();
	}

	/**
	 * Find game object, deselect it and remove it from array.
	 * */

	public deselect(gameObject: GameObject) {
		for (let i = 0; i < this.selectedGameObjects.length; i++) {
			if (this.selectedGameObjects[i].guid === gameObject.guid) {
				gameObject.onDeselect();
				this.selectedGameObjects.splice(i, 1);
				return;
			}
		}
	}
}
