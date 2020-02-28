import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';

export class GameEntityData {
	public instanceId: number;
	public indexInBlueprint: number;
	public typeName: string;
	public isSpatial: boolean;
	public transform: LinearTransform;
	public aabb: AxisAlignedBoundingBox;

	constructor(instanceId: number, indexInBlueprint: number, typeName: string, isSpatial: boolean, transform: LinearTransform, aabb: AxisAlignedBoundingBox) {
		this.instanceId = instanceId;
		this.indexInBlueprint = indexInBlueprint;
		this.typeName = typeName;
		this.isSpatial = isSpatial;
		this.transform = transform;
		this.aabb = aabb;
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
		return new GameEntityData(gameEntityDataTable.instanceId,
			gameEntityDataTable.indexInBlueprint,
			gameEntityDataTable.typeName,
			gameEntityDataTable.isSpatial,
			transform,
			AABB);
	}
}
