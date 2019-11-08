import { Guid } from 'guid-typescript';
import { getFilename, getPaths } from '@/script/modules/Utils';

export class FBPartition {
	public name: string;
	public guid: Guid;
	public primaryInstance: Guid;
	public typeName: string;
	public instanceCount: number;

	constructor(partitionData: any) {
		this.name = partitionData.name;
		this.guid = partitionData.guid;
		this.primaryInstance = partitionData.primaryInstance;
		this.typeName = partitionData.typeName;
		this.instanceCount = partitionData.instanceCount;
	}

	get bundlesReferencedIn() {
		return editor.fbdMan.getBundlesReferencedIn(this.name);
	}

	get paths() {
		return getPaths(this.name);
	}

	get fileName() {
		return getFilename(this.name);
	}
}
