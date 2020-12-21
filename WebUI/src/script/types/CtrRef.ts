import { Guid } from '@/script/types/Guid';
import Instance from '@/script/types/ebx/Instance';

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
		this.partitionGuid = new Guid(table.partitionGuid);
		this.instanceGuid = new Guid(table.instanceGuid);

		return this;
	}

	public clone() {
		return new CtrRef(this.typeName, this.name, this.partitionGuid, this.instanceGuid);
	}

	public Resolve(): Instance | null {
		return editor.fbdMan.getInstance(this.partitionGuid, this.instanceGuid);
	}
}
