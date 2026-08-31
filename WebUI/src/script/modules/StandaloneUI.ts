/**
 * The standalone editor's own controls: pick a game and a level, and be able to look at it.
 *
 * In-game none of this exists -- the level is whatever the server is running and the engine drives
 * the camera. Standalone there is no server and no engine, so the browser has to offer both.
 *
 * Self-contained DOM rather than a Vue component on purpose: this is standalone-only furniture, and
 * keeping it out of the shared components means it cannot affect the in-game UI.
 */

import * as THREE from 'three';
import { WebXSource } from '@/script/modules/WebXSource';
import { GameObject } from '@/script/types/GameObject';

/** Games WebX publishes. Venice is BF3; the others are here because WebX serves them. */
const GAMES = ['Venice', 'Warsaw', 'Tunguska', 'Casablanca'];

export const DEFAULT_LEVEL = 'Levels/MP_001/MP_001';
export const DEFAULT_GAME = 'Venice';

/** What to load, from the URL, so a level is linkable and a reload keeps it. */
export function requestedLevel(): { game: string; level: string } {
	const params = new URLSearchParams(window.location.search);

	return {
		game: params.get('game') || DEFAULT_GAME,
		level: params.get('level') || DEFAULT_LEVEL
	};
}

export class StandaloneUI {
	private root: HTMLDivElement | null = null;
	private status: HTMLSpanElement | null = null;

	public mount(source: WebXSource, current: { game: string; level: string }): void {
		if (document.getElementById('standalone-bar') !== null) {
			return;
		}

		const bar = document.createElement('div');
		bar.id = 'standalone-bar';
		bar.setAttribute(
			'style',
			'position:fixed;top:46px;left:50%;transform:translateX(-50%);z-index:9999;' +
				'display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:6px;' +
				'background:rgba(24,28,36,0.95);border:1px solid #3a4354;color:#c8d2e0;' +
				'font:12px system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.45)'
		);

		const games = this.select(GAMES.map((g) => ({ value: g, label: g })), current.game);

		// Level roots only: Levels/<Map>/<Map>. Anything else in a level directory is a worldpart.
		const levels = source.levels();
		const options = levels.map((path) => ({ value: path, label: path.split('/')[1] }));
		const picker = this.select(options.length > 0 ? options : [{ value: current.level, label: current.level }],
			current.level);

		picker.style.minWidth = '170px';

		const load = document.createElement('button');
		load.textContent = 'Load';
		load.setAttribute(
			'style',
			'padding:3px 12px;border-radius:4px;border:1px solid #4a90d9;background:#2d6fb5;' +
				'color:#fff;cursor:pointer;font:12px system-ui,sans-serif'
		);
		load.onclick = () => {
			// A page load, not an in-place swap: the editor has no "unload level" path -- the
			// hierarchy tree, the scene and the selection would all keep the old level's objects.
			// Reloading is the honest way to get a clean state, and the URL makes it linkable.
			window.location.search = '?game=' + encodeURIComponent(games.value) + '&level=' + encodeURIComponent(picker.value);
		};

		const frame = document.createElement('button');
		frame.textContent = 'Frame level';
		frame.setAttribute(
			'style',
			'padding:3px 10px;border-radius:4px;border:1px solid #46506a;background:#2a3040;' +
				'color:#c8d2e0;cursor:pointer;font:12px system-ui,sans-serif'
		);
		frame.onclick = () => frameLevel();

		this.status = document.createElement('span');
		this.status.setAttribute('style', 'opacity:0.75;min-width:150px');
		this.status.textContent = 'loading…';

		bar.appendChild(this.label('Game'));
		bar.appendChild(games);
		bar.appendChild(this.label('Level'));
		bar.appendChild(picker);
		bar.appendChild(load);
		bar.appendChild(frame);
		bar.appendChild(this.status);

		document.body.appendChild(bar);
		this.root = bar;
	}

	public setStatus(text: string): void {
		if (this.status !== null) {
			this.status.textContent = text;
		}
	}

	public get mounted(): boolean {
		return this.root !== null;
	}

	private label(text: string): HTMLSpanElement {
		const el = document.createElement('span');
		el.textContent = text;
		el.setAttribute('style', 'opacity:0.6');

		return el;
	}

	private select(options: Array<{ value: string; label: string }>, selected: string): HTMLSelectElement {
		const el = document.createElement('select');
		el.setAttribute(
			'style',
			'background:#1b1f28;color:#c8d2e0;border:1px solid #3a4354;border-radius:4px;' +
				'padding:3px 6px;font:12px system-ui,sans-serif'
		);

		for (const option of options) {
			const node = document.createElement('option');
			node.value = option.value;
			node.textContent = option.label;
			el.appendChild(node);
		}

		el.value = selected;

		return el;
	}
}

