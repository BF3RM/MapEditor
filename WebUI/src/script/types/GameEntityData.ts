import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';
import { CtrRef } from '@/script/types/CtrRef';

export class GameEntityData {
	public instanceId: number;
	public indexInBlueprint: number;
	public typeName: string;
	public isSpatial: boolean;
	public transform: LinearTransform;
	public aabb: AxisAlignedBoundingBox;
	public initiatorRef: CtrRef;

	constructor(instanceId: number, indexInBlueprint: number, typeName: string, isSpatial: boolean, transform: LinearTransform, aabb: AxisAlignedBoundingBox, initiatorRef: CtrRef) {
		this.instanceId = instanceId;
		this.indexInBlueprint = indexInBlueprint;
		this.typeName = typeName;
		this.isSpatial = isSpatial;
		this.transform = transform;
		this.aabb = aabb;
		this.initiatorRef = initiatorRef;
	}

	public static FromTable(gameEntityDataTable: any) {
		let transform = gameEntityDataTable.transform;
		if (transform !== undefined) {
			transform = LinearTransform.setFromTable(gameEntityDataTable.transform);
		}
		let AABB = gameEntityDataTable.aabb;
		if (AABB !== undefined) {
			AABB = AxisAlignedBoundingBox.FromTable(AABB);
		}
		let initiatorRef = gameEntityDataTable.initiatorRef;
		if (initiatorRef) {
			initiatorRef = new CtrRef().setFromTable(gameEntityDataTable.initiatorRef);
		}
		return new GameEntityData(gameEntityDataTable.instanceId,
			gameEntityDataTable.indexInBlueprint,
			gameEntityDataTable.typeName,
			gameEntityDataTable.isSpatial,
			transform,
			AABB,
			initiatorRef);
	}
}
