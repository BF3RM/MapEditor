/**
 * Builds the editor's object tree from real EBX, walking a level the way the engine does.
 *
 *     LevelData (a partition's primary instance)
 *       .Objects[] -> WorldPartReferenceObjectData / SubWorldReferenceObjectData
 *            .Blueprint -> another partition, whose primary instance is a WorldPartData/SubWorldData
 *               .Objects[] -> ReferenceObjectData (the placed props)
 *
 * Output is `SpawnedGameObject` command-action results in exactly the shape the ext sends, so the
 * whole existing pipeline (Editor.onSpawnedGameObject, the hierarchy tree, the inspector) works
 * unchanged.
 *
 * EMIT ORDER IS A CONTRACT. VEXT.HandleResponse clears `executing` on the batch's LAST element,
 * and HierarchyComponent can only attach a node whose parent is already in the tree or in the same
 * batch. So each subtree goes out as one batch, children first and root last. Emitting objects
 * loosely instead puts every one of them under the flat "Vanilla" bucket -- the exact bug fixed
 * in-game by commit d1932d0e.
 */

import { WebXSource, EbxInstance, EbxRef } from '@/script/modules/WebXSource';
import { GAMEOBJECT_ORIGIN, REALM } from '@/script/types/Enums';

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/** Blueprint type used for placed props. The real type needs the blueprint's own partition, which
 * would be thousands of extra fetches for a level; the inspector can fill it in on selection. */
const DEFAULT_BLUEPRINT_TYPE = 'ObjectBlueprint';

interface Node {
	guid: string;
	name: string;
	blueprintType: string;
	blueprintRef: EbxRef | null;
	transform: any;
	variation: number;
	children: Node[];
}

/** Strip EBX's `{ $type, $value }` boxing, all the way down. */
function unwrap(field: any): any {
	if (field === null || field === undefined) {
		return null;
	}

	if (typeof field !== 'object') {
		return field;
	}

	if ('$value' in field) {
		return unwrap(field.$value);
	}

	if (Array.isArray(field)) {
		return field.map(unwrap);
	}

	const out: Record<string, any> = {};

	for (const key of Object.keys(field)) {
		out[key] = unwrap(field[key]);
	}

	return out;
}

function refsOf(instance: EbxInstance, fieldName: string): EbxRef[] {
	const field = instance.$fields[fieldName];

	if (field === undefined || field === null || !Array.isArray(field.$value)) {
		return [];
	}

	// A dump can carry null entries for references it could not resolve; they are not errors.
	return field.$value.filter((ref: any) => ref !== null && ref !== undefined && ref.$partitionGuid !== undefined);
}

function stringOf(instance: EbxInstance, fieldName: string): string | null {
	const field = instance.$fields[fieldName];
	const value = field === undefined || field === null ? null : field.$value;

	return typeof value === 'string' && value.length > 0 ? value : null;
}

function refOf(instance: EbxInstance, fieldName: string): EbxRef | null {
	const field = instance.$fields[fieldName];
	const value = field === undefined || field === null ? null : field.$value;

	return value !== null && value !== undefined && value.$partitionGuid !== undefined ? value : null;
}

/** EBX names the first basis vector `right`; the editor's LinearTransform calls it `left`. */
function transformOf(instance: EbxInstance): any {
	const raw = unwrap(instance.$fields.BlueprintTransform);
	const zero = { x: 0, y: 0, z: 0 };

	if (raw === null) {
		return { left: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: 1 }, trans: zero };
	}

	return {
		left: raw.right ?? { x: 1, y: 0, z: 0 },
		up: raw.up ?? { x: 0, y: 1, z: 0 },
		forward: raw.forward ?? { x: 0, y: 0, z: 1 },
		trans: raw.trans ?? zero
	};
}

/** Only reference objects are editor objects. A worldpart also holds terrain, emitters and other
 * entity data, which have no blueprint or transform and are not placed objects. */
function isReferenceObject(instance: EbxInstance): boolean {
	return instance.$fields.BlueprintTransform !== undefined || instance.$fields.Blueprint !== undefined;
}

function isGroup(instance: EbxInstance): boolean {
	return instance.$type === 'WorldPartReferenceObjectData' || instance.$type === 'SubWorldReferenceObjectData';
}

export class LevelLoader {
	private source: WebXSource;

	public constructor(source: WebXSource) {
		this.source = source;
	}

	/**
	 * Walk `levelPath` and hand finished subtrees to `emit`, one batch per top-level object, as
	 * they arrive -- so the tree fills progressively instead of after the whole level.
	 *
	 * Returns the number of objects emitted.
	 */
	public async load(levelPath: string, emit: (batch: any[]) => void): Promise<number> {
		const partition = await this.source.partitionByPath(levelPath);

		if (partition === null) {
			throw new Error('WebX: no partition for level "' + levelPath + '"');
		}

		const level = this.source.primaryInstance(partition);

		if (level === null) {
			throw new Error('WebX: "' + levelPath + '" has no primary instance');
		}

		let emitted = 0;

		for (const ref of refsOf(level, 'Objects')) {
			const node = await this.buildNode(ref);

			if (node === null) {
				continue;
			}

			const batch: any[] = [];
			this.flatten(node, EMPTY_GUID, 'LevelData', partition.$primaryInstance, partition.$guid, batch);

			if (batch.length > 0) {
				emit(batch);
				emitted += batch.length;
			}
		}

		return emitted;
	}

