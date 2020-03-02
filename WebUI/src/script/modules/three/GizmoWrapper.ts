import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import * as THREE from 'three';
import { GameObject } from '@/script/types/GameObject';
import { WORLD_SPACE } from '@/script/modules/THREEManager';
import { signals } from '@/script/modules/Signals';

export default class GizmoWrapper extends TransformControls {
	public visible = false;
	public selected = false;

	private placeholderObject = new THREE.Object3D();
	constructor(camera: THREE.PerspectiveCamera, element: HTMLCanvasElement) {
		super(camera, element);
		this.addEventListener('change', this.onControlChanged.bind(this));
		this.addEventListener('mouseUp', this.onControlMouseUp.bind(this));
		this.addEventListener('mouseDown', this.onControlMouseDown.bind(this));
		this.addEventListener('dragging-changed', (event) => {
			editor.threeManager.cameraControls.enabled = !event.value;
		});
		signals.editor.Ready.connect(this.onEditorReady.bind(this));
	}

	public Select(gameObject: GameObject) {
		// TODO: Multiselection using PlaceholderGameobject
		this.attach(gameObject);
		this.visible = true;
	}

	public onControlChanged() {
		// moving
		for (const go of editor.selectedGameObjects) {
			signals.objectChanged.emit(go, 'transform', go.transform);
		}
		editor.editorCore.RequestUpdate();
	}

	public onControlMouseUp() {
		this.selected = false;
		editor.setUpdating(false);
		// Stop Moving
		for (const gameObject of editor.selectedGameObjects) {
			gameObject.onMoveEnd();
		}
	}

	public onControlMouseDown(e: any) {
		// Stop moving
		this.selected = true;
		editor.setUpdating(true);
	}

	private onEditorReady() {
		this.setSpace(WORLD_SPACE.local as string);
		editor.threeManager.attachToScene(this);
		editor.threeManager.attachToScene(this.placeholderObject);
	}
}
