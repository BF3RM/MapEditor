import { GameObject } from '@/script/types/GameObject';
import { Guid } from '@/script/types/Guid';

export class SelectionGroup extends GameObject {
	public selectedGameObjects: GameObject[] = [];

	constructor() {
		super();
		this.guid = Guid.create();
		this.type = 'SelectionGroup';
		this.name = 'Selection Group';
	}

	public select(gameObject: GameObject, multiSelection: boolean) {
		if (gameObject === null || gameObject === undefined) {
			return;
		}

		// If first object move group to its position
		if (this.selectedGameObjects.length === 0) {
			console.log('first object');
		}

		if (multiSelection) {
			console.log('multi');
		} else {
			// Deselect all selected GameObjects.
			let aa: any;
			for (aa in this.selectedGameObjects) {
				aa.selected = false;
			}
			this.selectedGameObjects = [];

			this.selectedGameObjects.push(gameObject);
			gameObject.onSelect();
		}
		/*

		// If we are selecting an object already selected (single selection)
		if (gameObject.parent === editor.selectionGroup && !isMultiSelection && editor.selectionGroup.children.length === 1 && editor.selectionGroup.children[0] === gameObject) {
			return false;
		}

		// Clear selection group when it's a single selection
		if (!isMultiSelection && editor.selectionGroup.children.length !== 0) {
			for (let i = editor.selectionGroup.children.length - 1; i >= 0; i--) {
				editor.Deselect(editor.selectionGroup.children[i].guid);
			}
		}
		editor.threeManager.scene.attach(gameObject);
		if (editor.selectionGroup.children.length === 0) {
			editor.selectionGroup.setTransform(new LinearTransform().setFromMatrix(gameObject.matrixWorld));
		}
		editor.selectionGroup.AttachObject(gameObject);

		signals.selectedGameObject.emit(guid, isMultiSelection, scrollTo);

		editor.selectionGroup.Select();
		if (editor.selectionGroup.children.length !== 0) {
			editor.threeManager.showGizmo();
		}
		editor.threeManager.AttachGizmoTo(editor.selectionGroup);
		editor.threeManager.setPendingRender();
		*/
	}

	public deselect(gameObject: GameObject) {

	}
}
