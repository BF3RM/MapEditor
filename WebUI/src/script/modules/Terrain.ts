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

		// The level's own terrain textures, where it has any. Falls back to the neutral ground the
		// caller passed, which is what a level with no terrain textures gets.
		if (load !== undefined) {
			const painted = await new TerrainMaterial(this.level, this.base)
				.build(Terrain.extent(terrain), load);

			if (painted !== null) {
				material = painted;
			}
		}

		// Whatever the tree carries inline goes down first: it cost nothing beyond the tree itself
		// and puts ground under the level immediately. On MP_001 that is the whole surface. On
		// MP_017 it is one tile covering the entire map, which is exactly the base layer the
		// streamed levels then refine.
		const base = this.embedded(terrain, material);
		const streamed = await this.streamed(terrain, material);

		return streamed > 0 ? streamed : base;
	}

	/** The surface as carried in the tree itself. */
	private embedded(terrain: TerrainData, material: THREE.Material): number {
		const withData = terrain.nodes.filter((node) => node.data !== null && node.data !== undefined);

		if (withData.length === 0) {
			return 0;
		}

		// This tree shape has no children recorded per node, so the deepest level is its leaf set.
		const deepest = Math.max(...withData.map((node) => node.depth));
		let built = 0;

		for (const node of withData) {
			if (node.depth !== deepest) {
				continue;
			}

			const samples = Terrain.decode(node.data as string, terrain.samplesPerSide);
			const mesh = samples === null ? null : this.patch(node.min, node.max, samples, terrain, material);

			if (mesh !== null) {
				this.hold().add(mesh);
				this.baseTiles.push(mesh);
				built++;
			}
		}

		if (built > 0) {
			(window as any).editor.threeManager.setPendingRender();
		}

		return built;
	}

	/**
	 * The surface as streamed tiles, coarsest level first.
	 *
	 * Every level of the tree covers the whole map -- that is what a LOD pyramid is for -- so the
	 * four tiles at depth 1 are a complete, if blocky, ground. Those are fetched first and the
	 * level appears with ground under it in about a second; the finer levels then replace them as
	 * they arrive, and a coarse tile is dropped only once all four of its children have landed, so
	 * the surface is never left with a hole in it.
	 *
	 * A node that stops early keeps its tile, which is exactly what the adaptive tree is saying:
	 * flat water needs no subdivision.
	 */
	private async streamed(terrain: TerrainData, material: THREE.Material): Promise<number> {
		const usable = (terrain.streamNodes || []).filter(
			(node) => node.lod0Size > 0 && node.min !== null && node.max !== null);

		if (usable.length === 0) {
			return 0;
		}

		// Which nodes to draw, and which coarse ones may be dropped once refined.
		//
		// Neither obvious rule works on its own. Retiring a parent after four children leaves it
		// sitting on top of its children forever wherever the tree gives it fewer, and retiring it
		// after however many children turned up punches a hole wherever one of them has no chunk.
		// Both were visible on MP_017 as stripes across the hillsides -- overlap in the first case,
		// bare background showing through in the second.
		//
		// So a node hands over to its children only when EVERY child can cover its own quarter,
		// recursively. Anything else keeps its own tile.
		const all = new Map<string, StreamNode>();
		const drawable = new Set<string>();

		for (const node of terrain.streamNodes || []) {
			const key = Terrain.key(node.depth, node.indexX, node.indexY);

			all.set(key, node);

			if (node.lod0Size > 0 && node.min !== null && node.max !== null) {
				drawable.add(key);
			}
		}

		const children = (node: StreamNode): StreamNode[] => {
			const found: StreamNode[] = [];

			for (let i = 0; i < 4; i++) {
				const child = all.get(Terrain.key(
					node.depth + 1, node.indexX * 2 + (i & 1), node.indexY * 2 + (i >> 1)));

				if (child !== undefined) {
					found.push(child);
				}
			}

			return found;
		};

		const refines = new Map<string, StreamNode[]>();

		const covers = (node: StreamNode): boolean => {
			const key = Terrain.key(node.depth, node.indexX, node.indexY);
			const kids = children(node);

			if (kids.length === 4 && kids.every(covers)) {
				refines.set(key, kids);
				return true;
			}

			return drawable.has(key);
		};

		for (const node of usable) {
			if (node.depth === usable[0].depth) {
				covers(node);
			}
		}

		// Every node on the way down to the tiles that will finally be drawn: the coarse ones are
		// worth drawing first even though they are replaced, because they are what puts ground
		// under the level in the first second.
		const ordered = usable
			.filter((node) => drawable.has(Terrain.key(node.depth, node.indexX, node.indexY)))
			.sort((a, b) => a.depth - b.depth);

		const shallowest = ordered.length === 0 ? 0 : ordered[0].depth;
		const coarsest = ordered.filter((node) => node.depth === shallowest).length;
		const meshes = new Map<string, THREE.Mesh>();
		const arrived = new Map<string, number>();
		const expected = new Map<string, number>();

		refines.forEach((kids, key) => expected.set(key, kids.length));

		let next = 0;
		let built = 0;

		const worker = async (): Promise<void> => {
			for (;;) {
				const index = next++;

				if (index >= ordered.length) {
					return;
				}

				const node = ordered[index];
				const samples = await this.tile(node.lod0Chunk, terrain.samplesPerSide);

				if (samples === null) {
					continue;
				}

				const mesh = this.patch(
					node.min as number[], node.max as number[], samples, terrain, material);

				if (mesh === null) {
					continue;
				}

				this.hold().add(mesh);
				meshes.set(Terrain.key(node.depth, node.indexX, node.indexY), mesh);
				built++;

				this.retire(node, meshes, arrived, expected);

				// The inline base was only ever scaffolding: once a whole streamed level is down,
				// it is covered everywhere and would otherwise z-fight with the real surface.
				if (this.baseTiles.length > 0 && built >= coarsest) {
					for (const tile of this.baseTiles) {
						this.hold().remove(tile);
						tile.geometry.dispose();
					}

					this.baseTiles = [];
				}

				// Each tile shows up as it lands rather than the ground appearing all at once.
				(window as any).editor.threeManager.setPendingRender();
			}
		};

		const workers = [];

		for (let i = 0; i < Math.min(MAX_IN_FLIGHT, ordered.length); i++) {
			workers.push(worker());
		}

		await Promise.all(workers);

		console.log('Rime: terrain streamed ' + built + ' of ' + ordered.length +
			' tiles, ' + meshes.size + ' drawn after coarser levels were replaced');

		return built;
	}

	/** The terrain's world bounds as [minX, minZ, sizeX, sizeZ], for stretching a level-wide mask. */
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

		// PlaneGeometry is built in XY and laid flat below; its rows run the opposite way to the
		// sample grid, hence the flipped V.
		for (let v = 0; v < inner; v++) {
			for (let u = 0; u < inner; u++) {
				const sample = samples[(v + BORDER) * side + (u + BORDER)];
				const index = (inner - 1 - v) * inner + u;

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
}
