/**
 * Builds a level's ground surface.
 *
 * Nothing in EBX describes terrain: the heightfield lives in a streaming-tree RESOURCE as a
 * quadtree, each node carrying 133x133 UInt16 samples with a two-sample border (so 129x129 are
 * usable). Rime reads the tree (dump_terrain_nodes) and the server serves it.
 *
 * There are two ways a level stores those samples, and a level uses one or the other:
 *
 *  - EMBEDDED, in the heightfield tree itself. MP_001 is like this: 30 nodes carry their samples
 *    inline, and the whole surface arrives with the tree.
 *  - STREAMED, in chunks the tree only names. MP_017 is like this: its heightfield tree embeds
 *    nothing but the root, and its 272 other tiles each name a chunk. Those are fetched one tile
 *    at a time, which is what the engine does as you move through the level.
 *
 * Either way the set to draw is the tree's LEAVES, not its deepest level. The tree is adaptive --
 * MP_017 subdivides to depth 6 over the detailed ground and stops at 3 over flat water -- so
 * "deepest" would leave holes wherever it stopped early, while the leaves tile the map exactly
 * once (measured: 66,584,576 of 67,108,864 square metres).
 *
 * World height is the raw sample times the tree's worldScaleY -- checked twice: MP_001's samples
 * average 4627 against objects at y=72 (4627 * 0.015625 = 72.3), and MP_017's first streamed tile
 * decodes to a minimum of 59.735 m against the 59.735 its node declares.
 */

import * as THREE from 'three';
import { TerrainMaterial } from '@/script/modules/TerrainMaterial';

const BORDER = 2;

/** How many tiles to have in flight at once. The server extracts each one from the game. */
const MAX_IN_FLIGHT = 6;

interface TerrainNode {
	depth: number;
	indexX: number;
	indexY: number;
	leaf: boolean;
	min: number[];
	max: number[];
	data: string | null;
}

interface StreamNode {
	depth: number;
	indexX: number;
	indexY: number;
	leaf: boolean;
	lod0Chunk: string;
	lod0Size: number;
	min: number[] | null;
	max: number[] | null;
}

/** A node of the tree, with its samples from wherever they are kept. */
interface Tile {
	depth: number;
	indexX: number;
	indexY: number;
	min: number[];
	max: number[];
	data: string | null | undefined;
	chunk: string | null;
}

interface TerrainData {
	samplesPerSide: number;
	worldScaleY: number;
	nodes: TerrainNode[];
	streamNodes?: StreamNode[];
}

export class Terrain {
	private level: string;
	private base: string;
	private group: THREE.Group | null = null;
	/** The inline tiles, held so they can be dropped once streamed levels cover them. */
	private baseTiles: THREE.Mesh[] = [];

	public constructor(level: string, base = '/meshes') {
		this.level = level.replace(/\/$/, '').split('/').pop() as string;
		this.base = base;
	}

	/**
	 * Adds the terrain to the scene. Returns how many patches were built.
	 *
	 * Streamed levels keep going after this resolves: the tiles arrive over the following seconds
	 * and each is added as it lands, so the ground fills in rather than appearing all at once.
	 */
	public async load(material: THREE.Material,
		load?: (resource: string) => Promise<THREE.Texture | null>): Promise<number> {
		let terrain: TerrainData;

		try {
			const response = await fetch(this.base + '/terrain/' + this.level + '.json');

			if (!response.ok) {
				return 0;
			}

			terrain = (await response.json()) as TerrainData;
		} catch (e) {
			return 0;
		}

		// The level's own terrain textures, where it has any.
		let painted: THREE.Material | null = null;

		if (load !== undefined) {
			painted = await new TerrainMaterial(this.level, this.base)
				.build(Terrain.extent(terrain), terrain as any, load);
		}

		if (painted !== null) {
			material = painted;
		} else {
			// No layer textures for this level, so the ground is a greybox -- but it must not be
			// the SAME grey as an untextured prop, which is what made it read as a white sheet
			// under the sky light with no horizon and no relief.
			//
			// Traced for MP_001, which is the case this hits: its terrain layer textures are not
			// obtainable. They are not in EBX (Levels/MP_001/Terrain is a WorldPartData), the level
			// has no Terrain/Textures directory (only 22 levels do), there is no shared pool, and
			// the level's shaderdb dumps 349 shaders without one terrain shader among them -- the
			// terrain's own shaders are generated (MP001_Terrain__5MV__2d__0) and Rime's
			// dump_shader_textures does not expose them.
			//
			// So: an earth tone rather than the prop grey, fully rough so it takes the light like
			// ground instead of a highlight sheet, and flat-shaded so slopes separate and the
			// terrain reads as terrain.
			material = new THREE.MeshStandardMaterial({
				color: 0x8a7c66,
				roughness: 1.0,
				metalness: 0.0,
				flatShading: true
			});
		}

		return this.surface(terrain, material);
	}

