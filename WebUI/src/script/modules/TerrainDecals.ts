/**
 * Draws the level's BAKED terrain decals.
 *
 * A BF3 level's road network reaches the disc as geometry, not as splines. `RoadData` -- the
 * centrelines and half-widths `RoadRibbons` rebuilds ribbons from -- is the AUTHORING form. What
 * the engine actually draws is a `.decals` resource: real triangles, baked against the
 * heightfield, carrying a per-vertex blend weight that fades every edge, end and junction into
 * the ground, in two LODs of the same content:
 *
 *   `2d`  keyed on (x, z) alone, draped onto whatever height the ground has. Drawn far away.
 *   `3d`  carrying its own y, following the terrain. Drawn within Decal3dFarDrawDistance.
 *
 * The difference is not academic. On MP_001 the ribbons resample two-point splines into 109
 * strips; the baked resource holds 29 blocks over 1439 vertices, including the crossings and the
 * tank tracks, which were never ribbons and so were never drawn at all.
 *
 * WHAT IS AND IS NOT IN HERE, measured rather than assumed: MP_001's decals bind exactly three
 * shaders -- Decal_Crossing, RoadLinesWhite and TracksDark. There is NO asphalt among them. Grand
 * Bazaar's road SURFACE is painted by the terrain's own material layers (`TerrainMaterial`), and
 * the decals are the markings laid over it. Other levels do bake their surface here (SP_Villa
 * carries `SP_010_AsphaltRoad_Main2d/3d`, MP_012 an airfield sheet), which is why the compositing
 * below has an opaque case at all.
 */

import * as THREE from 'three';

/** How a group's texture composites, decided server-side by measuring its pixels. */
type Paint = 'alpha' | 'mask' | 'opaque';

interface DecalGroup {
	shader: string;
	texture: string | null;
	normal: string | null;
	paint: Paint;
	indices: number[];
	measured?: Record<string, unknown>;
}

interface DecalGeometry {
	kind: '2d' | '3d' | 'water';
	positions: number[];
	uvs: number[];
	fades: number[];
	groups: DecalGroup[];
}

interface DecalPayload {
	level: string;
	far3d: number;
	near2d: number;
	cellsPerTile: number;
	geometries: DecalGeometry[];
}

/**
 * Lift, in metres, of a decal above the surface it is painted on.
 *
 * The baked y is authored against the SHIPPED heightfield; ours is decoded from the streaming
 * tree and reconstructed as triangles, so the two agree to within a few centimetres rather than
 * exactly. Polygon offset alone does not survive that -- it biases depth, not position -- so the
 * geometry is lifted as well. Small enough not to be visible at a grazing angle.
 */
const LIFT = 0.05;

/**
 * Lift for the flat 2d LOD, which is draped rather than baked.
 *
 * Larger than LIFT for the same reason RoadRibbons needed it: the drape samples the surface
 * bilinearly while the surface is DRAWN as triangles, and across a quad's diagonal the drawn face
 * sits above the bilinear value.
 */
const DRAPE_LIFT = 0.2;

export class TerrainDecals {
	private base: string;
	private level: string;
	private group: THREE.Group | null = null;

	public constructor(level: string, base = '/meshes') {
		this.level = level.replace(/\/$/, '').split('/').pop() as string;
		this.base = base;
	}

	/** Returns how many decal groups were drawn; 0 means the level has no baked decals. */
	public async load(
		load: (resource: string, data?: boolean) => Promise<THREE.Texture | null>,
		height?: (x: number, z: number) => number | null
	): Promise<number> {
		let payload: DecalPayload;

		try {
			const response = await fetch(this.base + '/decals/' + this.level + '.json');

			if (!response.ok) {
				return 0;
			}

			payload = (await response.json()) as DecalPayload;
		} catch (e) {
			return 0;
		}

		// The two LODs are the same content at two tessellations, so drawing both would double
		// every marking's opacity and z-fight it against itself. The conforming one is the better
		// of the two everywhere a camera can stand in an editor, so it wins outright; the flat one
		// is the fallback for a level that bakes only it.
		const geometries = payload.geometries || [];
		const conforming = geometries.find((g) => g.kind === '3d' && g.groups.length > 0);
		const flat = geometries.find((g) => g.kind === '2d' && g.groups.length > 0);
		const chosen = conforming || flat;

		if (chosen === undefined) {
			return 0;
		}

		const draped = chosen.kind === '2d';
		const group = new THREE.Group();
		group.name = 'decals';
		// Painted after the ground, whatever the sorter would otherwise decide from the bounding
		// spheres of two surfaces that occupy the same place.
		group.renderOrder = 2;

		let drawn = 0;

		for (const decals of chosen.groups) {
			const mesh = await this.build(decals, chosen, draped, load, height);

			if (mesh !== null) {
				group.add(mesh);
				drawn++;
			}
		}

		if (drawn === 0) {
			return 0;
		}

		(window as any).editor.threeManager.scene.add(group);
		this.group = group;

		console.log('Rime: ' + drawn + ' baked decal group(s) from the ' + chosen.kind
			+ ' LOD -- ' + chosen.groups.map((g) =>
				(g.texture || '?').split('/').pop() + ':' + g.paint).join(', '));

		return drawn;
	}

	public dispose(): void {
		if (this.group === null) {
			return;
		}

		(window as any).editor.threeManager.scene.remove(this.group);
		this.group = null;
	}

