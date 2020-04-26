import { getFilename, getPaths } from '@/script/modules/Utils';

export class FBSuperBundle {
	public name: string;
	public chunkCount: number;
	public bundleCount: number;

	constructor(superBundleData: any) {
		this.name = superBundleData.name;
		this.chunkCount = superBundleData.chunkCount;
		this.bundleCount = superBundleData.bundleCount;
	}

	get bundles() {
		const scope = this;
		if (this.name === 'All') {
			return editor.fbdMan.getBundles();
		}
		return editor.fbdMan.getBundles(this.name);
	}

	get paths() {
		return getPaths(this.name);
	}

	get fileName() {
		return getFilename(this.name);
	}
}