	/**
	 * The ground, from whichever place each node keeps its samples.
	 *
	 * A level is not one or the other. MP_001 has 41 nodes and 31 leaves, and only its 20 deepest
	 * leaves carry samples inline -- the other 11 name a chunk, exactly as MP_017's do. Treating
	 * the two as separate trees drew 31% of MP_001 and called it done.
	 */
	private async surface(terrain: TerrainData, material: THREE.Material): Promise<number> {
		const merged = new Map<string, Tile>();

		for (const node of terrain.nodes) {
			merged.set(Terrain.key(node.depth, node.indexX, node.indexY), {
				depth: node.depth,
				indexX: node.indexX,
				indexY: node.indexY,
				min: node.min,
				max: node.max,
				data: node.data,
				chunk: null
			});
		}

		for (const node of terrain.streamNodes || []) {
			const key = Terrain.key(node.depth, node.indexX, node.indexY);
			const existing = merged.get(key);

			if (existing !== undefined) {
				if (node.lod0Size > 0) {
					existing.chunk = node.lod0Chunk;
				}

				continue;
			}

			if (node.min === null || node.max === null) {
				continue;
			}

			merged.set(key, {
				depth: node.depth,
				indexX: node.indexX,
				indexY: node.indexY,
				min: node.min,
				max: node.max,
				data: null,
				chunk: node.lod0Size > 0 ? node.lod0Chunk : null
			});
		}

		const tiles = Array.from(merged.values());
		const drawn = Terrain.covering(tiles).sort((a, b) => a.depth - b.depth);

		if (drawn.length === 0) {
			return 0;
		}

		let next = 0;
		let built = 0;

		const worker = async (): Promise<void> => {
			for (;;) {
				const index = next++;

				if (index >= drawn.length) {
					return;
				}

				const tile = drawn[index];
				const samples = tile.data !== null && tile.data !== undefined
					? Terrain.decode(tile.data, terrain.samplesPerSide)
					: await this.tile(tile.chunk as string, terrain.samplesPerSide);

				if (samples === null) {
					continue;
				}

				const mesh = this.patch(tile.min, tile.max, samples, terrain, material);

				if (mesh !== null) {
					this.hold().add(mesh);
					built++;
					// Each tile shows up as it lands rather than the ground appearing at once.
					(window as any).editor.threeManager.setPendingRender();
				}
			}
		};

		const workers = [];

		for (let i = 0; i < Math.min(MAX_IN_FLIGHT, drawn.length); i++) {
			workers.push(worker());
		}

		await Promise.all(workers);

		console.log('Rime: terrain built from ' + built + ' of ' + drawn.length + ' tiles (' +
			tiles.length + ' in the tree)');

		return built;
	}

	private static key(depth: number, x: number, y: number): string {
		return depth + ':' + x + ':' + y;
	}

	/** Drops a coarse tile once every child that is coming has been drawn. */
	private retire(node: StreamNode, meshes: Map<string, THREE.Mesh>,
		arrived: Map<string, number>, expected: Map<string, number>): void {
		if (node.depth <= 0) {
			return;
		}

		const parent = Terrain.key(node.depth - 1, node.indexX >> 1, node.indexY >> 1);
		const count = (arrived.get(parent) || 0) + 1;

		arrived.set(parent, count);

		const handover = expected.get(parent);

		// No entry means this parent keeps its own tile: one of its quarters cannot be covered by a
		// child, so dropping it would leave that quarter empty.
		if (handover === undefined || count < handover) {
			return;
		}

		const covered = meshes.get(parent);

		if (covered === undefined) {
			return;
		}

		this.hold().remove(covered);
		covered.geometry.dispose();
		meshes.delete(parent);
	}

	/** One streamed tile's samples. */
	private async tile(guid: string, side: number): Promise<Uint16Array | null> {
		try {
			const response = await fetch(this.base + '/tile/' + guid + '/' + side + '.bin');

			if (!response.ok) {
				return null;
			}

			const buffer = await response.arrayBuffer();

			if (buffer.byteLength < side * side * 2) {
				return null;
			}

			return new Uint16Array(buffer, 0, side * side);
		} catch (e) {
			return null;
		}
	}

	private static decode(data: string, side: number): Uint16Array | null {
		const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

		if (bytes.length < side * side * 2) {
			return null;
		}

		return new Uint16Array(bytes.buffer, bytes.byteOffset, side * side);
	}

	private hold(): THREE.Group {
		if (this.group === null) {
			this.group = new THREE.Group();
			this.group.name = 'terrain';
			(window as any).editor.threeManager.scene.add(this.group);
		}

		return this.group;
	}

	/**
	 * Drops every triangle that touches a sample the tile does not carry.
	 *
	 * Returns how many triangles survive, so a tile that turns out to be entirely no-data can be
	 * skipped rather than added as an empty mesh.
	 */
	private static trim(geometry: THREE.BufferGeometry, missing: boolean[]): number {
		const index = geometry.getIndex();

		if (index === null) {
			return 1;
		}

		const source = index.array;
		const kept: number[] = [];

		for (let i = 0; i < source.length; i += 3) {
			if (missing[source[i]] || missing[source[i + 1]] || missing[source[i + 2]]) {
				continue;
			}

			kept.push(source[i], source[i + 1], source[i + 2]);
		}

		if (kept.length === source.length) {
			return kept.length / 3;
		}

		geometry.setIndex(kept);

		return kept.length / 3;
	}

