/**
 * Draws real geometry for the standalone editor.
 *
 * EBX carries no geometry -- a blueprint only references a MeshSet resource, which lives in the
 * game's bundles. tools/meshes/export_level_meshes.py has Rime write those out as .glb and
 * produces a manifest resolving blueprint partition guid -> file, so the browser needs one small
 * fetch instead of opening every blueprint partition to find its mesh.
 *
 * In-game this does nothing: the engine renders the world and THREE only draws gizmos and
 * selection. Standalone there is nothing else to render with, so the objects go into the scene.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { signals } from '@/script/modules/Signals';
import { GameObject } from '@/script/types/GameObject';
import { CommandActionResult } from '@/script/types/CommandActionResult';

interface MeshManifest {
	game: string;
	level: string;
	blueprints: Record<string, string>;
}

export class MeshManager {
	private base: string;
	private manifest: MeshManifest | null = null;
	private loader = new GLTFLoader();

	/** One load per FILE, shared by every instance placing that mesh. */
	private loaded = new Map<string, Promise<THREE.Object3D | null>>();

	/**
	 * One material for the whole level.
	 *
	 * Rime's converter assigns each mesh subset a RANDOM colour, so straight from the .glb a level
	 * renders as neon confetti -- worse than useless for judging placement. The real materials need
	 * the texture pipeline, which is a separate job; until then a neutral surface reads like a
	 * greybox and shows form honestly. Shared, so 1500 draw calls do not build 1500 materials.
	 */
	private material = new THREE.MeshStandardMaterial({ color: 0x9fa3a6, roughness: 0.9, metalness: 0.0 });

	private attached = 0;
	private missing = 0;

	private level: string;

	public constructor(level: string, base = '/meshes') {
		// Manifests are named for the map, so several exported levels can live side by side.
		this.level = level.replace(/\/$/, '').split('/').pop() as string;
		this.base = base;
	}

	/** Returns false when no meshes have been exported, which is not an error -- the editor works
	 * without them, it just draws nothing. */
	public async start(): Promise<boolean> {
		try {
			const response = await fetch(this.base + '/' + this.level + '.json');

			if (!response.ok) {
				return false;
			}

			this.manifest = (await response.json()) as MeshManifest;
		} catch (e) {
			return false;
		}

		// THREE is the renderer now, so objects must stay visible rather than only while selected.
		GameObject.renderGeometry = true;

		(window as any).editor.gameObjects.forEach((_k: any, go: any) => {
			go.visible = true;
		});

		this.addLighting();
		signals.spawnedGameObject.connect(this.onSpawnedGameObject.bind(this));

		return true;
	}

	/**
	 * The editor's scene has no lights -- it never needed any, because in-game the engine draws the
	 * world and THREE only paints gizmos, which use unlit materials. Rime's meshes are PBR, so
	 * without this every one of them renders black on a dark background: geometry present, nothing
	 * visible.
	 */
	private addLighting(): void {
		const scene = (window as any).editor.threeManager.scene;

		if (scene.getObjectByName('standalone-lighting') !== undefined) {
			return;
		}

		const rig = new THREE.Group();
		rig.name = 'standalone-lighting';

		const sun = new THREE.DirectionalLight(0xfff4e6, 1.35);
		sun.position.set(0.6, 1, 0.4);

		rig.add(sun);
		rig.add(new THREE.HemisphereLight(0xbcd4f0, 0x3b3833, 0.75));

		scene.add(rig);
	}

	public get stats(): { attached: number; missing: number; meshes: number } {
		return {
			attached: this.attached,
			missing: this.missing,
			meshes: this.manifest === null ? 0 : Object.keys(this.manifest.blueprints).length
		};
	}

	private onSpawnedGameObject(commandActionResult: CommandActionResult): void {
		if (this.manifest === null) {
			return;
		}

		const guid = commandActionResult.gameObjectTransferData.guid;
		const gameObject = (window as any).editor.gameObjects.getValue(guid);

		if (gameObject === undefined || gameObject === null) {
			return;
		}

		const partitionGuid = commandActionResult.gameObjectTransferData.blueprintCtrRef.partitionGuid.toString();
		const file = this.manifest.blueprints[partitionGuid.toLowerCase()];

		if (file === undefined) {
			// Groups (worldparts, subworlds) and prefabs whose mesh sits deeper than a direct
			// Mesh field. Expected, and not worth a console line per object.
			this.missing++;
			return;
		}

		void this.instance(file).then((model) => {
			if (model === null) {
				return;
			}

			gameObject.add(model);
			this.showInScene(gameObject);
			this.attached++;
			(window as any).editor.threeManager.setPendingRender();
		});
	}

	/** A cloned copy of a mesh, loading the file at most once. */
	private async instance(file: string): Promise<THREE.Object3D | null> {
		let pending = this.loaded.get(file);

		if (pending === undefined) {
			pending = new Promise<THREE.Object3D | null>((resolve) => {
				this.loader.load(
					this.base + '/' + file,
					(gltf) => {
						// Rime writes positions and UVs but no normals, and a lit material with no
						// normals shades to black -- the level renders as silhouettes. Derive them
						// once per file, before any instance clones it.
						gltf.scene.traverse((child: any) => {
							if (child.isMesh && child.geometry && !child.geometry.attributes.normal) {
								child.geometry.computeVertexNormals();
							}
						});

						resolve(gltf.scene);
					},
					undefined,
					() => resolve(null)
				);
			});

			this.loaded.set(file, pending);
		}

		const original = await pending;

		if (original === null) {
			return null;
		}

		const copy = original.clone(true);

		copy.traverse((child: any) => {
			if (child.isMesh) {
				child.material = this.material;
			}
		});

		return copy;
	}

	/**
	 * Put the object's top-most ancestor in the scene.
	 *
	 * Children are already parented to their own GameObject (Editor does that as objects arrive),
	 * so adding the root is enough and adding each object would double-add every child.
	 */
	private showInScene(gameObject: THREE.Object3D): void {
		let root: THREE.Object3D = gameObject;

		while (root.parent !== null && root.parent !== undefined && (root.parent as any).isScene !== true) {
			root = root.parent;
		}

		if (root.parent === null || root.parent === undefined) {
			(window as any).editor.threeManager.scene.add(root);
		}
	}
}
