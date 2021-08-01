import { Guid } from '@/script/types/Guid';

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

	public static GetRootParentData() {
		return new GameObjectParentData(
			Guid.createEmpty(),
			'custom_root',
			Guid.createEmpty(),
			Guid.createEmpty()
		);
	}

	public static FromTable(table: any) {
		const guid = Guid.parse(table.guid);
		const typeName = table.typeName;
		const primaryInstanceGuid = Guid.parse(table.primaryInstanceGuid);
		const partitionGuid = Guid.parse(table.partitionGuid);

		return new GameObjectParentData(guid, typeName, primaryInstanceGuid, partitionGuid);
	}

	public toTable() {
		return {
			guid: this.guid.toString(),
			typeName: this.typeName,
			primaryInstanceGuid: this.primaryInstanceGuid.toString(),
			partitionGuid: this.partitionGuid.toString()
		};
	}
}
