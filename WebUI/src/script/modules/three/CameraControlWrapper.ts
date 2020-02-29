import CameraControls from 'camera-controls';
import * as THREE from 'three';
import { IJSONLinearTransform, LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Vec3 } from '@/script/types/primitives/Vec3';

CameraControls.install({ THREE });

export default class CameraControlWrapper extends CameraControls {
	private waitingForControlEnd = false;
	private updatingCamera = false;

	constructor(camera: THREE.PerspectiveCamera, element: HTMLCanvasElement) {
		super(camera, element);

		this.mouseButtons.left = CameraControls.ACTION.ROTATE;
		this.mouseButtons.right = CameraControls.ACTION.NONE;
		this.mouseButtons.middle = CameraControls.ACTION.TRUCK;

		this.addEventListener('controlstart', (event: any) => {
			editor.vext.SendEvent('controlStart');
		});
		this.addEventListener('controlend', (event: any) => {
			this.waitingForControlEnd = true;
		});
		this.addEventListener('update', (event: any) => {
			if (!this.updatingCamera) {
				// lx, ly, lz, ux, uy, uz, fx, fy, fz, x, y, z) {
				const transform = new LinearTransform().setFromMatrix(event.target._camera.matrixWorld);
				editor.vext.SendEvent('controlUpdate', {
					transform
				});
			}
		});

		this.setPosition(10, 10, 10);
		this.setLookAt(10, 10, 10, 0, 0, 0, false);
	}

	// public UpdateCameraTransform(lx: number, ly: number, lz: number, ux: number, uy: number, uz: number, fx: number, fy: number, fz: number, x: number, y: number, z: number) {
	// 	this.updatingCamera = true;
	//
	// 	this.updatingCamera = true;
	// 	const m = new THREE.Matrix4();
	//
	// 	m.set(lx, ux, fx, 0,
	// 		ly, uy, fy, 0,
	// 		lz, uz, fz, 0,
	// 		0, 0, 0, 0);
	//
	// 	this._camera.setRotationFromMatrix(m);
	// 	this._camera.position.set(x, y, z);
	// 	const distance = 10;
	// 	const target = new Vec3(x + (fx * -1 * distance), y + (fy * -1 * distance), z + (fz * -1 * distance));
	//
	// 	this.setLookAt(x, y, z, target.x, target.y, target.z, false);
	// 	this.updatingCamera = false;
	// }

	public UpdateCameraTransform(transform: IJSONLinearTransform) {
		const linearTransform = LinearTransform.setFromTable(transform);
		const distance = 10;
		const target = new Vec3(
			linearTransform.trans.x + (linearTransform.forward.x * -1 * distance),
			linearTransform.trans.y + (linearTransform.forward.y * -1 * distance),
			linearTransform.trans.z + (linearTransform.forward.z * -1 * distance)
		);

		this.setLookAt(linearTransform.trans.x, linearTransform.trans.y, linearTransform.trans.z, target.x, target.y, target.z, false);
	}
}
