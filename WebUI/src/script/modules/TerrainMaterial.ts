/**
 * Paints the ground with the level's own terrain textures.
 *
 * A BF3 level's terrain is drawn from LAYERS -- MP_017 declares seven, blended per texel -- and
 * the layer textures live under `Levels/<Map>/Terrain/Textures` alongside the masks that say where
 * each one goes. The VisualTerrain resource (dump_visual_terrain) says how many layers there are
 * and which shader blends each combination of them.
 *
 * What is reproduced here is the shape of that, not the whole of it: the layers are blended by the
 * level's RGB mask, tiled by world position. The engine composites them through a virtual texture
 * atlas with per-layer scales that are not readable yet, so this is the level's own textures in the
 * level's own arrangement, at a tiling rate chosen here rather than read from the data.
 *
 * It is grafted onto MeshStandardMaterial rather than written as a shader from scratch, so the
 * terrain keeps the scene's lighting and shadows.
 */

import * as THREE from 'three';

/** How many metres of ground one repeat of a layer texture covers. */
const TILE_METRES = 12;

/** The most layers blended at once. The mask carries four channels; so does this. */
const MAX_LAYERS = 4;

interface TerrainLayers {
	layerCount: number;
	surfaceShader: string;
	diffuse: string[];
	normal: string[];
	masks: string[];
}

export class TerrainMaterial {
	private level: string;
	private base: string;

	public constructor(level: string, base = '/meshes') {
		this.level = level.replace(/\/$/, '').split('/').pop() as string;
		this.base = base;
	}

	/**
	 * The level's terrain material, or null where the level keeps no terrain textures -- MP_001 is
	 * such a level: its ground is under a city and it ships none.
	 *
	 * `extent` is the terrain's world bounds as [minX, minZ, sizeX, sizeZ]; the mask is stretched
	 * across it, which is what a level-wide mask is for.
	 */
	public async build(extent: number[],
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

		const wanted = layers.diffuse.slice(0, MAX_LAYERS);
		const textures = await Promise.all(wanted.map((resource) => load(resource)));
		const usable = textures.filter((texture): texture is THREE.Texture => texture !== null);

		if (usable.length === 0) {
			return null;
		}

		for (const texture of usable) {
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
		}

		// The widest mask the level has. A level-wide one is named for the terrain itself; the
		// others mask a road or a transition and would tile wrongly across the whole map.
		const maskName = layers.masks.find((name) => /terrain/i.test(name)) || null;
		const mask = maskName === null ? null : await load(maskName);

		const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

		material.onBeforeCompile = (shader) => {
			shader.uniforms.uLayer0 = { value: usable[0] };
			shader.uniforms.uLayer1 = { value: usable[Math.min(1, usable.length - 1)] };
			shader.uniforms.uLayer2 = { value: usable[Math.min(2, usable.length - 1)] };
			shader.uniforms.uLayer3 = { value: usable[Math.min(3, usable.length - 1)] };
			shader.uniforms.uMask = { value: mask };
			shader.uniforms.uHasMask = { value: mask === null ? 0 : 1 };
			shader.uniforms.uExtent = { value: new THREE.Vector4(extent[0], extent[1], extent[2], extent[3]) };
			shader.uniforms.uTile = { value: TILE_METRES };

			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
				.replace('#include <begin_vertex>',
					'#include <begin_vertex>\nvTerrainWorld = (modelMatrix * vec4(position, 1.0)).xyz;');

			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', [
					'#include <common>',
					'varying vec3 vTerrainWorld;',
					'uniform sampler2D uLayer0;',
					'uniform sampler2D uLayer1;',
					'uniform sampler2D uLayer2;',
					'uniform sampler2D uLayer3;',
					'uniform sampler2D uMask;',
					'uniform int uHasMask;',
					'uniform vec4 uExtent;',
					'uniform float uTile;',
				].join('\n'))
				.replace('#include <map_fragment>', [
					'vec2 terrainUv = vTerrainWorld.xz / uTile;',
					'vec4 layer0 = texture2D(uLayer0, terrainUv);',
					'vec4 layer1 = texture2D(uLayer1, terrainUv);',
					'vec4 layer2 = texture2D(uLayer2, terrainUv);',
					'vec4 layer3 = texture2D(uLayer3, terrainUv);',
					'vec4 blended = layer0;',
					'if (uHasMask == 1) {',
					'  vec2 maskUv = (vTerrainWorld.xz - uExtent.xy) / uExtent.zw;',
					'  vec4 weights = texture2D(uMask, maskUv);',
					// The mask says how much of each layer covers this texel; whatever is left over
					// is the first layer, which is the ground everything else is painted onto.
					'  float rest = max(0.0, 1.0 - (weights.r + weights.g + weights.b));',
					'  float total = max(0.0001, rest + weights.r + weights.g + weights.b);',
					'  blended = (layer0 * rest + layer1 * weights.r + layer2 * weights.g +',
					'             layer3 * weights.b) / total;',
					'}',
					'diffuseColor *= vec4(blended.rgb, 1.0);',
				].join('\n'));
		};

		// Changing onBeforeCompile after a material has been used needs this; setting it here keeps
		// the terrain from rendering once with the stock shader.
		material.customProgramCacheKey = () => 'terrain-layers-' + this.level;

		console.log('Rime: terrain painted with ' + usable.length + ' of ' + layers.layerCount +
			' layers' + (mask === null ? ' (no mask -- one layer across the level)' : ''));

		return material;
	}
}
