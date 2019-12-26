import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import * as THREE from 'three';
import { GameObject } from '@/script/types/GameObject';
import { WORLDSPACE } from '@/script/modules/THREEManager';
import { signals } from '@/script/modules/Signals';
import { LOGLEVEL } from '@/script/modules/Logger';

export default class GizmoWrapper extends TransformControls {
	public visible = false;

	private controlSelected = false;
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
		for (const guid of editor.selectedGameObjects) {
			signals.objectChanged.emit(guid);
		}
		console.log('update');
		editor.editorCore.RequestUpdate();
	}

	public onControlMouseUp() {
		this.controlSelected = false;
		editor.setUpdating(false);
		// Stop Moving
		for (const gameObject of editor.selectedGameObjects) {
			gameObject.onMoveEnd();
		}
	}

	public onControlMouseDown(e: any) {
		// Stop moving
		this.controlSelected = true;
		editor.Unhighlight();

		editor.setUpdating(true);
	}

	private onEditorReady() {
		this.setSpace(WORLDSPACE.local as string);
		editor.threeManager.AddToScene(this);
		editor.threeManager.AddToScene(this.placeholderObject);
	}
}
