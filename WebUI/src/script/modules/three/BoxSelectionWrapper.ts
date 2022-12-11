import { Camera, Scene, WebGLRenderer } from 'three';
import { GameObject } from '@/script/types/GameObject';
import { KEYCODE } from '@/script/types/Enums';
import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox';
import { SelectionHelper } from 'three/examples/jsm/interactive/SelectionHelper';
import InstanceManager from '@/script/modules/InstanceManager';

export default class BoxSelectionWrapper {
	private readonly selectionBox: SelectionBox;
	private readonly helper: SelectionHelper;
	private gizmoWasSelected = false;
	private boxSelectinInProgress = false;

	constructor(canvas: HTMLCanvasElement, scene: Scene, camera: Camera, renderer: WebGLRenderer) {
		this.selectionBox = new SelectionBox(camera, scene);
		this.helper = new SelectionHelper(renderer, 'selectBox');
		this.gizmoWasSelected = false;

		document.addEventListener('mousemove', this.onMouseMove.bind(this));
		document.addEventListener('mouseup', this.onMouseUp.bind(this));
	}

	public initBoxSelection(event: MouseEvent) {
		if (
			editor.threeManager.gizmoControls.selected ||
			window.editor.threeManager.inputControls.IsKeyDown(KEYCODE.ALT) ||
			window.editor.threeManager.isDragSpawning
		) {
			this.helper.isDown = false;
			this.gizmoWasSelected = true;
			this.helper.element.style.display = 'none';
			return;
		}
		this.boxSelectinInProgress = true;
		this.helper.element.style.display = 'inherit';

		this.selectionBox.startPoint.set(
			(event.clientX / window.innerWidth) * 2 - 1,
			-(event.clientY / window.innerHeight) * 2 + 1,
			0.5
		);
	}

	public onMouseMove(event: MouseEvent) {
		if (
			editor.threeManager.gizmoControls.selected ||
			window.editor.threeManager.inputControls.IsKeyDown(KEYCODE.ALT) ||
			window.editor.threeManager.isDragSpawning
		) {
			this.helper.isDown = false;
			this.gizmoWasSelected = true;
			this.boxSelectinInProgress = false;
			return;
		}

		if (!this.boxSelectinInProgress) return;

		if (!this.helper.isDown) return;

		editor.editorCore.unhighlight();

		this.selectionBox.endPoint.set(
			(event.clientX / window.innerWidth) * 2 - 1,
			-(event.clientY / window.innerHeight) * 2 + 1,
			0.5
		);

		// Temporarily set instanceMesh count to number of entities, so all can be selected
		const instanceManager = InstanceManager.getInstance();
		const oldCount = instanceManager.instancedMesh.count;
		instanceManager.instancedMesh.count = instanceManager.getNumberOfEntities() - 1;

		this.selectionBox.select();
		// Set count back to original value
		instanceManager.instancedMesh.count = oldCount;

		// @ts-ignore
		const ids = this.selectionBox.instances[instanceManager.instancedMesh.uuid];
		ids.forEach((instanceId: number) => {
			const gameObject = editor.editorCore.getGameObjectFromInstanceId(instanceId);

			if (!gameObject.isSelectableWithRaycast()) {
				return;
			}
			editor.editorCore.highlight(gameObject.guid, true);
		});
	}

	public onMouseUp(event: MouseEvent) {
		if (
			event.which !== 1 ||
			!this.boxSelectinInProgress ||
			editor.threeManager.gizmoControls.selected ||
			this.gizmoWasSelected ||
			window.editor.threeManager.inputControls.IsKeyDown(KEYCODE.ALT) ||
			window.editor.threeManager.isDragSpawning
		) {
			this.helper.isDown = false;
			this.gizmoWasSelected = false;
			this.boxSelectinInProgress = false;
			return;
		}

		this.selectionBox.endPoint.set(
			(event.clientX / window.innerWidth) * 2 - 1,
			-(event.clientY / window.innerHeight) * 2 + 1,
			0.5
		);

		const instanceManager = InstanceManager.getInstance();

		// @ts-ignore
		const ids = this.selectionBox.instances[instanceManager.instancedMesh.uuid];
		ids.forEach((entityIndex: number) => {
			const entity = editor.spatialGameEntities.get(instanceManager.getEntityId(entityIndex));
			if (entity) {
				const guid = (entity.parent as GameObject).guid;
				if (guid) {
					editor.Select(guid, true);
				}
			}
		});

		this.boxSelectinInProgress = false;
	}
}
