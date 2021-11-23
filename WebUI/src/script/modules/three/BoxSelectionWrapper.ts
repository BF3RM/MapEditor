import { Camera, Scene, WebGLRenderer } from 'three';
import { GameObject } from '@/script/types/GameObject';
import { KEYCODE } from '@/script/types/Enums';
import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox';
import { SelectionHelper } from 'three/examples/jsm/interactive/SelectionHelper';
import InstanceManager from '@/script/modules/InstanceManager';

export default class BoxSelectionWrapper {
	constructor(canvas: HTMLCanvasElement, scene: Scene, camera: Camera, renderer: WebGLRenderer) {
		const selectionBox = new SelectionBox(camera, scene);
		const helper = new SelectionHelper(selectionBox, renderer, 'selectBox');

		let gizmoWasSelected = false;

		document.addEventListener('mousedown', function (event) {
			if (event.which !== 1 || !event.shiftKey || editor.threeManager.gizmoControls.selected || window.editor.threeManager.inputControls.IsKeyDown(KEYCODE.ALT) || window.editor.threeManager.isDragSpawning) {
				helper.isDown = false;
				gizmoWasSelected = true;
				helper.element.style.display = 'none';
				return;
			}

			helper.element.style.display = 'inherit';

			selectionBox.startPoint.set(
				(event.clientX / window.innerWidth) * 2 - 1,
				-(event.clientY / window.innerHeight) * 2 + 1,
				0.5);
		});

		document.addEventListener('mousemove', function (event) {
			if (editor.threeManager.gizmoControls.selected || window.editor.threeManager.inputControls.IsKeyDown(KEYCODE.ALT) || window.editor.threeManager.isDragSpawning) {
				helper.isDown = false;
				gizmoWasSelected = true;
				return;
			}
			if (helper.isDown) {
				editor.editorCore.unhighlight();

				selectionBox.endPoint.set(
					(event.clientX / window.innerWidth) * 2 - 1,
					-(event.clientY / window.innerHeight) * 2 + 1,
					0.5);
				const instanceManager = InstanceManager.getInstance();
				const oldCount = instanceManager.instancedMesh.count;
				instanceManager.instancedMesh.count = instanceManager.getNumberOfEntities() - 1;
				selectionBox.select();
				instanceManager.instancedMesh.count = oldCount;

				// @ts-ignore
				const ids = selectionBox.instances[instanceManager.instancedMesh.uuid];
				ids.forEach((entityIndex: number) => {
					const entity = editor.spatialGameEntities.get(instanceManager.getEntityId(entityIndex));
					if (entity) {
						const guid = (entity.parent as GameObject).guid;
						if (guid) {
							editor.editorCore.highlight(guid, true);
						}
					}
				});
			}
		});

		document.addEventListener('mouseup', function (event) {
			if (event.which !== 1 || editor.threeManager.gizmoControls.selected || gizmoWasSelected || window.editor.threeManager.inputControls.IsKeyDown(KEYCODE.ALT) || window.editor.threeManager.isDragSpawning) {
				helper.isDown = false;
				gizmoWasSelected = false;
				return;
			}
			selectionBox.endPoint.set(
				(event.clientX / window.innerWidth) * 2 - 1,
				-(event.clientY / window.innerHeight) * 2 + 1,
				0.5);

			const instanceManager = InstanceManager.getInstance();

			// @ts-ignore
			const ids = selectionBox.instances[instanceManager.instancedMesh.uuid];
			ids.forEach((entityIndex: number) => {
				const entity = editor.spatialGameEntities.get(instanceManager.getEntityId(entityIndex));
				if (entity) {
					const guid = (entity.parent as GameObject).guid;
					if (guid) {
						editor.Select(guid, true);
					}
				}
			});
		});
	}
}
