import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import * as THREE from 'three';
import { signals } from '@/script/modules/Signals';
import { WORLD_SPACE } from '@/script/types/Enums';

export default class GizmoWrapper extends TransformControls {
	public visible = false;
	public selected = false;
	public raycastPlacing = false;

	constructor(camera: THREE.PerspectiveCamera, element: HTMLCanvasElement) {
		super(camera, element);
		this.setSize(0.8);
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
		if (!this.selected || !this.visible) return;
		// moving
		editor.selectionGroup.onClientOnlyMove();
		editor.editorCore.RequestUpdate();
	}

	public onControlMouseUp() {
		if (!this.visible) return;
		this.selected = false;
		editor.setUpdating(false);
		editor.selectionGroup.onClientOnlyMoveEnd();
		if (this.raycastPlacing) {
			this.raycastPlacing = false;
			this.enabled = true;
		}
	}

	public onControlMouseDown(e: any) {
		if (!this.visible) return;
		// Stop moving
		this.selected = true;
		editor.setUpdating(true);
		if (this.axis === 'XYZ') {
			this.raycastPlacing = true;
			this.enabled = false;
		} else {
			this.raycastPlacing = false;
			this.enabled = true;
		}
	}

	public OnMouseMove(event: MouseEvent) {
		if (this.raycastPlacing) {
			console.log('Moving group to ' + editor.editorCore.screenToWorldTransform.trans.toString());
			const pos = editor.editorCore.screenToWorldTransform.trans;
			editor.selectionGroup.setPosition(pos.x, pos.y, pos.z);
			editor.selectionGroup.onClientOnlyMove();
			editor.editorCore.RequestUpdate();
		}
	}

	public OnMouseUp(event: MouseEvent) {
		if (this.raycastPlacing) {
			this.raycastPlacing = false;
			this.enabled = true;
		}
	}

	private onEditorReady() {
		this.setSpace(WORLD_SPACE.local as string);
		editor.threeManager.attachToScene(this);
		this.attach(editor.selectionGroup);
		this.visible = true;
	}
}
