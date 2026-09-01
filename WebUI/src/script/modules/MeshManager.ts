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

/** A blueprint's geometry: one entry per part, with where it sits inside the prefab. */
interface MeshPart {
	file: string;
	transform?: number[];
}

interface MeshManifest {
	game: string;
	level: string;
	blueprints: Record<string, MeshPart[]>;
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
	/** mesh -> variation hash -> its subsets' bindings. '0' is the base appearance. */
	private textures: Record<string, Record<string, Array<Record<string, string>>>> = {};

	private ddsLoader = new DDSLoader();
	private pngLoader = new THREE.TextureLoader();

	/**
	 * Collision hulls, lighting volumes, occluders and effect meshes.
	 *
	 * Collision hulls, lighting volumes and occluders exist for the engine, not the eye -- the game
	 * shows none of them. FX meshes are the same case from the other direction: they are particle
	 * emitters (rain mist, fire, damage states), drawn by the effect system and not as geometry, so
	 * nothing exports them -- every one was a guaranteed 404 ("mesh not available") and they are
	 * the bulk of the network noise on a level load. They also carry no texture, so drawing them put big white boxes through
	 * the middle of a level that is otherwise faithful. Hiding them is what matches the game.
	 */
	public static readonly VOLUME =
		/invisiblecollision|charactercollision|_collision|lightpoly|_dimmer|occluder|volumemesh|^fx\/|^fx_/i;

	/** One load per texture resource, shared by every material using it. */
	private loadedTextures = new Map<string, Promise<THREE.Texture | null>>();
	private dx10 = new Map<string, Promise<boolean>>();

	/** Textured materials, keyed by texture resource, so meshes sharing one share the material. */
	private materials = new Map<string, THREE.Material>();

	/** Objects whose geometry is drawn by an instanced batch rather than cloned here. */
	private instanced = new Set<string>();

	/** file -> EVERY copy's subsets. A repaint has to reach each one: a clone copies the material
	 * reference it finds at the moment it is made, so copies taken before a texture arrived are not
	 * fixed by painting the original again. */
	private painted = new Map<string, any[][]>();

	private attached = 0;
	private missing = 0;
	/** Volumes and collision hulls: drawn, but counted so their share is visible. */
	private volumes = 0;

	/** file|x|y|z of everything already placed, so the baked statics can skip duplicates. */
	private placed = new Set<string>();

	/** Objects still waiting on geometry that was not extracted yet. */
	private pending = new Map<any, MeshPart[]>();

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

	/** A named map for one subset, whatever the shader happens to call it. */
	private textureFor(meshPath: string, subset: number, names: string[]): string | null {
		const variations = this.textures[meshPath.toLowerCase()];

		if (variations === undefined) {
			return null;
		}

		// The base appearance, or whatever the mesh does have if it ships none.
		const subsets = variations['0'] || Object.values(variations)[0];

		if (subsets === undefined || subsets.length === 0) {
			return null;
		}

		const bindings = subsets[Math.min(subset, subsets.length - 1)] || {};

		for (const name of names) {
			if (bindings[name] !== undefined) {
				return bindings[name];
			}
		}

		// Fall back to another subset's texture rather than leaving this one bare.
		//
		// A mesh's subsets do not each carry a full set: me_house01_large_destruction has five
		// materials and ONE diffuse between them, so four of its surfaces came out plain grey --
		// a white building in the middle of a textured street. Borrowing from a sibling subset is
		// wrong in detail and much closer than no texture at all.
		for (const other of subsets) {
			for (const name of names) {
				if (other !== undefined && other[name] !== undefined) {
					return other[name];
				}
			}
		}

		return null;
	}

	/** The diffuse texture for one subset, whatever the shader happens to call it. */
	private diffuseFor(meshPath: string, subset: number): string | null {
		return this.textureFor(meshPath, subset,
			['Diffuse', 'MainDiffuse', 'TileDiffuse', 'ColorTexture', 'diffuseAtlas']);
	}

	/** A level texture by resource path, for callers outside the mesh pipeline (the sky). */
	public load(resource: string): Promise<THREE.Texture | null> {
		return this.texture(resource);
	}

