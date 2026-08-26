import Reference from './Reference';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';
import { Vec2 } from '@/script/types/primitives/Vec2';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Vec4 } from '@/script/types/primitives/Vec4';

// Types that get a purpose-built grouped control (Property.vue) instead of the
// generic nested-field fallback. Each turns the {x:{$value},...} wire shape into a
// typed vector so the editor can emit the whole value on change (see Vec3 pattern).
const customDeserializers: { [type: string]: (value: any) => any } = {
	LinearTransform: LinearTransform.fromJSON,
	Vec2: Vec2.fromJSON,
	Vec3: Vec3.fromJSON,
	Vec4: Vec4.fromJSON
};

// Exported because $fieldOrder/$fieldGroups name fields as the ENGINE spells them, while the
// fields they index are keyed by the normalised name. Two copies of these rules would drift.
export function normalizeFieldName(name: string): string {
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
	// `$array` is authoritative, NOT Array.isArray($value).
	//
	// An EMPTY Frostbite array serializes to JSON `{}` rather than `[]`, because Lua cannot tell an
	// empty list from an empty map and the encoder picks the object form. Deciding array-ness from
	// the value's shape therefore misreads every empty array as a struct: an empty Vec3[] reached
	// Vec3.fromJSON({}), which reads json.x.$value and throws. One empty array anywhere in a
	// partition aborted the whole ingest, so a BMP2 VehicleBlueprint (375 instances, four empty
	// StaticCameraData curve arrays) always arrived as a completely blank inspector.
	const isArray = json.$array === true || Array.isArray(json.$value);

	if (isArray) {
		const items: any[] = Array.isArray(json.$value) ? json.$value : [];
		if (json.$ref) {
			return items.map((value: EBX.JSON.Reference, i: number) =>
				Field.fromJSON(`${i + 1}`, {
					$type: json.$type,
					$ref: true,
					$value: value
				})
			);
		} else {
			return items.map((value: EBX.JSON.Field<any>, i: number) =>
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