	private async buildNode(ref: EbxRef): Promise<Node | null> {
		const instance = await this.source.instance(ref);

		if (instance === null || !isReferenceObject(instance)) {
			return null;
		}

		const blueprintRef = refOf(instance, 'Blueprint');
		const node: Node = {
			guid: instance.$guid,
			name: this.nameFor(blueprintRef, instance),
			blueprintType: DEFAULT_BLUEPRINT_TYPE,
			blueprintRef,
			transform: transformOf(instance),
			variation: 0,
			children: []
		};

		// Descend into worldparts and subworlds only. Placed props reference prefab blueprints whose
		// contents are whole partitions of their own; expanding every one is thousands of fetches
		// for a level, so prefab internals stay collapsed for now (they can be fetched when a node
		// is expanded). This is why browser depth is shallower than the in-game tree.
		if (!isGroup(instance)) {
			return node;
		}

		// A worldpart points at its content with a Blueprint reference. A SUBWORLD does not -- its
		// Blueprint is null and it names its partition in BundleName ("Levels/MP_001/Conquest")
		// instead. Without this the eight gamemode subworlds of a BF3 map load as empty nodes.
		const bundle = stringOf(instance, 'BundleName');
		let target = null;
		let targetInstanceGuid = null;

		if (blueprintRef !== null) {
			target = await this.source.partition(blueprintRef.$partitionGuid);
			targetInstanceGuid = blueprintRef.$instanceGuid;
		} else if (bundle !== null) {
			target = await this.source.partitionByPath(bundle);
			targetInstanceGuid = target === null ? null : target.$primaryInstance;
		}

		if (target === null || targetInstanceGuid === null) {
			return node;
		}

		const group = this.source.instanceIn(target, targetInstanceGuid) ?? this.source.primaryInstance(target);

		if (group === null) {
			return node;
		}

		node.blueprintType = group.$type;

		if (node.blueprintRef === null) {
			node.blueprintRef = { $instanceGuid: group.$guid, $partitionGuid: target.$guid };
			node.name = (bundle as string).split('/').pop() as string;
		}

		for (const childRef of refsOf(group, 'Objects')) {
			const child = await this.buildNode(childRef);

			if (child !== null) {
				node.children.push(child);
			}
		}

		return node;
	}

	/** Depth-first, children before their parent -- the order the tree builder's flush expects. */
	private flatten(
		node: Node,
		parentGuid: string,
		parentTypeName: string,
		parentPrimaryInstanceGuid: string,
		parentPartitionGuid: string,
		out: any[]
	): void {
		for (const child of node.children) {
			this.flatten(
				child,
				node.guid,
				node.blueprintType,
				node.blueprintRef === null ? EMPTY_GUID : node.blueprintRef.$instanceGuid,
				node.blueprintRef === null ? EMPTY_GUID : node.blueprintRef.$partitionGuid,
				out
			);
		}

		const ctrRef = {
			typeName: node.blueprintType,
			name: node.name,
			partitionGuid: node.blueprintRef === null ? EMPTY_GUID : node.blueprintRef.$partitionGuid,
			instanceGuid: node.blueprintRef === null ? EMPTY_GUID : node.blueprintRef.$instanceGuid
		};

		out.push({
			sender: 'WebX',
			type: 'SpawnedGameObject',
			gameObjectTransferData: {
				guid: node.guid,
				name: node.name,
				parentData: {
					guid: parentGuid,
					typeName: parentTypeName,
					primaryInstanceGuid: parentPrimaryInstanceGuid,
					partitionGuid: parentPartitionGuid
				},
				blueprintCtrRef: ctrRef,
				originalRef: ctrRef,
				transform: node.transform,
				variation: node.variation,
				// No entities exist without a game: the editor renders these from the transform
				// alone until meshes arrive.
				gameEntities: [],
				isDeleted: false,
				isEnabled: true,
				isUserModified: false,
				origin: GAMEOBJECT_ORIGIN.VANILLA,
				overrides: [],
				realm: REALM.CLIENT_AND_SERVER,
				isPlaceholder: false
			}
		});
	}

	private nameFor(blueprintRef: EbxRef | null, instance: EbxInstance): string {
		if (blueprintRef !== null) {
			const path = this.source.pathForPartition(blueprintRef.$partitionGuid);

			if (path !== undefined) {
				return path.split('/').pop() as string;
			}
		}

		return instance.$type;
	}
}
