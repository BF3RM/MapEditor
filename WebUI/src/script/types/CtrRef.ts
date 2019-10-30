import { Guid } from 'guid-typescript';

export class CtrRef {
	public typeName: string;
	public name: string;
	public partitionGuid: Guid;
	public instanceGuid: Guid;

	constructor(typeName: string = '', name: string = '', partitionGuid: Guid = Guid.createEmpty(), instanceGuid: Guid = Guid.createEmpty()) {
		this.typeName = typeName;
		this.name = name;
		this.partitionGuid = partitionGuid;
		this.instanceGuid = instanceGuid;
	}

	public setFromTable(table: any) {
		this.typeName = table.typeName;
		this.name = table.name;
		this.partitionGuid = table.partitionGuid;
		this.instanceGuid = table.instanceGuid;

		return this;
	}

	public clone() {
		return new CtrRef(this.typeName, this.name, this.partitionGuid, this.instanceGuid);
	}
}
