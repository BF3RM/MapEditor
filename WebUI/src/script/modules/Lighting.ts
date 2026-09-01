/**
 * Lights the scene from the level's own VisualEnvironment instead of a made-up rig.
 *
 * A level's OutdoorLightComponentData carries the sun's colour and angles and the sky/ground
 * ambient colours -- the same values the game lights with. Reading them is what makes a browser
 * render look like the map rather than like a viewer.
 */

import * as THREE from 'three';
import { WebXSource } from '@/script/modules/WebXSource';

const DEG = Math.PI / 180;

function colour(field: any): THREE.Color | null {
	const value = field === undefined || field === null ? null : field.$value;

	if (value === null || value === undefined || value.x === undefined) {
		return null;
	}

	return new THREE.Color(value.x.$value, value.y.$value, value.z.$value);
}

function scalar(field: any, fallback: number): number {
	const value = field === undefined || field === null ? null : field.$value;

	return typeof value === 'number' ? value : fallback;
}

export class Lighting {
	private source: WebXSource;

	public constructor(source: WebXSource) {
		this.source = source;
	}

	/** Replaces the placeholder rig with the level's own. Returns false if the level has no VE. */
	public async apply(levelPath: string): Promise<boolean> {
		const outdoor = await this.outdoorLight(levelPath);

		if (outdoor === null) {
			return false;
		}

		const three = (window as any).editor.threeManager;
		const scene = three.scene;

		three.renderer.shadowMap.enabled = true;
		three.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		const existing = scene.getObjectByName('standalone-lighting');

		if (existing !== undefined) {
			scene.remove(existing);
		}

		const sun = colour(outdoor.$fields.SunColor) || new THREE.Color(1, 0.96, 0.9);
		const sky = colour(outdoor.$fields.SkyColor) || new THREE.Color(0.7, 0.8, 1);
		const ground = colour(outdoor.$fields.GroundColor) || new THREE.Color(0.2, 0.2, 0.18);

		// SunRotationX is the compass angle, SunRotationY the height above the horizon.
		const azimuth = scalar(outdoor.$fields.SunRotationX, 150) * DEG;
		const elevation = scalar(outdoor.$fields.SunRotationY, 30) * DEG;

		const rig = new THREE.Group();
		rig.name = 'standalone-lighting';

		const light = new THREE.DirectionalLight(sun, 2.2);

		// One sun casting over the whole level. The ortho box is sized from the map rather than
		// guessed: BF3 levels are a kilometre across and a default shadow camera covers metres.
		light.castShadow = true;
		light.shadow.mapSize.set(4096, 4096);
		light.shadow.camera.near = 1;
		light.shadow.camera.far = 12000;
		// Big enough for the whole map, which is the point.
		//
		// At 400 metres this covered a fraction of MP_017's 8 km of ground, and everything past the
		// box sampled the shadow map's clamped edge texels -- drawing the edge's light-and-dark
		// pattern across the hillsides as stripes that looked like broken terrain LOD. Trading
		// shadow resolution for covering the level is the right way round: the stripes were the
		// most visible thing on the map.
		const extent = 4200;

		light.shadow.camera.left = -extent;
		light.shadow.camera.right = extent;
		light.shadow.camera.top = extent;
		light.shadow.camera.bottom = -extent;
		light.shadow.bias = -0.0006;
		// Depth bias alone is measured in the shadow map's own units, so on ground that spans
		// kilometres per texel it leaves the surface striped with its own shadow -- which is what
		// banded MP_017's hillsides. normalBias offsets along the surface normal in WORLD units,
		// which is the scale the error actually has here.
		light.shadow.normalBias = 1.5;

		// Far enough out that the shadow camera's near plane clears the terrain: a BF3 map is
		// kilometres across, and a sun 500 m away sits inside the level it is meant to light.
		light.position.set(
			Math.cos(elevation) * Math.sin(azimuth) * 5000,
			Math.sin(elevation) * 5000,
			Math.cos(elevation) * Math.cos(azimuth) * 5000
		);

		rig.add(light);
		rig.add(new THREE.HemisphereLight(sky, ground, 1.1));
		scene.add(rig);

		(window as any).editor.threeManager.setPendingRender();

		return true;
	}

	/**
	 * The level's sky, as an environment map.
	 *
	 * Distant geometry -- backdrop houses above all -- carries no texture binding anywhere: no
	 * MeshVariationDatabase parameters, no material parameters, and a shader (MP001_SS_BBox_01_WET)
	 * that declares neither streamable nor external textures. "SS_BBox" is a box-projected shader,
	 * and the VisualEnvironment is what holds its pixels: PanoramicTexture and StaticEnvmapTexture.
	 * Binding the panorama as the scene environment is what stops those surfaces rendering white.
	 */
	public async environment(levelPath: string, load: (resource: string) => Promise<any>): Promise<boolean> {
		const sky = await this.component(levelPath, 'SkyComponentData');

		if (sky === null) {
			return false;
		}

		for (const name of ['PanoramicTexture', 'SkyGradientTexture']) {
			const reference = (sky.$fields[name] || {}).$value;

			if (reference === null || reference === undefined || reference.$partitionGuid === undefined) {
				continue;
			}

			const resource = this.source.pathForPartition(reference.$partitionGuid);

			if (resource === undefined) {
				continue;
			}

			const texture = await load(resource);

			if (texture !== null && texture !== undefined) {
				const three = (window as any).editor.threeManager;

				texture.mapping = THREE.EquirectangularReflectionMapping;
				three.scene.environment = texture;
				three.setPendingRender();

				return true;
			}
		}

		return false;
	}

	/** The level's OutdoorLightComponentData, found through its VisualEnvironment objects. */
	private async outdoorLight(levelPath: string): Promise<any | null> {
		return this.component(levelPath, 'OutdoorLightComponentData');
	}

	private async component(levelPath: string, type: string): Promise<any | null> {
		const partition = await this.source.partitionByPath(levelPath);

		if (partition === null) {
			return null;
		}

		const level = this.source.primaryInstance(partition);
		const objects = level === null ? null : level.$fields.Objects;
		const references = objects && Array.isArray(objects.$value) ? objects.$value : [];

		for (const reference of references) {
			if (reference === null || reference.$partitionGuid === undefined) {
				continue;
			}

			const instance = await this.source.instance(reference);

			if (instance === null || instance.$type !== 'VisualEnvironmentReferenceObjectData') {
				continue;
			}

			const blueprint = (instance.$fields.Blueprint || {}).$value;

			if (blueprint === null || blueprint === undefined) {
				continue;
			}

			const target = await this.source.partition(blueprint.$partitionGuid);

			if (target === null) {
				continue;
			}

			// A level carries several environments (indoor, rain); the first outdoor one is the
			// daylight the map is lit by.
			for (const candidate of target.$instances) {
				if (candidate.$type === type) {
					return candidate;
				}
			}
		}

		return null;
	}
}
