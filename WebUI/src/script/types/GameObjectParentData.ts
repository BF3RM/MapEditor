import { Guid } from 'guid-typescript';

export class GameObjectParentData {
	public guid: Guid;
	public typeName: string;
	public primaryInstanceGuid: Guid;
	public partitionGuid: Guid;

	constructor(guid: Guid = Guid.createEmpty(), typeName: string = '', primaryInstanceGuid: Guid = Guid.createEmpty(), partitionGuid: Guid = Guid.createEmpty()) {
		this.guid = guid;
		this.typeName = typeName;
		this.primaryInstanceGuid = primaryInstanceGuid;
		this.partitionGuid = partitionGuid;
	}

	public static FromTable(table: any) {
		const guid = Guid.parse(table.guid);
		const typeName = table.typeName;
		const primaryInstanceGuid = Guid.parse(table.primaryInstanceGuid);
		const partitionGuid = Guid.parse(table.partitionGuid);

		return new GameObjectParentData(guid, typeName, primaryInstanceGuid, partitionGuid);
	}
}
