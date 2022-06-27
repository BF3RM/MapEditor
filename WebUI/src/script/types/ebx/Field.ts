import Reference from './Reference';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Vec3 } from '@/script/types/primitives/Vec3';

const customDeserializers: { [type: string]: (value: any) => any } = {
	LinearTransform: LinearTransform.fromJSON,
	Vec3: Vec3.fromJSON
};

function normalizeFieldName(name: string): string {
	// FIXME Clean this up
	name = name.replace('FLIR', 'flir');
	name = name.replace('FOV', 'fov');
	name = name.replace('SID', 'sid');
	name = name.replace('AI', 'ai');
	name = name.replace('UI', 'ui');
	name = name.replace('MP', 'mp');
	name = name.replace('SP', 'sp');
	return name.charAt(0).toLowerCase() + name.slice(1);
}

function parseValue(json: EBX.JSON.Field<any>): any {
	if (Array.isArray(json.$value)) {
		if (json.$ref) {
			return json.$value.map((value: EBX.JSON.Reference, i: number) =>
				Field.fromJSON(`${i + 1}`, {
					$type: json.$type,
					$ref: true,
					$value: value
				})
			);
		} else {
			return json.$value.map((value: EBX.JSON.Field<any>, i: number) =>
				Field.fromJSON(`${i + 1}`, {
					$type: json.$type,
					$value: value
				})
			);
		}
	} else if (customDeserializers[json.$type]) {
		return customDeserializers[json.$type](json.$value);
	} else if (json.$ref) {
		if (!json.$value) {
			return null;
		}

		return new Reference(json.$value.$partitionGuid.toUpperCase(), json.$value.$instanceGuid.toUpperCase());
	}

	if (typeof json.$value === 'object') {
		const fields: { [field: string]: Field<any> } = {};
		// eslint-disable-next-line no-return-assign
		Object.keys(json.$value)
			.map((name) => Field.fromJSON(name, { ...json.$value[name] }))
			.forEach((field) => (fields[field.name] = field));
		return fields;
	} else {
		return json.$value;
	}
}

export default class Field<Type> {
	public name: string;
	public type: string;
	public value: Type;
	public enumValue?: string;

	isArray(): boolean {
		return Array.isArray(this.value);
	}

	isEnum(): boolean {
		return this.enumValue !== undefined;
	}

	isReference(): boolean {
		return this.value instanceof Reference;
	}

	constructor(name: string, type: string, value: Type, enumValue?: string) {
		this.name = name;
		this.type = type;
		this.value = value;
		this.enumValue = enumValue;
	}

	static fromJSON<Type>(name: string, json: EBX.JSON.Field<Type>): Field<Type> {
		return new Field(normalizeFieldName(name), json.$type, parseValue(json), json.$enumValue);
	}

	setValue(newValue: any) {
		this.value = newValue;
	}
}