	private async texture(resource: string, colour = true): Promise<THREE.Texture | null> {
		let pending = this.loadedTextures.get(resource);

		if (pending === undefined) {
			pending = new Promise<THREE.Texture | null>((resolve) => {
				// Served as DDS and handed straight to the GPU still compressed -- no decode step,
				// and a level's textures are hundreds of megabytes uncompressed.
				this.ddsLoader.load(
					this.base + '/texture/' + resource + '.dds',
					(map) => {
						// A format the loader cannot decode (BF3's normal maps are BC5) still comes
						// back as a texture, just with no image behind it -- and handing that to the
						// GPU throws inside uploadTexture and takes the whole render down. Only
						// accept one that actually carries pixels.
						const mipmaps = (map as any).mipmaps;

						if (!Array.isArray(mipmaps) || mipmaps.length === 0 ||
							!mipmaps[0] || !mipmaps[0].width) {
							resolve(null);
							return;
						}

						map.wrapS = THREE.RepeatWrapping;
						map.wrapT = THREE.RepeatWrapping;
						// sRGB for colour maps only; a normal map holds vectors, not colour, and
						// gamma-correcting it bends the lighting.
						if (colour) {
							(map as any).encoding = 3001;
						}
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
	private track(file: string, parts: any[]): void {
		const copies = this.painted.get(file);

		if (copies === undefined) {
			this.painted.set(file, [parts]);
		} else {
			copies.push(parts);
		}
	}

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

			const normal = this.textureFor(meshPath, subset,
				['Normal', 'MainNormal', 'TileNormal', 'Normalmap', 'NormalMap', 'TileNormalTexCoord1']);
			const material = await this.materialFor(resource, normal);

			if (material !== this.material) {
				parts[subset].material = material;
				(window as any).editor.threeManager.setPendingRender();
			}
		}
	}

	/**
	 * A normal map.
	 *
	 * Most are plain DXT and load straight off the DDS. The rest are BC5 inside a DX10-header DDS,
	 * which the DDS loader handles in neither respect, so the server decodes those to PNG.
	 */
	private async normal(resource: string): Promise<THREE.Texture | null> {
		// Plain DXT loads straight off the DDS -- vectors, not colour, so no sRGB. Asking the DDS
		// loader to try a BC5 one instead would work by falling through, but it complains to the
		// console for every miss, so read the four-CC first and route on it.
		if (!await this.isDx10(resource)) {
			const direct = await this.texture(resource, false);

			if (direct !== null) {
				return direct;
			}
		}

		const key = 'normal:' + resource;
		let pending = this.loadedTextures.get(key);

		if (pending === undefined) {
			pending = new Promise<THREE.Texture | null>((resolve) => {
				this.pngLoader.load(
					this.base + '/normal/' + resource + '.png',
					(map) => {
						map.wrapS = THREE.RepeatWrapping;
						map.wrapT = THREE.RepeatWrapping;
						resolve(map);
					},
					undefined,
					() => resolve(null)
				);
			});

			this.loadedTextures.set(key, pending);
		}

		return pending;
	}

	/** Whether a DDS carries a DX10 header, whose BC5 payload the loader cannot read. */
	private async isDx10(resource: string): Promise<boolean> {
		let pending = this.dx10.get(resource);

		if (pending === undefined) {
			pending = (async () => {
				try {
					// Range-served if the server supports it, whole file if not; either way the
					// four-CC sits at byte 84 and the body is discarded.
					const response = await fetch(this.base + '/texture/' + resource + '.dds',
						{ headers: { Range: 'bytes=0-127' } });

					if (!response.ok) {
						return true;
					}

					const bytes = new Uint8Array(await response.arrayBuffer());

					if (bytes.length < 88) {
						return true;
					}

					return String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]) === 'DX10';
				} catch (e) {
					// Unknown: let the server's PNG path answer for it.
					return true;
				}
			})();

			this.dx10.set(resource, pending);
		}

		return pending;
	}

	private async materialFor(resource: string, normalResource: string | null = null): Promise<THREE.Material> {
		const key = resource + '|' + (normalResource || '');
		const held = this.materials.get(key);

		if (held !== undefined) {
			return held;
		}

		const map = await this.texture(resource);

		if (map === null) {
			this.materials.set(key, this.material);
			return this.material;
		}

		// Alpha-tested where the texture carries alpha.
		//
		// BF3 masks foliage, fences and decals in the diffuse's alpha channel, so without this a
		// leaf card renders as a solid rectangle -- which is why the trees read as black blobs.
		// The compressed format says whether there is an alpha channel at all: DXT1 has none unless
		// it is the 1-bit variant, DXT5 always does. Testing at 0.5 is a no-op on a texture whose
		// alpha is solid, so this is safe to apply wherever alpha exists.
		const format = (map as any).format;
		const hasAlpha = format === 33777 || format === 33779; // RGBA_S3TC_DXT1 / DXT5

		// The normal map is a bonus, not a requirement: BF3 stores some of them in formats the DDS
		// loader will not take, and a missing one only costs surface detail.
		const normalMap = normalResource === null ? null : await this.normal(normalResource);
		const material = new THREE.MeshStandardMaterial({
			map,
			roughness: 0.95,
			metalness: 0.0,
			alphaTest: hasAlpha ? 0.5 : 0,
			// A masked card is meant to be seen from both sides.
			side: hasAlpha ? THREE.DoubleSide : THREE.FrontSide
		});

		if (normalMap !== null) {
			material.normalMap = normalMap;
		}

		this.materials.set(key, material);

		return material;
	}

	/** Material for surfaces with no texture of their own, such as the terrain. */
	public get groundMaterial(): THREE.Material {
		return this.material;
	}

	/**
	 * Adopt meshes built elsewhere so they are repainted like any other copy.
	 *
	 * An instanced batch copies whatever material the original holds when it is built, and a
	 * texture that arrives afterwards repaints the original -- never the batch. Handing the batch
	 * over here puts it in the same tracking every clone uses.
	 */
	public adopt(file: string, parts: any[]): void {
		this.track(file, parts);
		void this.paint(file, parts);
	}

	/** Say that an object's geometry is drawn by an instanced batch. */
	public markInstanced(guid: string): void {
		this.instanced.add(guid.toLowerCase());
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
			this.manifest.blueprints[key] = [{ file }];
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

		for (const [gameObject, parts] of waiting) {
			for (const part of parts) {
				this.loaded.delete(part.file);
			}

			const model = await this.assemble(parts);

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

		for (const [file, copies] of Array.from(this.painted.entries())) {
			for (const parts of copies) {
				void this.paint(file, parts);
			}
		}

		return retried;
	}

	public get stats(): { attached: number; missing: number; volumes: number; meshes: number } {
		return {
			attached: this.attached,
			missing: this.missing,
			volumes: this.volumes,
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
		// Instanced statics carry their geometry through InstancedMeshes; cloning it here too drew
		// the whole baked layer twice.
		if (this.instanced.has(guid.toString().toLowerCase())) {
			return;
		}

		const parts = this.manifest.blueprints[partitionGuid.toLowerCase()];

		if (parts === undefined || parts.length === 0) {
			// Groups (worldparts, subworlds) and wrappers whose geometry is placed separately.
			this.missing++;
			return;
		}

		if (MeshManager.VOLUME.test(this.meshKeys.get(parts[0].file) || parts[0].file)) {
			this.volumes++;
		}

		const position = commandActionResult.gameObjectTransferData.transform.trans;
		this.placed.add(MeshManager.placementKey(parts[0].file, position.x, position.y, position.z));

		void this.assemble(parts).then((model) => {
			if (model === null) {
				// Its geometry was not ready yet. The server extracts a level's meshes in the
				// background, so ask again later rather than leaving the object bare forever.
				this.pending.set(gameObject, parts);
				return;
			}

			model.traverse((child: any) => {
				if (child.isMesh) {
					child.castShadow = true;
					child.receiveShadow = true;
				}
			});

			gameObject.add(model);
			this.showInScene(gameObject);
			this.attached++;
			(window as any).editor.threeManager.setPendingRender();
		});
	}

	/**
	 * A prefab's geometry: every part, each at the offset it holds inside the blueprint.
	 *
	 * A single-part blueprint is returned as-is; anything else becomes a group, so a facade cluster
	 * or a lamp arrives whole instead of as whichever piece happened to be first.
	 */
	private async assemble(parts: MeshPart[]): Promise<THREE.Object3D | null> {
		if (parts.length === 1 && parts[0].transform === undefined) {
			return this.instance(parts[0].file);
		}

		const group = new THREE.Group();

		for (const part of parts) {
			const model = await this.instance(part.file);

			if (model === null) {
				continue;
			}

			if (part.transform !== undefined && part.transform.length === 12) {
				const t = part.transform;
				// right, up, forward, translation -- the same basis order the editor's own
				// LinearTransform uses.
				model.applyMatrix4(new THREE.Matrix4().set(
					t[0], t[3], t[6], t[9],
					t[1], t[4], t[7], t[10],
					t[2], t[5], t[8], t[11],
					0, 0, 0, 1
				));
			}

			group.add(model);
		}

		return group.children.length > 0 ? group : null;
	}

	/** The loaded original for a file, painted, for the instanced batches to build from. */
	public async source(file: string): Promise<THREE.Object3D | null> {
		return this.original(file);
	}

	/** A cloned copy of a mesh, loading the file at most once. */
	private async instance(file: string): Promise<THREE.Object3D | null> {
		const original = await this.original(file);

		if (original === null) {
			return null;
		}

		// Geometry is never gated on textures. The clone inherits whatever the original holds now,
		// and is tracked so a later pass can paint it if that was still the neutral material.
		const copy = original.clone(true);
		const parts: any[] = [];

		copy.traverse((child: any) => {
			if (child.isMesh) {
				parts.push(child);
			}
		});

		this.track(file, parts);
		void this.paint(file, parts);

		return copy;
	}

	/** The loaded, painted original for a file. Loaded at most once. */
	private async original(file: string): Promise<THREE.Object3D | null> {
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

						// Paint the ORIGINAL, not each clone.
						//
						// Clones copy the material reference they find at the moment they are made,
						// so painting a clone leaves every copy taken before its texture arrived
						// stuck on the neutral material -- 1238 meshes were sitting like that. The
						// original is painted once and every clone, past and future, points at the
						// same textured material.
						const parts: any[] = [];
						gltf.scene.traverse((child: any) => {
							if (child.isMesh) {
								child.material = this.material;
								parts.push(child);
							}
						});

						this.track(file, parts);
						void this.paint(file, parts);

						resolve(gltf.scene);
					},
					undefined,
					() => resolve(null)
				);
			});

			this.loaded.set(file, pending);
		}

		return pending;
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
