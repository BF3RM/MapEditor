/**
 * Builds a level's ground surface.
 *
 * Nothing in EBX describes terrain: the heightfield lives in a streaming-tree RESOURCE as a
 * quadtree, each node carrying 133x133 UInt16 samples with a two-sample border (so 129x129 are
 * usable). Rime reads the tree (dump_terrain_nodes) and the server serves it.
 *
 * World height is the raw sample times the tree's worldScaleY -- checked against MP_001, whose
 * samples average 4627 and whose objects sit around y=72: 4627 * 0.015625 = 72.3.
 */

import * as THREE from 'three';

const BORDER = 2;

interface TerrainNode {
	depth: number;
	min: number[];
	max: number[];
	data: string | null;
}

interface TerrainData {
	samplesPerSide: number;
	worldScaleY: number;
	nodes: TerrainNode[];
}

export class Terrain {
	private level: string;
	private base: string;

	public constructor(level: string, base = '/meshes') {
		this.level = level.replace(/\/$/, '').split('/').pop() as string;
		this.base = base;
	}

	/** Adds the terrain to the scene. Returns how many patches were built. */
	public async load(material: THREE.Material): Promise<number> {
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

		const withData = terrain.nodes.filter((node) => node.data !== null && node.data !== undefined);

		if (withData.length === 0) {
			return 0;
		}

		// Deepest nodes only. The tree is a LOD pyramid -- every level covers the same ground, so
		// drawing them all would stack four surfaces on top of each other.
		const deepest = Math.max(...withData.map((node) => node.depth));
		const group = new THREE.Group();
		group.name = 'terrain';

		let built = 0;

		for (const node of withData) {
			if (node.depth !== deepest) {
				continue;
			}

			const mesh = this.patch(node, terrain, material);

			if (mesh !== null) {
				group.add(mesh);
				built++;
			}
		}

		if (built > 0) {
			(window as any).editor.threeManager.scene.add(group);
			(window as any).editor.threeManager.setPendingRender();
		}

		return built;
	}

	/** One node's surface, as a grid of its interior samples. */
	private patch(node: TerrainNode, terrain: TerrainData, material: THREE.Material): THREE.Mesh | null {
		const side = terrain.samplesPerSide;
		const inner = side - BORDER * 2;
		const bytes = Uint8Array.from(atob(node.data as string), (c) => c.charCodeAt(0));

		if (bytes.length < side * side * 2) {
			return null;
		}

		const samples = new Uint16Array(bytes.buffer, bytes.byteOffset, side * side);
		const geometry = new THREE.PlaneGeometry(
			node.max[0] - node.min[0], node.max[2] - node.min[2], inner - 1, inner - 1);
		const position = geometry.attributes.position;

		// PlaneGeometry is built in XY and laid flat below; its rows run the opposite way to the
		// sample grid, hence the flipped V.
		for (let v = 0; v < inner; v++) {
			for (let u = 0; u < inner; u++) {
				const sample = samples[(v + BORDER) * side + (u + BORDER)];
				position.setZ((inner - 1 - v) * inner + u, sample * terrain.worldScaleY);
			}
		}

		geometry.rotateX(-Math.PI / 2);
		geometry.computeVertexNormals();

		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set((node.min[0] + node.max[0]) / 2, 0, (node.min[2] + node.max[2]) / 2);

		return mesh;
	}
}
