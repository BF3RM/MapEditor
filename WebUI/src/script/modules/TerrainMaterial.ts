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

/**
 * Metres of ground one repeat of a layer texture covers, where the level does not say.
 *
 * The level almost always does say: the terrain declares TextureSamplesPerMeterMax, and with the
 * layer texture's own width that gives the tile size exactly -- 1024px at 32 samples/m is 32 m.
 * This was hardcoded to 8, which tiled MP_001's ground four times too densely.
 */
const TILE_FALLBACK_METRES = 8;

/** Layer textures bound at once. MP_001 declares seven and its material map names eight. */
const MAX_LAYERS = 8;

/** The index texture's resolution is capped here, whatever the tree's own density suggests. */
const MAX_SPLAT = 2048;

/**
 * How the break-up textures are scaled and how strongly they are applied.
 *
 * These four are CHOSEN, not recovered, and they are the only chosen numbers left in this file.
 * BF3 ships no per-material surface-shader bytecode -- `systems/shaderprogramdb` holds 973 pixel
 * programs and not one terrain surface shader, and the solutions in `SurfaceShaderInfo` carry no
 * baked constants -- so the scales the engine used are not in the data anywhere. What IS in the
 * data is which textures these are and how they are packed; only the amounts are judgement.
 *
 * The greyscale scale is deliberately not a multiple of the tile: at 3.7x the material period the
 * two patterns take a very long time to line up again, which is the whole point of it.
 */
const DETAIL_GREY_TILE_MULTIPLE = 3.7;
const DETAIL_GREY_STRENGTH = 0.35;
const DETAIL_NORMAL_METRES = 4;
const DETAIL_NORMAL_STRENGTH = 0.6;

/** Depth of the per-material relief. 1.0 is the map as authored. */
const NORMAL_STRENGTH = 1.0;

/** A break-up texture, tagged with HOW it is packed rather than left to be guessed by name. */
interface TerrainDetail {
	resource: string;
	/** `grey` is a scalar mask; `normal` is a two-channel normal in the channels named below. */
	kind: 'grey' | 'normal';
	/** Channel indices that carry signal, measured. A packed normal names two of them. */
	channels: number[];
}

