/**
 * Paints the ground with the level's own terrain textures.
 *
 * A BF3 level's terrain is drawn from LAYERS -- seven on both MP_001 and MP_017 -- blended per
 * texel. Two things are needed to reproduce that: WHERE each layer goes, and WHICH TEXTURE each
 * layer is.
 *
 * WHERE comes from the terrain material tree, which the server decodes into a grid of indices, one
 * per texel, covering the whole level (Rime's dump_terrain_nodes; the encoding is documented at the
 * decoder). Those indices are assembled here into a single index texture and sampled by world
 * position, so the arrangement drawn is the level's own: roads where the roads are.
 *
 * WHICH TEXTURE is not readable yet. The layer-to-texture binding lives in the terrain's shader,
 * whose EBX class Rime models as a name and nothing else, and the terrain shaders are absent from
 * the level's shader database. So the level's terrain textures are assigned to indices in order.
 * The LAYOUT is real; the PALETTE is a guess, and swapping two entries is a one-line change.
 *
 * A previous attempt blended by the level's `_RGB` mask, on the assumption it was a level-wide
 * splat map. It is not -- decoded, it is noise, a detail mask meant to tile -- and stretching it
 * over eight kilometres is what made the ground look like static.
 */

import * as THREE from 'three';

/** How many metres of ground one repeat of a layer texture covers. */
const TILE_METRES = 8;

/** Layer textures bound at once. Both levels measured declare seven layers. */
const MAX_LAYERS = 6;

/** The index texture's resolution is capped here, whatever the tree's own density suggests. */
const MAX_SPLAT = 2048;

interface TerrainLayers {
	layerCount: number;
	diffuse: string[];
}

interface MaterialNode {
	level: number;
	min: number[];
	max: number[];
	samples?: string;
}

export interface TerrainSplatSource {
	materialSamplesPerSide?: number;
	materialNodes?: MaterialNode[];
}

export class TerrainMaterial {
	private level: string;
	private base: string;

	public constructor(level: string, base = '/meshes') {
		this.level = level.replace(/\/$/, '').split('/').pop() as string;
		this.base = base;
	}

	/**
	 * The level's terrain material, or null where it has no terrain textures of its own.
	 *
	 * `extent` is [minX, minZ, sizeX, sizeZ] in world units.
	 */
	public async build(extent: number[], terrain: TerrainSplatSource,
		load: (resource: string) => Promise<THREE.Texture | null>): Promise<THREE.Material | null> {
		let layers: TerrainLayers;

		try {
			const response = await fetch(this.base + '/terrainlayers/' + this.level + '.json');

			if (!response.ok) {
				return null;
			}

			layers = (await response.json()) as TerrainLayers;
		} catch (e) {
			return null;
		}

		if (layers.diffuse.length === 0) {
			return null;
		}

		const loaded = await Promise.all(
			layers.diffuse.slice(0, MAX_LAYERS).map((resource) => load(resource)));
		const usable = loaded.filter((texture): texture is THREE.Texture => texture !== null);

		if (usable.length === 0) {
			return null;
		}

		for (const texture of usable) {
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
		}

		const splat = TerrainMaterial.splat(extent, terrain);
		const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

		material.onBeforeCompile = (shader) => {
			for (let i = 0; i < MAX_LAYERS; i++) {
				shader.uniforms['uLayer' + i] = { value: usable[Math.min(i, usable.length - 1)] };
			}

			shader.uniforms.uSplat = { value: splat };
			shader.uniforms.uHasSplat = { value: splat === null ? 0 : 1 };
			shader.uniforms.uLayers = { value: usable.length };
			shader.uniforms.uExtent = { value: new THREE.Vector4(extent[0], extent[1], extent[2], extent[3]) };
			shader.uniforms.uTile = { value: TILE_METRES };

			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
				.replace('#include <begin_vertex>',
					'#include <begin_vertex>\nvTerrainWorld = (modelMatrix * vec4(position, 1.0)).xyz;');

			const declarations = ['#include <common>', 'varying vec3 vTerrainWorld;'];

			for (let i = 0; i < MAX_LAYERS; i++) {
				declarations.push('uniform sampler2D uLayer' + i + ';');
			}

			declarations.push('uniform sampler2D uSplat;', 'uniform int uHasSplat;',
				'uniform int uLayers;', 'uniform vec4 uExtent;', 'uniform float uTile;');

			const pick = ['vec4 terrainOf(float index, vec2 uv) {'];

			for (let i = 0; i < MAX_LAYERS; i++) {
				pick.push('  if (index < ' + (i + 0.5).toFixed(1) + ') return texture2D(uLayer' + i + ', uv);');
			}

			pick.push('  return texture2D(uLayer0, uv);', '}');

			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', declarations.concat(pick).join('\n'))
				.replace('#include <map_fragment>', [
					'vec2 terrainUv = vTerrainWorld.xz / uTile;',
					'vec4 ground = texture2D(uLayer0, terrainUv);',
					'if (uHasSplat == 1) {',
					'  vec2 splatUv = (vTerrainWorld.xz - uExtent.xy) / uExtent.zw;',
					// The index is stored as a byte scaled to 0..1; bring it back and round to the
					// layer it names.
					'  float index = floor(texture2D(uSplat, splatUv).r * 255.0 + 0.5);',
					'  ground = terrainOf(min(index, float(uLayers - 1)), terrainUv);',
					'}',
					'diffuseColor *= vec4(ground.rgb, 1.0);',
				].join('\n'));
		};

		material.customProgramCacheKey = () => 'terrain-layers-' + this.level;

		console.log('Rime: terrain painted with ' + usable.length + ' of ' + layers.layerCount +
			' layers' + (splat === null ? ' (no material map -- one layer everywhere)'
				: ', arranged by the level\'s material map'));

		return material;
	}

