import { getFilename, getPaths } from '@/script/modules/Utils';

export class FBBundle {
	public name: string;
	public partitionCount: number;
	public size: number;

	constructor(bundleData: any) {
		this.name = bundleData.name;
		this.partitionCount = bundleData.partitionCount;
		this.size = bundleData.size;
	}

	get partitions() {
		return editor.fbdMan.getPartitions(this.name);
	}

	get paths() {
		return getPaths(this.name);
	}

	get fileName() {
		return getFilename(this.name);
	}
}
