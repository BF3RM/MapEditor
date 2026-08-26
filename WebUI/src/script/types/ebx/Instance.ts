import Field, { normalizeFieldName } from './Field';
import Partition from './Partition';
import { Guid } from '@/script/types/Guid';

type Fields = { [name: string]: Field<any> };

/** A run of fields declared by one type in the instance's inheritance chain. */
export interface FieldGroup {
	typeName: string;
	fields: Field<any>[];
}

export default class Instance {
	public readonly fields: Fields;
	// Fields in inheritance order, base-most declaring type first. EMPTY when the serializer sent
	// no ordering (webx / the browser emulator), which the inspector reads as "render flat".
	public readonly groups: FieldGroup[];

	constructor(
		public readonly guid: Guid,
		public readonly typeName: string,
		public readonly baseClass: string,
		fields: Fields,
		groups: FieldGroup[] = []
	) {
		this.fields = { ...fields };
		this.groups = groups;
	}

	static fromJSON(partition: Partition, json: EBX.JSON.Instance): Instance {
		const fields: Fields = {};

		// $fields can be absent on a partially-serialized / placeholder instance;
		// guard the iteration so one bad instance can't crash the inspector.
		if (json.$fields) {
			for (const [name, data] of Object.entries(json.$fields)) {
				const field = Field.fromJSON(name, data);
				fields[field.name] = field;
			}
		}

		return new Instance(new Guid(json.$guid), json.$type, json.$baseClass, fields, this.groupFields(json, fields));
	}

	/**
	 * Take one group's worth of fields off $fieldOrder, skipping names with nothing behind them.
	 *
	 * Split out of groupFields so that method stays a flat walk over the groups: inlined, the two
	 * nested loops and their guards scored 12 on cyclomatic complexity.
	 *
	 * A named field with no entry in `fields` means the two halves disagree; drop the name rather
	 * than render an empty row. `used` guards the reverse too: two engine names can normalise to
	 * the SAME key, and both would otherwise point at the one surviving entry and render twice.
	 */
	private static takeGroupMembers(
		order: string[],
		start: number,
		count: number,
		fields: Fields,
		used: Set<string>
	): Field<any>[] {
		const members: Field<any>[] = [];

		for (let i = 0; i < count && start + i < order.length; i++) {
			const name = normalizeFieldName(order[start + i]);
			const field = fields[name];

			if (field && !used.has(name)) {
				members.push(field);
				used.add(name);
			}
		}

		return members;
	}

	// Slice $fieldOrder into one group per declaring type using $fieldGroups' counts (the wire
	// format keeps names in ONE flat list instead of nesting them per group — see
	// PartitionSerializer:_FieldOrder for why).
	private static groupFields(json: EBX.JSON.Instance, fields: Fields): FieldGroup[] {
		if (!Array.isArray(json.$fieldOrder) || !Array.isArray(json.$fieldGroups)) {
			return [];
		}

		const groups: FieldGroup[] = [];
		const used = new Set<string>();
		let cursor = 0;

		for (const group of json.$fieldGroups) {
			const members = Instance.takeGroupMembers(json.$fieldOrder, cursor, group.$count, fields, used);
			cursor += Math.min(group.$count, Math.max(0, json.$fieldOrder.length - cursor));

			if (members.length > 0) {
				groups.push({ typeName: group.$type, fields: members });
			}
		}

		// Never let a field vanish because it was missing from the ordering. Nothing should reach
		// here — but "the inspector silently stopped showing a field" is precisely the failure this
		// change could introduce, so the leftovers are appended rather than dropped, onto the
		// concrete type's own group when there is one.
		const leftovers = Object.keys(fields)
			.filter((name) => !used.has(name))
			.map((name) => fields[name]);

		if (leftovers.length > 0) {
			const last = groups[groups.length - 1];

			if (last && last.typeName === json.$type) {
				last.fields.push(...leftovers);
			} else {
				groups.push({ typeName: json.$type, fields: leftovers });
			}
		}

		return groups;
	}
}