	/**
	 * The level's material indices as one texture, sampled by world position.
	 *
	 * Nodes are drawn coarsest first so that where the tree refines, the finer node wins -- the
	 * same rule the heights follow.
	 */
	private static splat(extent: number[], terrain: TerrainSplatSource): THREE.DataTexture | null {
		const nodes = (terrain.materialNodes || []).filter((node) => node.samples !== undefined);
		const side = terrain.materialSamplesPerSide || 0;

		if (nodes.length === 0 || side === 0 || extent[2] <= 0) {
			return null;
		}

		// Match the finest node's density, within the cap: a node covering less ground carries the
		// same number of samples, so it is the one that sets the resolution worth keeping.
		let finest = Infinity;

		for (const node of nodes) {
			finest = Math.min(finest, (node.max[0] - node.min[0]) / side);
		}

		const size = Math.min(MAX_SPLAT, Math.max(256, Math.pow(2,
			Math.ceil(Math.log2(Math.max(1, extent[2] / Math.max(0.5, finest)))))));
		const data = new Uint8Array(size * size);

		for (const node of nodes.slice().sort((a, b) => a.level - b.level)) {
			const packed = Uint8Array.from(atob(node.samples as string), (c) => c.charCodeAt(0));

			if (packed.length < side * side / 2) {
				continue;
			}

			const x0 = Math.round((node.min[0] - extent[0]) / extent[2] * size);
			const y0 = Math.round((node.min[1] - extent[1]) / extent[3] * size);
			const width = Math.max(1, Math.round((node.max[0] - node.min[0]) / extent[2] * size));
			const height = Math.max(1, Math.round((node.max[1] - node.min[1]) / extent[3] * size));

			for (let y = 0; y < height; y++) {
				const target = y0 + y;

				if (target < 0 || target >= size) {
					continue;
				}

				const v = Math.min(side - 1, Math.floor(y / height * side));

				for (let x = 0; x < width; x++) {
					const column = x0 + x;

					if (column < 0 || column >= size) {
						continue;
					}

					const u = Math.min(side - 1, Math.floor(x / width * side));
					// Two samples to a byte, the high nibble first.
					const byte = packed[v * (side / 2) + (u >> 1)];

					data[target * size + column] = (u & 1) === 0 ? (byte >> 4) : (byte & 15);
				}
			}
		}

		const texture = new THREE.DataTexture(data, size, size, THREE.LuminanceFormat);

		// Nearest: these are indices, and interpolating them names layers that are not there.
		texture.magFilter = THREE.NearestFilter;
		texture.minFilter = THREE.NearestFilter;
		texture.needsUpdate = true;

		return texture;
	}
}