interface TerrainLayers {
	/** Texels of layer texture per metre of ground; 0 where the terrain does not declare it. */
	samplesPerMeter?: number;
	/** The terrain's blend map: RGB are per-material weights, NOT a colour. */
	splat?: string | null;
	layerCount: number;
	/** Indexed BY LAYER; null where a layer binds no colour map of its own. */
	diffuse: Array<string | null>;
	/**
	 * Indexed BY LAYER like `diffuse`, so entry i is layer i's own normal map.
	 *
	 * This alignment is the whole point of the field. The flat `normalMaps` list the server also
	 * serves is in BINDING order, which for MP_001 is rubble-first while its colours are
	 * sand-first -- pairing those two lists by index puts the sand normal on the rubble and the
	 * rubble normal on the sand, and the ground gets the wrong relief everywhere.
	 */
	normalByLayer?: Array<string | null>;
	/** Break-up textures the terrain binds alongside its materials. */
	detail?: TerrainDetail[];
	/** The wetness mask, where the terrain binds one. */
	wetness?: string | null;
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
		load: (resource: string, data?: boolean) => Promise<THREE.Texture | null>
	): Promise<THREE.Material | null> {
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

		// Position in this array IS the layer number the splat names, so a layer that binds no
		// colour has to stay a hole rather than be squeezed out -- compacting it moves every layer
		// above the hole onto someone else's texture.
		const loaded = await Promise.all(layers.diffuse.slice(0, MAX_LAYERS)
			.map((resource) => (resource ? load(resource) : Promise.resolve(null))));
		const usable = loaded.filter((texture): texture is THREE.Texture => texture !== null);

		if (usable.length === 0) {
			return null;
		}

		for (const texture of usable) {
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
		}

		// Layers 3 and 4 on MP_001 bind a normal and a mask but no colour: they modulate the
		// ground rather than replace it. With per-texel blending not reproduced here, the base
		// layer is what they modulate, so that is what they show.
		const base = loaded.find((texture) => texture !== null) || null;

		// The blend map. Measured as a splat rather than trusted by name: MP_001's is called
		// `Asphalt_01_D` and painting it as colour is what turned the ground red, green and blue.
		// Its three channels are weights over the first three distinct layer materials, and they
		// sum to a constant -- which is what identifies them as weights in the first place.
		const blend = layers.splat ? await load(layers.splat) : null;

		if (blend !== null) {
			blend.wrapS = THREE.RepeatWrapping;
			blend.wrapT = THREE.RepeatWrapping;
		}

		// Each layer's own normal map, in the SAME positions as the colours above. The server
		// pairs them by the register order its shaders bind them in -- not by the order they
		// appear in, which for MP_001 is the reverse.
		const byLayer = layers.normalByLayer || [];
		const normals = await Promise.all(
			Array.from({ length: Math.min(loaded.length, MAX_LAYERS) },
				(unused, i) => (byLayer[i] ? load(byLayer[i] as string, true)
					: Promise.resolve(null))));

		// Distinct materials, in binding order: channel 0 -> first, 1 -> second, 2 -> third. The
		// normal travels WITH its material through the dedup, so a material and its relief cannot
		// come apart here.
		const materials: THREE.Texture[] = [];
		const relief: Array<THREE.Texture | null> = [];

		for (let i = 0; i < loaded.length; i++) {
			const texture = loaded[i];

			if (texture !== null && materials.indexOf(texture) < 0) {
				materials.push(texture);
				relief.push(normals[i] || null);
			}
		}

		for (const texture of relief) {
			if (texture !== null) {
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
			}
		}

		// Break-up. A 32 m tile repeats visibly from head height whatever is painted on it, and
		// these are what the engine hides that with: a greyscale field at a scale much larger than
		// the tile, and a fine normal at a scale much smaller.
		const details = layers.detail || [];
		const greySource = details.find((d) => d.kind === 'grey') || null;
		const bumpSource = details.find((d) => d.kind === 'normal') || null;
		const [grey, bump] = await Promise.all([
			greySource ? load(greySource.resource, true) : Promise.resolve(null),
			bumpSource ? load(bumpSource.resource, true) : Promise.resolve(null)
		]);

		for (const texture of [grey, bump]) {
			if (texture !== null) {
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
			}
		}

		// WHICH channels of the packed detail normal carry its two axes -- measured server-side,
		// because they are not the ones the name suggests: MP_001's `Noise_N` keeps X in red and Y
		// in ALPHA, with green and blue flat padding (spread 3.8 and 1.2 against 17.9 and 25.2).
		const axes = bumpSource && bumpSource.channels.length === 2 ? bumpSource.channels : [0, 1];

		console.log('Rime: terrain normals ' + relief.filter((t) => t !== null).length + '/'
			+ materials.length + ' materials, detail '
			+ (grey !== null ? 'grey' : '-') + '/' + (bump !== null ? 'normal' : '-'));

		// The level's own tiling, from the terrain's samples-per-metre and the texture it is
		// actually painted with, rather than a constant.
		const perMetre = layers.samplesPerMeter || 0;
		const width = base !== null && base.image ? base.image.width : 0;
		const tile = perMetre > 0 && width > 0 ? width / perMetre : TILE_FALLBACK_METRES;

		console.log('Rime: terrain tiles every ' + tile.toFixed(1) + ' m (' + width + 'px at '
			+ perMetre + ' samples/m)');

		const splat = TerrainMaterial.splat(extent, terrain);
		const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

		material.onBeforeCompile = (shader) => {
			for (let i = 0; i < MAX_LAYERS; i++) {
				shader.uniforms['uLayer' + i] = { value: loaded[i] || base };
			}

			shader.uniforms.uSplat = { value: splat };
			shader.uniforms.uHasSplat = { value: splat === null ? 0 : 1 };
			shader.uniforms.uBlend = { value: blend };
			shader.uniforms.uHasBlend = { value: blend === null ? 0 : 1 };

			for (let i = 0; i < 3; i++) {
				const pick = Math.min(i, materials.length - 1);

				shader.uniforms['uMat' + i] = { value: materials[pick] || base };
				// A material with no normal of its own must stay FLAT rather than borrow a
				// neighbour's: the mask below is what keeps its share of the blend at (0,0,1).
				shader.uniforms['uNrm' + i] = { value: relief[pick] || bump || grey || base };
			}

			shader.uniforms.uNrmMask = { value: new THREE.Vector3(
				relief[0] ? 1 : 0,
				relief[Math.min(1, materials.length - 1)] ? 1 : 0,
				relief[Math.min(2, materials.length - 1)] ? 1 : 0) };
			shader.uniforms.uGrey = { value: grey };
			shader.uniforms.uHasGrey = { value: grey === null ? 0 : 1 };
			shader.uniforms.uBump = { value: bump };
			shader.uniforms.uHasBump = { value: bump === null ? 0 : 1 };
			shader.uniforms.uBumpTile = { value: DETAIL_NORMAL_METRES };
			shader.uniforms.uGreyTile = { value: tile * DETAIL_GREY_TILE_MULTIPLE };
			shader.uniforms.uBumpStrength = { value: DETAIL_NORMAL_STRENGTH };
			shader.uniforms.uGreyStrength = { value: DETAIL_GREY_STRENGTH };
			shader.uniforms.uNormalStrength = { value: NORMAL_STRENGTH };
			// BF3 authors normal maps DirectX-style, green pointing down, so the bitangent term is
			// negated. Kept as a uniform rather than a constant: it is a convention, it is the one
			// thing here a level could differ on, and flipping it is how you tell which way round
			// it is without a rebuild.
			shader.uniforms.uFlipY = { value: -1 };
			// A window on what the blend is actually feeding the lighting. 0 draws the ground; 1
			// paints the blended tangent normal, 2 the material weights, 3 the detail normal
			// alone. Set from the console -- the numbers this file turns on cannot be checked any
			// other way, and reading them off a lit surface is guesswork.
			shader.uniforms.uDebug = { value: 0 };
			shader.uniforms.uLayers = { value: MAX_LAYERS };
			shader.uniforms.uExtent = { value: new THREE.Vector4(extent[0], extent[1], extent[2], extent[3]) };
			shader.uniforms.uTile = { value: tile };

			// Kept so the ground can be interrogated from the console: which textures ended up
			// bound, and what each strength is worth. Every constant in here is a judgement call,
			// and this is what lets one be turned and MEASURED rather than argued about.
			material.userData.terrain = shader;

			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
				.replace('#include <begin_vertex>',
					'#include <begin_vertex>\nvTerrainWorld = (modelMatrix * vec4(position, 1.0)).xyz;');

			const declarations = ['#include <common>', 'varying vec3 vTerrainWorld;'];

			for (let i = 0; i < MAX_LAYERS; i++) {
				declarations.push('uniform sampler2D uLayer' + i + ';');
			}

			declarations.push('uniform sampler2D uBlend;', 'uniform int uHasBlend;',
				'uniform sampler2D uMat0;', 'uniform sampler2D uMat1;', 'uniform sampler2D uMat2;');
			declarations.push('uniform sampler2D uNrm0;', 'uniform sampler2D uNrm1;',
				'uniform sampler2D uNrm2;', 'uniform vec3 uNrmMask;',
				'uniform sampler2D uGrey;', 'uniform int uHasGrey;',
				'uniform sampler2D uBump;', 'uniform int uHasBump;',
				'uniform float uBumpTile;', 'uniform float uGreyTile;',
				'uniform float uBumpStrength;', 'uniform float uGreyStrength;',
				'uniform float uNormalStrength;', 'uniform float uFlipY;', 'uniform int uDebug;');
			declarations.push('uniform sampler2D uSplat;', 'uniform int uHasSplat;',
				'uniform int uLayers;', 'uniform vec4 uExtent;', 'uniform float uTile;');

			const pick = ['vec4 terrainOf(float index, vec2 uv) {'];

			for (let i = 0; i < MAX_LAYERS; i++) {
				pick.push('  if (index < ' + (i + 0.5).toFixed(1) + ') return texture2D(uLayer' + i + ', uv);');
			}

			pick.push('  return texture2D(uLayer0, uv);', '}');

			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', declarations.concat(pick, [
					// The tangent frame, built from the UV mapping rather than from screen-space
					// derivatives.
					//
					// three's own perturbNormal2Arb takes the derivatives of `vUv`, and the ground
					// is not textured through `vUv` at all -- it is textured by WORLD POSITION.
					// Those derivatives are zero, the determinant is zero, and the function's own
					// guard then returns the geometric normal: normal mapping that compiles, runs,
					// and does nothing. So the frame is derived instead from what the mapping
					// actually is. u runs along world +X and v along world +Z, both by a positive
					// constant, which makes the tangent and bitangent those two axes exactly --
					// no derivatives, and exact rather than approximate.
					'vec3 terrainNormal(vec3 geometric, vec3 mapN, float flipY) {',
					'  vec3 t = mat3(viewMatrix) * vec3(1.0, 0.0, 0.0);',
					'  vec3 b = mat3(viewMatrix) * vec3(0.0, 0.0, 1.0);',
					// Gram-Schmidt against the geometric normal: on a slope the world axes are not
					// in the surface, and an unorthogonalised frame tilts the relief downhill.
					'  t = normalize(t - geometric * dot(geometric, t));',
					'  b = normalize(b - geometric * dot(geometric, b) - t * dot(t, b));',
					'  return normalize(t * mapN.x + b * (mapN.y * flipY) + geometric * mapN.z);',
					'}'
				]).join('\n'))
				.replace('#include <map_fragment>', [
					'vec2 terrainUv = vTerrainWorld.xz / uTile;',
					// The blend weights, hoisted to the top of main: the NORMALS below are blended
					// by the same weights as the colours, and a weight computed inside the colour
					// block would not survive to them. Defaults to all of material 0, which is
					// what a level with no blend map draws.
					'vec3 terrainWeights = vec3(1.0, 0.0, 0.0);',
					'vec4 ground = texture2D(uLayer0, terrainUv);',
					'if (uHasSplat == 1) {',
					'  vec2 splatUv = (vTerrainWorld.xz - uExtent.xy) / uExtent.zw;',
					// The index is stored as a byte scaled to 0..1; bring it back and round to the
					// layer it names.
					'  float index = floor(texture2D(uSplat, splatUv).r * 255.0 + 0.5);',
					'  ground = terrainOf(min(index, float(uLayers - 1)), terrainUv);',
					'}',
					// Weighted blend of the materials, which is what the engine draws. The
					// index path above stays as the answer for a level with no blend map.
					'if (uHasBlend == 1) {',
					'  vec3 w = texture2D(uBlend, terrainUv).rgb;',
					'  float total = w.r + w.g + w.b;',
					'  if (total > 0.001) {',
					'    terrainWeights = w / total;',
					'    ground = vec4(texture2D(uMat0, terrainUv).rgb * terrainWeights.r',
					'                + texture2D(uMat1, terrainUv).rgb * terrainWeights.g',
					'                + texture2D(uMat2, terrainUv).rgb * terrainWeights.b, 1.0);',
					'  }',
					'}',
					// Macro break-up. The materials repeat every uTile metres and nothing about a
					// per-texel blend hides that, because the blend map repeats on exactly the
					// same period. This is the one thing bound to the terrain that does not: a
					// greyscale field sampled at a scale deliberately not a multiple of the tile,
					// so the two patterns do not come back into step.
					'if (uHasGrey == 1) {',
					'  float macro = texture2D(uGrey, vTerrainWorld.xz / uGreyTile).r;',
					// Centred on the field's own mean, so the ground gets no darker or lighter
					// overall -- only less uniform.
					'  ground.rgb *= 1.0 + (macro - 0.5) * uGreyStrength;',
					'}',
					'diffuseColor *= vec4(ground.rgb, 1.0);',
				].join('\n'))
				.replace('#include <normal_fragment_maps>', [
					// Per-material relief, blended by the SAME weights as the colours above. This
					// is the difference between ground and a photograph of ground: the colour
					// blend alone is lit as a flat plane, so every grain and stone in the textures
					// is painted rather than shaped, and the light never catches on any of it.
					'vec3 terrainMapN = vec3(0.0, 0.0, 1.0);',
					'if (uHasBlend == 1 || uNrmMask.x > 0.5) {',
					'  vec3 n0 = texture2D(uNrm0, terrainUv).xyz * 2.0 - 1.0;',
					'  vec3 n1 = texture2D(uNrm1, terrainUv).xyz * 2.0 - 1.0;',
					'  vec3 n2 = texture2D(uNrm2, terrainUv).xyz * 2.0 - 1.0;',
					// mix against flat rather than skipping the term: a material that ships no
					// normal contributes its share of FLAT, so its weight still counts and the
					// blend stays normalised. Dropping the term instead would let the materials
					// that do have normals dominate wherever one that does not is painted.
					'  terrainMapN = mix(vec3(0.0, 0.0, 1.0), n0, uNrmMask.x) * terrainWeights.r',
					'             + mix(vec3(0.0, 0.0, 1.0), n1, uNrmMask.y) * terrainWeights.g',
					'             + mix(vec3(0.0, 0.0, 1.0), n2, uNrmMask.z) * terrainWeights.b;',
					'  terrainMapN.xy *= uNormalStrength;',
					'}',
					// Fine break-up, at a scale far below the tile. Added in the tangent plane
					// (the cheap half of a whiteout blend) rather than composed as a rotation:
					// these are shallow, and at shallow angles the two agree.
					'if (uHasBump == 1) {',
					'  vec4 packed = texture2D(uBump, vTerrainWorld.xz / uBumpTile);',
					'  vec2 fine = vec2(packed[' + axes[0] + '], packed[' + axes[1]
						+ ']) * 2.0 - 1.0;',
					'  terrainMapN.xy += fine * uBumpStrength;',
					'}',
					'vec3 terrainDebug = terrainMapN;',
					'normal = terrainNormal(normal, normalize(terrainMapN), uFlipY);',
				].join('\n'))
				.replace('#include <output_fragment>', [
					'#include <output_fragment>',
					'if (uDebug == 1) gl_FragColor = vec4(normalize(terrainDebug) * 0.5 + 0.5, 1.0);',
					'if (uDebug == 2) gl_FragColor = vec4(terrainWeights, 1.0);',
					'if (uDebug == 3) gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);',
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

		// RedFormat, not LuminanceFormat: LUMINANCE is a legacy unsized format that WebGL2 does
		// not accept as an internal format, so the upload silently yields nothing usable and every
		// texel reads back as a garbage index -- which makes terrainOf() pick an arbitrary layer
		// per texel and mottles the ground in colours no single layer texture contains.
		const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);

		// Nearest: these are indices, and interpolating them names layers that are not there.
		texture.magFilter = THREE.NearestFilter;
		texture.minFilter = THREE.NearestFilter;
		texture.needsUpdate = true;

		return texture;
	}
}
