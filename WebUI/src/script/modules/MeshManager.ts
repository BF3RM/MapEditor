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
import { DDSLoader } from 'three/examples/jsm/loaders/DDSLoader';
import { signals } from '@/script/modules/Signals';
import { GameObject } from '@/script/types/GameObject';
import { CommandActionResult } from '@/script/types/CommandActionResult';

interface MeshManifest {
	game: string;
	level: string;
	blueprints: Record<string, string>;
	/** file -> the mesh resource it was extracted from. */
	meshes?: Record<string, string>;
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

	/**
	 * mesh resource -> its subsets' texture bindings.
	 *
	 * A MeshMaterial in a mesh's own partition names a shader but carries no textures; Frostbite
	 * binds them in the level's MeshVariationDatabase, one entry per mesh and one material per
	 * subset. Rime reads that (dump_mesh_textures) and the server serves it per level.
	 */
	private textures: Record<string, Array<Record<string, string>>> = {};

	private ddsLoader = new DDSLoader();

	/**
	 * Meshes the engine never draws.
	 *
	 * Collision hulls, lighting volumes and occluders exist for the engine, not the eye -- the game
	 * shows none of them. They also carry no texture, so drawing them put big white boxes through
	 * the middle of a level that is otherwise faithful. Hiding them is what matches the game.
	 */
	private static readonly INVISIBLE = /invisiblecollision|charactercollision|_collision|lightpoly|_dimmer|occluder|volumemesh/i;

	/** One load per texture resource, shared by every material using it. */
	private loadedTextures = new Map<string, Promise<THREE.Texture | null>>();

	/** Textured materials, keyed by texture resource, so meshes sharing one share the material. */
	private materials = new Map<string, THREE.Material>();

	/** file -> its subsets, so a later pass can paint what was not ready the first time. */
	private painted = new Map<string, any[]>();

	private attached = 0;
	private missing = 0;
	private hidden = 0;

	/** file|x|y|z of everything already placed, so the baked statics can skip duplicates. */
	private placed = new Set<string>();

	/** Objects still waiting on geometry that was not extracted yet. */
	private pending = new Map<any, string>();

	/** file -> the mesh resource it came from. A file name cannot be turned back into a path:
	 * '/' became '_' and mesh names contain underscores of their own. */
	private meshKeys = new Map<string, string>();

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

