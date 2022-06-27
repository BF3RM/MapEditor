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
			.get('http://176.9.7.112:8081/' + this.name + '.json')
			.then((response: AxiosResponse<EBX.JSON.Partition>) => {
				return this.fromJSON(path, response.data);
			})
			.catch((e: any) => {
				console.error(e);
			});
	}

	static fromJSON(file: string, json: EBX.JSON.Partition): Partition {
		const partition = new Partition(json.$name, new Guid(json.$guid));
		for (const data of json.$instances) {
			partition.instances[data.$guid.toUpperCase()] = Instance.fromJSON(partition, data);
		}

		partition.primaryInstance = partition.instances[json.$primaryInstance.toUpperCase()];

		console.log(partition);
		return partition;
	}
}
