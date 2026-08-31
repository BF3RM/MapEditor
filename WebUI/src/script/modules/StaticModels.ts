/**
 * Places a level's BAKED statics -- the geometry that EBX alone cannot put on screen.
 *
 * A level's StaticModelGroup holds hundreds of members with an InstanceCount but, for most of
 * them, no InstanceTransforms: the per-instance transforms live in the level's HAVOK physics
 * asset, not in EBX. Walking EBX therefore finds roughly half a map (1862 of ~6200 placements on
 * MP_001) and the rest simply is not there to be found.
 *
 * Rime resolves them (dump_level_placements, which is the same walk its level-mesh export does),
 * and mesh_server serves the result. Its walk covers the WHOLE level though -- worldparts and
 * subworlds included -- so most placements are objects the EBX walk already produced. Those are
 * skipped by matching mesh and position; what remains are the baked statics.
 */

import { WebXSource } from '@/script/modules/WebXSource';
import { MeshManager } from '@/script/modules/MeshManager';
import { GAMEOBJECT_ORIGIN, REALM } from '@/script/types/Enums';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/** Objects per batch. Each batch is one WebUI update; a level is thousands of statics. */
const BATCH = 200;

interface Placements {
	level: string;
	meshes: Record<string, number[][]>;
}

function fileFor(meshPath: string): string {
	return meshPath.replace(/\//g, '_').toLowerCase() + '.glb';
}

/** Deterministic guid from the mesh and its index, so a reload names the same object. */
function staticGuid(index: number): string {
	const hex = (index + 1).toString(16).padStart(12, '0');

	return '5747d000-0000-4000-8000-' + hex;
}

export class StaticModels {
	private source: WebXSource;
	private meshes: MeshManager;

	public constructor(source: WebXSource, meshes: MeshManager) {
		this.source = source;
		this.meshes = meshes;
	}

	/** Returns how many statics were added. */
	public async load(levelPath: string, emit: (batch: any[]) => void): Promise<number> {
		const map = levelPath.replace(/\/$/, '').split('/').pop() as string;
		let placements: Placements;

		try {
			const response = await fetch('/meshes/placements/' + map + '.json');

			if (!response.ok) {
				return 0;
			}

			placements = (await response.json()) as Placements;
		} catch (e) {
			return 0;
		}

		const batch: any[] = [];
		let index = 0;
		let added = 0;

		for (const meshPath of Object.keys(placements.meshes)) {
			const file = fileFor(meshPath);
			const partitionGuid = this.source.guidForPath(meshPath);

			if (partitionGuid === undefined) {
				continue;
			}

			// Teach the mesh layer where this one's geometry lives; the manifest only covers
			// meshes reached through a blueprint.
			this.meshes.register(partitionGuid, file);

			for (const transform of placements.meshes[meshPath]) {
				index++;

				if (this.meshes.isPlaced(file, transform[9], transform[10], transform[11])) {
					continue;
				}

				batch.push(this.toResult(staticGuid(index), meshPath, partitionGuid, transform));
				added++;

				if (batch.length >= BATCH) {
					emit(batch.splice(0, batch.length));
				}
			}
		}

		if (batch.length > 0) {
			emit(batch);
		}

		return added;
	}

	private toResult(guid: string, meshPath: string, partitionGuid: string, t: number[]): any {
		const ctrRef = {
			typeName: 'ObjectBlueprint',
			name: meshPath,
			partitionGuid,
			instanceGuid: EMPTY_GUID
		};

		return {
			sender: 'Rime',
			type: 'SpawnedGameObject',
			gameObjectTransferData: {
				guid,
				name: (meshPath.split('/').pop() as string).replace(/_Mesh$/i, ''),
				// Root-level: these are baked instances, with no parent object of their own.
				parentData: {
					guid: EMPTY_GUID,
					typeName: 'StaticModelGroup',
					primaryInstanceGuid: EMPTY_GUID,
					partitionGuid: EMPTY_GUID
				},
				blueprintCtrRef: ctrRef,
				originalRef: ctrRef,
				transform: {
					left: { x: t[0], y: t[1], z: t[2] },
					up: { x: t[3], y: t[4], z: t[5] },
					forward: { x: t[6], y: t[7], z: t[8] },
					trans: { x: t[9], y: t[10], z: t[11] }
				},
				variation: 0,
				gameEntities: [],
				isDeleted: false,
				isEnabled: true,
				isUserModified: false,
				origin: GAMEOBJECT_ORIGIN.VANILLA,
				overrides: [],
				realm: REALM.CLIENT_AND_SERVER,
				isPlaceholder: false
			}
		};
	}
}
