import {Guid} from 'guid-typescript';

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

	public setFromTable(table: any) {
		this.guid = table.guid;
		this.typeName = table.typeName;
		this.primaryInstanceGuid = table.primaryInstanceGuid;
		this.partitionGuid = table.partitionGuid;

		return this;
	}
}
