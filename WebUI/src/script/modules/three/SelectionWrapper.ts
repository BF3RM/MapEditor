import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox';
import { SelectionHelper } from 'three/examples/jsm/interactive/SelectionHelper';
import { Camera, Scene, WebGLRenderer } from 'three';
import { SpatialGameEntity } from '@/script/types/SpatialGameEntity';
import { GameObject } from '@/script/types/GameObject';

export default class SelectionWrapper {
	constructor(canvas: HTMLCanvasElement, scene: Scene, camera: Camera, renderer: WebGLRenderer) {
		const selectionBox = new SelectionBox(camera, scene);
		const helper = new SelectionHelper(selectionBox, renderer, 'selectBox');

		canvas.addEventListener('mousedown', function (event) {
			if (editor.threeManager.gizmoControls.selected) {
				return;
			}
			for (const item of selectionBox.collection) {
				// item.material.emissive.set(0x000000);
			}

			selectionBox.startPoint.set(
				(event.clientX / window.innerWidth) * 2 - 1,
				-(event.clientY / window.innerHeight) * 2 + 1,
				0.5);
		});

		canvas.addEventListener('mousemove', function (event) {
			if (editor.threeManager.gizmoControls.selected) {
				helper.isDown = false;
				selectionBox.endPoint.set(
					(event.clientX / window.innerWidth) * 2 - 1,
					-(event.clientY / window.innerHeight) * 2 + 1,
					0.5);
				return;
			}
			if (helper.isDown) {
				for (let i = 0; i < selectionBox.collection.length; i++) {
					if (selectionBox.collection[i].type === 'SpatialGameEntity') {
						const guid = ((selectionBox.collection[i] as SpatialGameEntity).parent as GameObject).guid;
						if (guid) {
							editor.editorCore.unhighlight(guid);
						}
					}
					// selectionBox.collection[i].material.emissive.set(0x000000);
				}

				selectionBox.endPoint.set(
					(event.clientX / window.innerWidth) * 2 - 1,
					-(event.clientY / window.innerHeight) * 2 + 1,
					0.5);

				const allSelected = selectionBox.select();

				for (let i = 0; i < allSelected.length; i++) {
					if (selectionBox.collection[i].type === 'SpatialGameEntity') {
						const guid = ((selectionBox.collection[i] as SpatialGameEntity).parent as GameObject).guid;
						if (guid) {
							editor.editorCore.highlight(guid, true);
						}
					}
				}
			}
		});

		canvas.addEventListener('mouseup', function (event) {
			selectionBox.endPoint.set(
				(event.clientX / window.innerWidth) * 2 - 1,
				-(event.clientY / window.innerHeight) * 2 + 1,
				0.5);

			const allSelected = selectionBox.select();

			for (let i = 0; i < allSelected.length; i++) {
				if (selectionBox.collection[i].type === 'SpatialGameEntity') {
					const guid = ((selectionBox.collection[i] as SpatialGameEntity).parent as GameObject).guid;
					if (guid) {
						editor.Select(guid, true);
					}
				}
			}
		});
	}
}