	/** One node's surface, as a grid of its interior samples. */
	private patch(min: number[], max: number[], samples: Uint16Array, terrain: TerrainData,
		material: THREE.Material): THREE.Mesh | null {
		const side = terrain.samplesPerSide;
		const inner = side - BORDER * 2;
		const geometry = new THREE.PlaneGeometry(
			max[0] - min[0], max[2] - min[2], inner - 1, inner - 1);
		const position = geometry.attributes.position;

		// A tile only carries samples for the ground it is actually responsible for.
		//
		// A coarse tile is not a whole low-detail copy of the map: where the tree refines, the
		// parent's samples there are left at zero, because the engine draws the children instead.
		// Rendering those anyway drops the surface to sea level in long ribbons across the level --
		// which is exactly what MP_017 looked like. The node's own declared height range says what
		// is real: MP_017's depth-3 tiles declare 143.4 m and carry zeroes.
		const floor = (min[1] - 1) / terrain.worldScaleY;
		const missing: boolean[] = new Array(inner * inner).fill(false);

		// PlaneGeometry is built in XY and laid flat by the rotateX below, which maps its +Y to
		// world -Z: row 0 of the plane is world Z minimum, and so is row 0 of the sample grid. They
		// run the same way, so V is NOT flipped.
		//
		// It was, and the terrain was subtly wrong everywhere rather than obviously wrong anywhere:
		// against 311 objects standing on the ground, flipping it costs a median of 8.15 m and a
		// 90th percentile of 41.35 m, against 4.46 m and 13.58 m the right way round.
		for (let v = 0; v < inner; v++) {
			for (let u = 0; u < inner; u++) {
				const sample = samples[(v + BORDER) * side + (u + BORDER)];
				const index = v * inner + u;

				position.setZ(index, sample * terrain.worldScaleY);

				if (sample < floor) {
					missing[index] = true;
				}
			}
		}

		const trimmed = Terrain.trim(geometry, missing);

		if (trimmed === 0) {
			return null;
		}

		geometry.rotateX(-Math.PI / 2);
		geometry.computeVertexNormals();

		const mesh = new THREE.Mesh(geometry, material);
		mesh.receiveShadow = true;
		mesh.position.set((min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2);

		return mesh;
	}

	// Restored from HEAD to unblock the build.
	//
	// The in-progress terrain refactor in the working tree dropped these two statics but kept
	// calling them, so the dev server failed to compile ("Property 'extent' does not exist on type
	// 'typeof Terrain'") and served a stale bundle -- which is its own class of confusion, because
	// the editor then runs code that is not on disk.
	//
	// covering() is generic now: the refactor's node shape is no longer TerrainNode, and the only
	// thing either method needs is depth/indexX/indexY.
	private static covering<T extends { depth: number; indexX: number; indexY: number }>(
		nodes: T[]
	): T[] {
		const all = new Map<string, T>();

		for (const node of nodes) {
			all.set(Terrain.key(node.depth, node.indexX, node.indexY), node);
		}

		const children = (node: T): T[] => {
			const found: T[] = [];

			for (let i = 0; i < 4; i++) {
				const child = all.get(Terrain.key(
					node.depth + 1, node.indexX * 2 + (i & 1), node.indexY * 2 + (i >> 1)));

				if (child !== undefined) {
					found.push(child);
				}
			}

			return found;
		};

		const chosen: T[] = [];

		const walk = (node: T): boolean => {
			const kids = children(node);

			if (kids.length === 4) {
				const covered: T[] = [];
				let complete = true;

				for (const kid of kids) {
					const before = chosen.length;

					if (!walk(kid)) {
						complete = false;
					}

					covered.push(...chosen.slice(before));
				}

				if (complete) {
					return true;
				}

				// One quarter cannot cover itself, so this node draws instead and its descendants
				// are dropped again.
				chosen.length -= covered.length;
			}

			chosen.push(node);

			return true;
		};

		// Whatever the shallowest nodes are, they are the roots to walk from.
		const shallowest = Math.min(...nodes.map((node) => node.depth));

		for (const node of nodes) {
			if (node.depth === shallowest) {
				walk(node);
			}
		}

		return chosen;
	}

	private static extent(terrain: TerrainData): number[] {
		let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;

		const consider = (min: number[] | null, max: number[] | null): void => {
			if (min === null || max === null) {
				return;
			}

			minX = Math.min(minX, min[0]);
			minZ = Math.min(minZ, min[2]);
			maxX = Math.max(maxX, max[0]);
			maxZ = Math.max(maxZ, max[2]);
		};

		for (const node of terrain.nodes) {
			consider(node.min, node.max);
		}

		for (const node of terrain.streamNodes || []) {
			consider(node.min, node.max);
		}

		if (!isFinite(minX) || maxX <= minX) {
			return [-2048, -2048, 4096, 4096];
		}

		return [minX, minZ, maxX - minX, maxZ - minZ];
	}

}