	private async build(
		decals: DecalGroup,
		source: DecalGeometry,
		draped: boolean,
		load: (resource: string, data?: boolean) => Promise<THREE.Texture | null>,
		height?: (x: number, z: number) => number | null
	): Promise<THREE.Mesh | null> {
		if (decals.indices.length === 0) {
			return null;
		}

		// One vertex array serves every group -- the resource indexes into it that way -- so the
		// group's own vertices are gathered rather than the whole array uploaded per group.
		const used = new Map<number, number>();
		const position: number[] = [];
		const uv: number[] = [];
		const fade: number[] = [];
		const index: number[] = [];

		for (const source_index of decals.indices) {
			let local = used.get(source_index);

			if (local === undefined) {
				local = used.size;
				used.set(source_index, local);

				const x = source.positions[source_index * 3];
				const z = source.positions[source_index * 3 + 2];
				let y = source.positions[source_index * 3 + 1];

				// The 2d LOD stores no y at all: it is the LOD the engine drapes, and the ground
				// is where its height comes from.
				if (draped) {
					const ground = height !== undefined ? height(x, z) : null;
					y = (ground === null ? y : ground) + DRAPE_LIFT;
				} else {
					y += LIFT;
				}

				position.push(x, y, z);
				uv.push(source.uvs[source_index * 2], source.uvs[source_index * 2 + 1]);
				fade.push(source.fades[source_index]);
			}

			index.push(local);
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		geometry.setAttribute('decalFade', new THREE.Float32BufferAttribute(fade, 1));
		geometry.setIndex(index);
		geometry.computeVertexNormals();

		const mesh = new THREE.Mesh(geometry,
			await this.material(decals, load));
		mesh.name = 'decal:' + decals.shader.split('/').pop();
		mesh.renderOrder = 2;

		return mesh;
	}

	/**
	 * The material for one decal group.
	 *
	 * The three paint modes are the whole point of this file. `mask` in particular is what stops
	 * MP_001's lane markings rendering as an iridescent stripe: `parkingLines01` is a 64x1024
	 * cut-out whose alpha is a constant 255 and whose COVERAGE is its luminance, drawn bright on
	 * a black field. Its three channels carry independent compression noise (r(R,G)=0.54, each
	 * channel's sd near 96), so painting it as albedo puts that noise on the ground as colour.
	 * Read as coverage it is what it is: a worn white line.
	 */
	private async material(
		decals: DecalGroup,
		load: (resource: string, data?: boolean) => Promise<THREE.Texture | null>
	): Promise<THREE.Material> {
		const paint: Paint = decals.paint || 'alpha';
		// A coverage mask is a scalar field, not colour, so it must not be gamma-decoded on the
		// way in -- the same distinction `loadData` exists for everywhere else.
		const map = decals.texture === null ? null
			: await load(decals.texture, paint === 'mask').catch(() => null);

		if (map !== null) {
			map.wrapS = THREE.RepeatWrapping;
			map.wrapT = THREE.RepeatWrapping;
		}

		const normalMap = decals.normal === null ? null
			: await load(decals.normal, true).catch(() => null);

		if (normalMap !== null) {
			normalMap.wrapS = THREE.RepeatWrapping;
			normalMap.wrapT = THREE.RepeatWrapping;
		}

		const material = new THREE.MeshStandardMaterial({
			color: 0xffffff,
			map,
			roughness: 1.0,
			metalness: 0.0,
			// A decal is a surface laid ON another surface. It has to blend rather than cut out:
			// a crossing's alpha and a marking's coverage are both continuous, and alpha-testing
			// them throws away exactly the soft edge the bake put there.
			transparent: true,
			depthWrite: false,
			// The blend weight fades a decal to nothing at its edges, so half of every group is
			// near-invisible and sorting it against itself is wasted work.
			side: THREE.DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: -4,
			polygonOffsetUnits: -4
		});

		if (normalMap !== null) {
			material.normalMap = normalMap;
		}

		// Without this every decal group shares ONE compiled program.
		//
		// three keys its program cache on the material's PARAMETERS, and three MeshStandardMaterials
		// that differ only in what their onBeforeCompile injects are identical by that key -- so the
		// first group to compile wins and the others silently run its shader. Measured: the masked
		// lane markings rendered through the `alpha` group's shader and kept their per-channel
		// compression noise as colour, which looked exactly like the bug this file exists to fix.
		material.customProgramCacheKey = () => 'terrain-decal-' + paint + (map === null ? '-flat' : '');

		material.onBeforeCompile = (shader) => {
			shader.vertexShader = shader.vertexShader
				.replace('#include <common>',
					'#include <common>\nattribute float decalFade;\nvarying float vDecalFade;')
				.replace('#include <begin_vertex>',
					'#include <begin_vertex>\nvDecalFade = decalFade;');

			// The texture is applied by hand rather than through <map_fragment>, because what the
			// three channels MEAN differs per group and three has one opinion about it.
			const application = paint === 'mask'
				// Mean, not max and not luminance: the noise this texture carries is per-channel
				// and independent, and the mean is what averages it out. Max keeps it.
				? `
	vec4 decalTexel = texture2D( map, vUv );
	float coverage = ( decalTexel.r + decalTexel.g + decalTexel.b ) / 3.0;
	diffuseColor.a *= coverage * vDecalFade;`
				: paint === 'opaque'
					? `
	vec4 decalTexel = texture2D( map, vUv );
	diffuseColor.rgb *= decalTexel.rgb;
	diffuseColor.a *= vDecalFade;`
					: `
	vec4 decalTexel = texture2D( map, vUv );
	diffuseColor.rgb *= decalTexel.rgb;
	diffuseColor.a *= decalTexel.a * vDecalFade;`;

			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', '#include <common>\nvarying float vDecalFade;')
				.replace('#include <map_fragment>',
					map === null ? '\tdiffuseColor.a *= vDecalFade;' : application);

			// Kept reachable so a group's compositing can be interrogated rather than argued
			// about, the same way the terrain's shader is.
			material.userData.decal = { shader, paint, measured: decals.measured };
		};

		return material;
	}
}
