import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { AxisAlignedBoundingBox } from '@/script/types/AxisAlignedBoundingBox';

export class GameEntityData {
	public instanceId: number;
	public indexInBlueprint: number;
	public typeName: string;
	public isSpatial: boolean;
	public transform: LinearTransform;
	public aabb: AxisAlignedBoundingBox;

	constructor(instanceId: number, indexInBlueprint: number, typeName: string, isSpatial: boolean, transform: LinearTransform, aabb: AABB) {
		this.instanceId = instanceId;
		this.indexInBlueprint = indexInBlueprint;
		this.typeName = typeName;
		this.isSpatial = isSpatial;
		this.transform = transform;
		this.aabb = aabb;
	}

	public setFromTable(table: any) {
		this.instanceId = table.instanceId;
		this.indexInBlueprint = table.indexInBlueprint;
		this.typeName = table.typeName;
		this.isSpatial = table.isSpatial;
		if (table.isSpatial) {
			this.transform = new LinearTransform().setFromTable(table.transform);
			this.aabb = AxisAlignedBoundingBox.FromTable(table.aabb);
		}
		return this;
	}
}
