import Field from './Field';
import Partition from './Partition';
import { Guid } from '@/script/types/Guid';

type Fields = { [name: string]: Field<any> };

export default class Instance {
	public readonly fields: Fields;

	constructor(
		public readonly guid: Guid,
		public readonly typeName: string,
		public readonly baseClass: string,
		fields: Fields
	) {
		this.fields = { ...fields };
	}

	static fromJSON(partition: Partition, json: EBX.JSON.Instance): Instance {
		const fields: Fields = {};

		for (const [name, data] of Object.entries(json.$fields)) {
			const field = Field.fromJSON(name, data);
			fields[field.name] = field;
		}

		return new Instance(new Guid(json.$guid), json.$type, json.$baseClass, fields);
	}
}
