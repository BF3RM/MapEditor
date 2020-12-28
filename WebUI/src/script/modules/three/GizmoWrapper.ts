import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import * as THREE from 'three';
import { signals } from '@/script/modules/Signals';
import { GIZMO_MODE, KEYCODE, WORLD_SPACE } from '@/script/types/Enums';

export default class GizmoWrapper extends TransformControls {
	public visible = false;
	public selected = false;
	public raycastPlacing = false;

	constructor(camera: THREE.PerspectiveCamera, element: HTMLCanvasElement, gizmoMode = GIZMO_MODE.select) {
		super(camera, element);
		this.setSize(0.8);

		this.addEventListener('change', this.onControlChanged.bind(this));
		this.addEventListener('mouseUp', this.onControlMouseUp.bind(this));
		this.addEventListener('mouseDown', this.onControlMouseDown.bind(this));
		this.addEventListener('dragging-changed', (event) => {
			editor.threeManager.cameraControls.enabled = !event.value;
		});
		signals.editor.Ready.connect(this.onEditorReady.bind(this));
		signals.editor.Ready.connect(() => {
			editor.threeManager.setGizmoMode(gizmoMode);
		});
		this.enabled = false;
	}

	public onControlChanged() {
		if (!this.selected || !this.visible) return;
		// moving
		editor.selectionGroup.onClientOnlyMove();
		editor.editorCore.RequestUpdate();
	}

	public onControlMouseUp() {
		this.selected = false;
		if (!this.visible) return;
		console.log('Control deselected');
		console.log(this.matrixWorld);
		this.updateMatrixWorld();
		editor.setUpdating(false);
		if (this.raycastPlacing) {
			this.raycastPlacing = false;
			this.enabled = true;
		}
		editor.selectionGroup.onClientOnlyMoveEnd();
		console.log(this.matrixWorld);
	}

	public onControlMouseDown(e: any) {
		if (!this.visible) return;
		// Stop moving
		this.selected = true;
		editor.setUpdating(true);
		if (this.axis === 'XYZ' && editor.threeManager.inputControls.IsKeyDown(KEYCODE.SHIFT)) {
			this.raycastPlacing = true;
			this.enabled = false;
			this.dragging = false;
		} else {
			this.raycastPlacing = false;
			this.enabled = true;
		}
	}

	public OnMouseMove(event: MouseEvent) {
		if (this.raycastPlacing) {
			const pos = editor.editorCore.screenToWorldTransform.trans;
			this.SetPosition(pos.x, pos.y, pos.z);
			editor.editorCore.RequestUpdate();
		}
	}

	public OnMouseUp(event: MouseEvent) {
		this.selected = false;
		if (this.raycastPlacing) {
			this.raycastPlacing = false;
			this.enabled = true;
			editor.selectionGroup.onClientOnlyMoveEnd();
		}
	}

	private onEditorReady() {
		this.setSpace(WORLD_SPACE.world as string);
		editor.threeManager.attachToScene(this);
		this.attach(editor.selectionGroup);
		this.visible = true;
	}

	public SetPosition(x:number, y:number, z:number) {
		editor.selectionGroup.setPosition(x, y, z);
	}
}