/**
 * Point the camera at the level.
 *
 * Also the only way to see anything on first load: the editor's camera starts at (10,10,10) looking
 * at the origin, and a BF3 map sits nowhere near either.
 */
export function frameLevel(): boolean {
	const editor = (window as any).editor;

	if (editor === undefined || editor.gameObjects.size() === 0) {
		return false;
	}

	let sx = 0;
	let sy = 0;
	let sz = 0;
	let n = 0;
	let radius = 0;

	editor.gameObjects.forEach((_key: any, gameObject: any) => {
		sx += gameObject.position.x;
		sy += gameObject.position.y;
		sz += gameObject.position.z;
		n++;
	});

	const cx = sx / n;
	const cy = sy / n;
	const cz = sz / n;

	// The 80th percentile, not the maximum: a handful of far-flung objects (skybox props, out-of-
	// bounds markers) sit hundreds of metres from the playable area, and framing to include them
	// puts the actual map on screen as a speck.
	const distances: number[] = [];

	editor.gameObjects.forEach((_key: any, gameObject: any) => {
		const dx = gameObject.position.x - cx;
		const dz = gameObject.position.z - cz;
		distances.push(Math.sqrt(dx * dx + dz * dz));
	});

	distances.sort((a, b) => a - b);
	radius = distances[Math.floor(distances.length * 0.8)] || 100;

	const distance = Math.max(50, radius * 1.25);
	const controls = editor.threeManager.cameraControls;

	if (controls !== undefined && controls.setLookAt !== undefined) {
		controls.setLookAt(cx + distance * 0.7, cy + distance * 0.55, cz + distance * 0.7, cx, cy, cz, true);
	} else {
		editor.threeManager.camera.position.set(cx + distance * 0.7, cy + distance * 0.55, cz + distance * 0.7);
		editor.threeManager.camera.lookAt(cx, cy, cz);
	}

	editor.threeManager.camera.far = Math.max(4000, distance * 8);
	editor.threeManager.camera.updateProjectionMatrix();
	editor.threeManager.setPendingRender();

	return true;
}

/**
 * Give the mouse control of the camera.
 *
 * In-game left and right drag are deliberately dead (CameraControlWrapper sets them to NONE): the
 * ENGINE owns the camera and the browser only mirrors it, so grabbing the mouse would fight the
 * game. Standalone nothing else drives the camera, so without this the viewport cannot be moved at
 * all -- only middle-drag truck responds.
 */
export function enableCameraControls(): void {
	const editor = (window as any).editor;
	const controls = editor === undefined ? undefined : editor.threeManager.cameraControls;

	if (controls === undefined || controls.mouseButtons === undefined) {
		return;
	}

	const CameraControls = controls.constructor as any;
	const action = CameraControls.ACTION;

	if (action !== undefined) {
		controls.mouseButtons.left = action.ROTATE;
		controls.mouseButtons.right = action.TRUCK;
		controls.mouseButtons.wheel = action.DOLLY;
	}

	// Nothing is listening on the other side, and every drag would post an event per frame.
	if (controls.enableVextCameraUpdates !== undefined) {
		controls.enableVextCameraUpdates(false);
	}

	controls.dollySpeed = 1.2;
	controls.truckSpeed = 3.0;
	controls.minDistance = 1;
	controls.maxDistance = 20000;
}


/**
 * Make clicking in the viewport select the object under the cursor.
 *
 * The editor picks by raycasting an InstancedMesh of the AABBs that the ext sends with every
 * object. Standalone there are no entities and so no AABBs, and every click resolved to nothing.
 * Here the geometry itself is the pick target: raycast the meshes, then walk up to the GameObject
 * that owns the one that was hit.
 *
 * Wrapped around the existing method rather than edited into THREEManager, to keep standalone-only
 * behaviour out of the shared renderer -- and it still falls through to the original, so nothing
 * is lost if AABBs ever do exist.
 */
export function enableMeshPicking(): void {
	const editor = (window as any).editor;
	const three = editor === undefined ? undefined : editor.threeManager;

	if (three === undefined || three.__standalonePicking === true) {
		return;
	}

	three.__standalonePicking = true;

	const raycaster = new THREE.Raycaster();
	const original = three.raycastSelection.bind(three);

	three.raycastSelection = async (mousePos: any) => {
		raycaster.setFromCamera(mousePos, three.camera);

		for (const hit of raycaster.intersectObjects(three.scene.children, true)) {
			let node: any = hit.object;

			while (node !== null && node !== undefined) {
				if (node instanceof GameObject && node.isSelectableWithRaycast()) {
					return node.guid;
				}

				node = node.parent;
			}
		}

		return original(mousePos);
	};
}
