/**
 * Draws the level's roads.
 *
 * BF3 does not model roads as meshes: Levels/<Map>/TerrainDecals holds one RoadData per road,
 * which is a ribbon painted onto the terrain -- a centreline (Points), a half width either side at
 * each cross-section (RibbonPoints Left/Right), and how often the texture repeats along the run
 * (UvTileFactor). mesh_server reads that out of plain EBX and serves it as /roads/<level>.json.
 *
 * Standalone the engine is not there to paint them, so they are built as thin strips laid just
 * above the terrain. Without this the ground is bare where the map's road network should be, which
 * is most of a city level.
 */

import * as THREE from 'three';

interface Ribbon {
	points: number[][];
	widths: number[][];
	uvTile: number;
	stick: boolean;
	order: number;
}

/** Lifted off the terrain so the strip wins the depth test instead of z-fighting it. */
const LIFT = 0.06;

export class RoadRibbons {
	private base: string;
	private level: string;
	private group: THREE.Group | null = null;

	public constructor(level: string, base = '/meshes') {
		this.level = level.replace(/\/$/, '').split('/').pop() as string;
		this.base = base;
	}

	/** Returns how many roads were drawn. */
	public async load(material: THREE.Material): Promise<number> {
		let ribbons: Ribbon[];

		try {
			const response = await fetch(this.base + '/roads/' + this.level + '.json');

			if (!response.ok) {
				return 0;
			}

			ribbons = ((await response.json()).roads || []) as Ribbon[];
		} catch (e) {
			return 0;
		}

		if (ribbons.length === 0) {
			return 0;
		}

		const group = new THREE.Group();
		group.name = 'roads';
		let drawn = 0;

		// Drawn back to front by the order the level gives them, so an overlapping road covers the
		// one it is meant to cover rather than fighting it.
		for (const ribbon of ribbons.slice().sort((a, b) => (a.order || 0) - (b.order || 0))) {
			const mesh = RoadRibbons.build(ribbon, material);

			if (mesh !== null) {
				group.add(mesh);
				drawn++;
			}
		}

		(window as any).editor.threeManager.scene.add(group);
		this.group = group;

		return drawn;
	}

	public dispose(): void {
		if (this.group === null) {
			return;
		}

		(window as any).editor.threeManager.scene.remove(this.group);
		this.group = null;
	}

	/**
	 * One ribbon as a triangle strip.
	 *
	 * The centreline carries only the spline's CONTROL points -- a straight road has two -- while
	 * the widths are given per cross-section, twenty of them on that same road. So the line is
	 * resampled to however many cross-sections there are, and each one is pushed out to its own
	 * left and right half width.
	 */
	private static build(ribbon: Ribbon, material: THREE.Material): THREE.Mesh | null {
		const spine = (ribbon.points || []).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
		const widths = ribbon.widths || [];

		if (spine.length < 2 || widths.length < 2) {
			return null;
		}

		const curve = new THREE.CatmullRomCurve3(spine, false, 'catmullrom', 0.5);
		const samples = curve.getSpacedPoints(widths.length - 1);

		const position: number[] = [];
		const uv: number[] = [];
		const index: number[] = [];
		const tile = ribbon.uvTile > 0 ? ribbon.uvTile : 1;
		let run = 0;

		for (let i = 0; i < samples.length; i++) {
			const here = samples[i];
			const ahead = samples[Math.min(i + 1, samples.length - 1)];
			const behind = samples[Math.max(i - 1, 0)];

			// Flat perpendicular: the ribbon lies on the ground, so the width goes across the
			// direction of travel in the XZ plane and never tips with the slope.
			const dir = new THREE.Vector3().subVectors(ahead, behind);
			dir.y = 0;

			if (dir.lengthSq() < 1e-8) {
				dir.set(1, 0, 0);
			}

			dir.normalize();

			const side = new THREE.Vector3(-dir.z, 0, dir.x);
			const w = widths[Math.min(i, widths.length - 1)];
			const left = w[0];
			const right = w[1];

			if (i > 0) {
				run += here.distanceTo(samples[i - 1]);
			}

			position.push(
				here.x + side.x * left, here.y + LIFT, here.z + side.z * left,
				here.x + side.x * right, here.y + LIFT, here.z + side.z * right
			);

			const v = run / tile;
			uv.push(0, v, 1, v);

			if (i > 0) {
				const a = (i - 1) * 2;
				index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		geometry.setIndex(index);
		geometry.computeVertexNormals();

		const mesh = new THREE.Mesh(geometry, material);
		mesh.name = 'road';

		return mesh;
	}
}
