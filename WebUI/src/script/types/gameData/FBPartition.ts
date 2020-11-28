import { Guid } from '@/script/types/Guid';
import { getFilename, getPaths } from '@/script/modules/Utils';
import { AxiosResponse } from 'axios';
import Partition from '@/script/types/ebx/Partition';
import Instance from '@/script/types/ebx/Instance';
import { Dictionary } from 'typescript-collections';
import { GameObject } from '@/script/types/GameObject';
const axios = require('axios').default;

export class FBPartition {
	public typeName: string;
	public instanceCount: number;
	public _data: any = undefined;

	private promise: Promise<AxiosResponse<EBX.JSON.Partition>>;
	constructor(
		public name: string,
		public guid: Guid,
		public primaryInstanceGuid: Guid | null = null,
		public instances: { [guid: string]: Instance } = {}) {
	}

	get primaryInstance(): Instance | null {
		if (this.primaryInstanceGuid) {
			return this.instances[this.primaryInstanceGuid.toString().toLowerCase()];
		}
		return null;
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

	public get data() {
		if (this._data === undefined) {
			return this.getData().then((response: AxiosResponse<EBX.JSON.Partition>) => {
				this._data = Partition.fromJSON(this.name, response.data);
				for (const instance of response.data.$instances) {
					this.instances[instance.$guid] = Instance.fromJSON(this._data, instance);
				}
			});
		} else {
			return this._data;
		}
	}

	private getData(): Promise<AxiosResponse<EBX.JSON.Partition>> {
		if (this.promise) { // In case the same thing is requested rapidly
			return this.promise;
		}
		this.promise = axios.get('http://176.9.7.112:8081/' + this.name + '.json').then((response:AxiosResponse<FBPartition>) => {
			return response;
		});
		return this.promise;
	}

	public getInstance(guid: Guid): Instance {
		return this.instances[guid.toString().toLowerCase()];
	}
}