			for (const [file, mesh] of Object.entries(this.manifest.meshes || {})) {
				this.meshKeys.set(file, mesh);
			}
		} catch (e) {
			return false;
		}

		// THREE is the renderer now, so objects must stay visible rather than only while selected.
		GameObject.renderGeometry = true;

		(window as any).editor.gameObjects.forEach((_k: any, go: any) => {
			go.visible = true;
		});

		await this.loadTextureMap();
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

	/** The level's mesh -> texture bindings. Missing is fine: everything renders untextured. */
	private async loadTextureMap(): Promise<void> {
		try {
			const response = await fetch(this.base + '/textures/' + this.level + '.json');

			if (response.ok) {
				this.textures = ((await response.json()) as any).meshes || {};
			}
		} catch (e) {
			this.textures = {};
		}
	}

	/** The diffuse texture for one subset, whatever the shader happens to call it. */
	private diffuseFor(meshPath: string, subset: number): string | null {
		const subsets = this.textures[meshPath.toLowerCase()];

		if (subsets === undefined || subsets.length === 0) {
			return null;
		}

		const bindings = subsets[Math.min(subset, subsets.length - 1)] || {};

		for (const name of ['Diffuse', 'MainDiffuse', 'TileDiffuse', 'ColorTexture', 'diffuseAtlas']) {
			if (bindings[name] !== undefined) {
				return bindings[name];
			}
		}

		return null;
	}

	private async texture(resource: string): Promise<THREE.Texture | null> {
		let pending = this.loadedTextures.get(resource);

		if (pending === undefined) {
			pending = new Promise<THREE.Texture | null>((resolve) => {
				// Served as DDS and handed straight to the GPU still compressed -- no decode step,
				// and a level's textures are hundreds of megabytes uncompressed.
				this.ddsLoader.load(
					this.base + '/texture/' + resource + '.dds',
					(map) => {
						map.wrapS = THREE.RepeatWrapping;
						map.wrapT = THREE.RepeatWrapping;
						(map as any).encoding = 3001; // sRGB: colour maps are authored in gamma space
						resolve(map);
					},
					undefined,
					() => resolve(null)
				);
			});

			this.loadedTextures.set(resource, pending);
		}

		return pending;
	}

	/** Swap in textured materials as they arrive, subset by subset. */
	private async paint(file: string, parts: any[]): Promise<void> {
		const meshPath = this.meshKeys.get(file);

		if (meshPath === undefined || parts.length === 0) {
			return;
		}

		for (let subset = 0; subset < parts.length; subset++) {
			const resource = this.diffuseFor(meshPath, subset);

			if (resource === null) {
				continue;
			}

			const material = await this.materialFor(resource);

			if (material !== this.material) {
				parts[subset].material = material;
				(window as any).editor.threeManager.setPendingRender();
			}
		}
	}

	private async materialFor(resource: string): Promise<THREE.Material> {
		const held = this.materials.get(resource);

		if (held !== undefined) {
			return held;
		}

		const map = await this.texture(resource);
		const material = map === null
			? this.material
			: new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0.0 });

		this.materials.set(resource, material);

		return material;
	}

	/** Teach the layer where a mesh's geometry lives, for objects not covered by the manifest. */
	public register(partitionGuid: string, file: string, meshPath?: string): void {
		if (meshPath !== undefined) {
			this.meshKeys.set(file, meshPath);
		}

		if (this.manifest === null) {
			this.manifest = { game: '', level: '', blueprints: {} };
		}

		const key = partitionGuid.toLowerCase();

		if (this.manifest.blueprints[key] === undefined) {
			this.manifest.blueprints[key] = file;
		}
	}

	public isPlaced(file: string, x: number, y: number, z: number): boolean {
		return this.placed.has(MeshManager.placementKey(file, x, y, z));
	}

	private static placementKey(file: string, x: number, y: number, z: number): string {
		// Tenth of a metre: the same instance resolved through two paths lands on the same spot,
		// and nothing distinct in a BF3 map shares a mesh AND a position this closely.
		return file + '|' + x.toFixed(1) + '|' + y.toFixed(1) + '|' + z.toFixed(1);
	}

	/**
	 * Re-try objects whose geometry was not ready. Returns how many were filled in.
	 *
	 * A level's meshes are extracted from the game one at a time, so the first pass over a big
	 * level asks for plenty that do not exist yet.
	 */
	public async retryPending(): Promise<number> {
		const waiting = Array.from(this.pending.entries());
		let filled = 0;

		for (const [gameObject, file] of waiting) {
			this.loaded.delete(file);

			const model = await this.instance(file);

			if (model === null) {
				continue;
			}

			gameObject.add(model);
			this.showInScene(gameObject);
			this.pending.delete(gameObject);
			this.attached++;
			filled++;
		}

		if (filled > 0) {
			(window as any).editor.threeManager.setPendingRender();
		}

		return filled;
	}

	public get pendingCount(): number {
		return this.pending.size;
	}

	/**
	 * Re-try textures that were not extracted yet.
	 *
	 * Geometry never waits for a texture, so the first paint of a level runs while most of them are
	 * still being extracted. Dropping the failed loads lets the next pass ask again.
	 */
	public repaint(): number {
		let retried = 0;

		for (const [resource, pending] of Array.from(this.loadedTextures.entries())) {
			void pending.then((map) => {
				if (map === null) {
					this.loadedTextures.delete(resource);
					this.materials.delete(resource);
				}
			});

			retried++;
		}

		for (const [file, parts] of Array.from(this.painted.entries())) {
			void this.paint(file, parts);
		}

		return retried;
	}

	public get stats(): { attached: number; missing: number; hidden: number; meshes: number } {
		return {
			attached: this.attached,
			missing: this.missing,
			hidden: this.hidden,
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

		if (file !== undefined && MeshManager.INVISIBLE.test(this.meshKeys.get(file) || file)) {
			this.hidden++;
			return;
		}

		if (file === undefined) {
			// Groups (worldparts, subworlds) and prefabs whose mesh sits deeper than a direct
			// Mesh field. Expected, and not worth a console line per object.
			this.missing++;
			return;
		}

		const position = commandActionResult.gameObjectTransferData.transform.trans;
		this.placed.add(MeshManager.placementKey(file, position.x, position.y, position.z));

		void this.instance(file).then((model) => {
			if (model === null) {
				// Its geometry was not ready yet. The server extracts a level's meshes in the
				// background, so ask again later rather than leaving the object bare forever.
				this.pending.set(gameObject, file);
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
		const parts: any[] = [];

		copy.traverse((child: any) => {
			if (child.isMesh) {
				parts.push(child);
			}
		});

		// Neutral material now, texture later.
		//
		// Textures are extracted from the game one at a time, so awaiting them here would hold the
		// geometry back behind every texture in the level -- one slow extraction stalled the whole
		// map at eight meshes. Geometry is never gated on them: the object appears, and its surface
		// improves when the texture turns up.
		for (const part of parts) {
			part.material = this.material;
		}

		this.painted.set(file, parts);
		void this.paint(file, parts);

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
