import { Guid } from '@/script/types/Guid';
import Instance from '@/script/types/ebx/Instance';
import { FBPartition } from '@/script/types/gameData/FBPartition';

export default class Reference {
	public partitionGuid: Guid;
	public instanceGuid: Guid;

	constructor(partitionGuid: string, instanceGuid: string) {
		this.partitionGuid = new Guid(partitionGuid);
		this.instanceGuid = new Guid(instanceGuid);
	}

	public getInstance(): Instance | undefined {
		return window.editor.fbdMan.getInstance(this.partitionGuid, this.instanceGuid);
	}

	public getPartition(): FBPartition | undefined {
		return window.editor.fbdMan.getPartition(this.partitionGuid);
	}
}
