import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import * as THREE from 'three';
import { GameObject } from '@/script/types/GameObject';
import { WORLD_SPACE } from '@/script/modules/THREEManager';
import { signals } from '@/script/modules/Signals';

export default class GizmoWrapper extends TransformControls {
	public visible = false;
	public selected = false;

	constructor(camera: THREE.PerspectiveCamera, element: HTMLCanvasElement) {
		super(camera, element);
		this.matrixAutoUpdate = true;
		this.addEventListener('change', this.onControlChanged.bind(this));
		this.addEventListener('mouseUp', this.onControlMouseUp.bind(this));
		this.addEventListener('mouseDown', this.onControlMouseDown.bind(this));
		this.addEventListener('dragging-changed', (event) => {
			editor.threeManager.cameraControls.enabled = !event.value;
		});
		signals.editor.Ready.connect(this.onEditorReady.bind(this));
	}

	public onControlChanged() {
		if (!this.visible) return;
		// moving
		editor.selectionGroup.onClientOnlyMove();
		editor.editorCore.RequestUpdate();
	}

	public onControlMouseUp() {
		if (!this.visible) return;
		this.selected = false;
		editor.setUpdating(false);
		editor.selectionGroup.onClientOnlyMoveEnd();
	}

	public onControlMouseDown(e: any) {
		if (!this.visible) return;
		// Stop moving
		this.selected = true;
		editor.setUpdating(true);
	}

	private onEditorReady() {
		this.setSpace(WORLD_SPACE.local as string);
		editor.threeManager.attachToScene(this);
		this.attach(editor.selectionGroup);
		this.visible = true;
	}
}
