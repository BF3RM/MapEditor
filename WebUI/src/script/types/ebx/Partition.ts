import Instance from './Instance';
import { Guid } from '@/script/types/Guid';
import { AxiosResponse } from 'axios';
const axios = require('axios').default;

export default class Partition {
	constructor(
		public name: string,
		public guid: Guid,
		public primaryInstance: Instance | null = null,
		public instances: { [guid: string]: Instance } = {}
	) {}

	static fromPath(path: string) {
		return axios
			.get('https://webx.powback.com/Games/Venice/' + path + '.json')
			.then((response: AxiosResponse<EBX.JSON.Partition>) => {
				return this.fromJSON(path, response.data);
			})
			.catch((e: any) => {
				console.error(e);
			});
	}

	static fromJSON(file: string, json: EBX.JSON.Partition): Partition {
		// A reference can point at a partition that lives on remote webx / that the
		// serializer never provided. In that case `json` (or its $instances) can be
		// missing; iterating it would throw "$instances is not iterable" and take down
		// the whole inspector. Degrade to an empty (not-loaded) partition instead.
		if (!json || !Array.isArray(json.$instances)) {
			console.warn(`Partition "${file}" has no $instances (not loaded / remote); rendering empty.`);
			return new Partition(json?.$name ?? file, new Guid(json?.$guid ?? '00000000-0000-0000-0000-000000000000'));
		}

		const partition = new Partition(json.$name, new Guid(json.$guid));
		for (const data of json.$instances) {
			partition.instances[data.$guid.toUpperCase()] = Instance.fromJSON(partition, data);
		}

		if (json.$primaryInstance) {
			partition.primaryInstance = partition.instances[json.$primaryInstance.toUpperCase()] ?? null;
		}

		return partition;
	}
}
