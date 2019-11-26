import * as THREE from 'three';
import { GameObject } from '@/script/types/GameObject';
import { Guid } from 'guid-typescript';

export class HighlightGroup extends THREE.Group {
	public guid: Guid;

	constructor() {
		super();

		this.guid = Guid.create();
		this.name = 'Highlighting Group';
	}

	public HighlightObject(gameObject: GameObject) {
		if (gameObject.selected || gameObject.highlighted || gameObject.typeName === 'WorldPartData' || gameObject.typeName === 'LevelData') {
			return;
		}
		// console.log("Highlighting")

		this.UnhighlightCurrentObject();
		this.AttachObject(gameObject);
		gameObject.Highlight();
	}

	public UnhighlightCurrentObject() {
		const currentObject = this.GetHighlightedGameObject();
		if (currentObject) {
			// console.log("Unhighlighting")
			this.DetachObject(currentObject);
			currentObject.Unhighlight();
		}
	}

	public DetachObject(gameObject: GameObject) {
		if (gameObject.parent !== this) {
			console.error('Tried to detach a children that is no longer in this group');
		}
		editor.threeManager.scene.attach(gameObject);

		// remove child from parent and add it to scene
		if (!gameObject.parentData.guid && gameObject.parentData.typeName !== 'LevelData') {
			const parent = editor.getGameObjectByGuid(gameObject.parentData.guid);
			if (parent !== null && parent !== undefined) {
				parent.attach(gameObject);
			} else {
				editor.threeManager.scene.remove(gameObject);
				console.error('Object parent doesn\'t exist.');
			}
		} else {
			editor.threeManager.scene.remove(gameObject);
		}

		editor.threeManager.Render(); // REMOVE
	}

	public AttachObject(gameObject: GameObject) {
		// don't do anything if the target group it the object group already
		if (gameObject.parent === this) {
			console.log('Object already in highlightGroup');
			return;
		}

		if (this.children.length > 0) {
			console.error('Tried to attach an object to highlightGroup while it already has an object highlighted');
		}

		if (gameObject.parent === null) {
			editor.threeManager.scene.add(gameObject);
		} else {
			// remove child from parent and add it to scene
			editor.threeManager.scene.attach(gameObject);
		}

		// remove child from scene and add it to parent
		this.attach(gameObject);

		editor.threeManager.Render(); // REMOVE
	}

	public GetHighlightedGameObject(): GameObject | null {
		return this.children[0] as GameObject;
	}
}
