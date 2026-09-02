import CameraControls from 'camera-controls';
import * as THREE from 'three';
import { ILinearTransform, LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Vec3 } from '@/script/types/primitives/Vec3';

CameraControls.install({ THREE });

/** Metres ahead of the camera to orbit about in standalone mode (see enableStandaloneMouse). */
const ORBIT_AHEAD = 12;

export default class CameraControlWrapper extends CameraControls {
	private updateVextCamera = true;

	/** Kept for standalone mode: the orbit point is derived from where the camera is looking. */
	private ownCamera: THREE.PerspectiveCamera;

	constructor(camera: THREE.PerspectiveCamera, element: HTMLCanvasElement) {
		super(camera, element);
		this.ownCamera = camera;

		this.mouseButtons.left = CameraControls.ACTION.NONE;
		this.mouseButtons.right = CameraControls.ACTION.NONE;
		this.mouseButtons.middle = CameraControls.ACTION.TRUCK;

		this.addEventListener('controlstart', (event: any) => {
			window.vext.SendEvent('controlStart');
		});

		this.addEventListener('update', (event: any) => {
			// If the camera is being controlled by webui, we update lua with its new position
			if (this.updateVextCamera) {
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

	public enableVextCameraUpdates(enable: boolean) {
		this.updateVextCamera = enable;
	}

	/**
	 * Drive the camera from the mouse, for the browser/emulator.
	 *
	 * In game the camera is authoritatively the Lua freecam: right-click hands over to it and it
	 * pushes transforms back through updateCameraTransform, which is why the library's own left
	 * and right actions are set to NONE in the constructor. Standalone there is no Lua, so that
	 * handoff goes nowhere and the camera cannot be moved at all.
	 *
	 * Right = orbit/look and left stays NONE so left-click keeps selecting objects.
	 */
	public enableStandaloneMouse() {
		// left stays NONE so left-drag is selection and box-select, not camera.
		this.mouseButtons.left = CameraControls.ACTION.NONE;
		this.mouseButtons.right = CameraControls.ACTION.ROTATE;
		this.mouseButtons.middle = CameraControls.ACTION.TRUCK;
		this.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
		this.updateVextCamera = false;
		this.enabled = true;

		// Orbit about a point just AHEAD of the camera, refreshed as each drag starts.
		//
		// ROTATE swings the camera around its target, and the target is wherever it was last set --
		// the origin at boot. On a 1km level that means right-drag hurls the camera around a point
		// hundreds of metres away and reads as "the camera is broken" rather than "I am looking
		// around". Re-anchoring per drag makes it behave like a look control.
		this.addEventListener('controlstart', () => {
			const s_Dir = new THREE.Vector3();
			this.ownCamera.getWorldDirection(s_Dir);
			const s_Pos = this.ownCamera.position;
			this.setOrbitPoint(
				s_Pos.x + s_Dir.x * ORBIT_AHEAD,
				s_Pos.y + s_Dir.y * ORBIT_AHEAD,
				s_Pos.z + s_Dir.z * ORBIT_AHEAD
			);
		});
	}

	public updateCameraTransform(transform: ILinearTransform) {
		const linearTransform = LinearTransform.setFromTable(transform);
		const distance = 10;
		const target = new Vec3(
			linearTransform.trans.x + linearTransform.forward.x * -1 * distance,
			linearTransform.trans.y + linearTransform.forward.y * -1 * distance,
			linearTransform.trans.z + linearTransform.forward.z * -1 * distance
		);

		this.setLookAt(
			linearTransform.trans.x,
			linearTransform.trans.y,
			linearTransform.trans.z,
			target.x,
			target.y,
			target.z,
			false
		);
	}
}
