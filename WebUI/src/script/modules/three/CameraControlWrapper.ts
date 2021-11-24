import CameraControls from 'camera-controls';
import * as THREE from 'three';
import { ILinearTransform, LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Vec3 } from '@/script/types/primitives/Vec3';

CameraControls.install({ THREE });

export default class CameraControlWrapper extends CameraControls {
	private waitingForControlEnd = false;
	private updatingCamera = false;

	constructor(camera: THREE.PerspectiveCamera, element: HTMLCanvasElement) {
		super(camera, element);

		this.mouseButtons.left = CameraControls.ACTION.NONE;
		this.mouseButtons.right = CameraControls.ACTION.NONE;
		this.mouseButtons.middle = CameraControls.ACTION.TRUCK;

		this.addEventListener('controlstart', (event: any) => {
			window.vext.SendEvent('controlStart');
		});
		this.addEventListener('controlend', (event: any) => {
			this.waitingForControlEnd = true;
		});
		this.addEventListener('update', (event: any) => {
			if (!this.updatingCamera) {
				// lx, ly, lz, ux, uy, uz, fx, fy, fz, x, y, z) {
				const transform = new LinearTransform().setFromMatrix(event.target._camera.matrixWorld);
				window.vext.SendEvent('controlUpdate', {
					transform
				});
			}
		});

		this.setPosition(10, 10, 10);
		this.setLookAt(10, 10, 10, 0, 0, 0, false);
	}

	public updateCameraTransform(transform: ILinearTransform) {
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
