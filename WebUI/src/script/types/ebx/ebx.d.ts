declare namespace EBX {
	namespace JSON {
		interface Field<Type> {
			$type: string;
			$value: Type;
			$array?: boolean;
			$enum?: boolean;
			$enumValue?: string;
			$ref?: boolean;
		}
		interface Instance {
			$guid: string;
			$type: string;
			$baseClass: string;
			$fields: { [name: string]: Field<any> };
			// Field DECLARATION order, base-most type in the inheritance chain first, and the
			// slices of it that each type declares. `$fields` is an object, so it cannot carry
			// order itself. Optional: the webx/emulator path never sends them, and an instance
			// without them renders as a flat list (see Instance.fromJSON).
			$fieldOrder?: string[];
			$fieldGroups?: Array<{ $type: string; $count: number }>;
		}
		interface Partition {
			$guid: string;
			$name: string;
			$primaryInstance: string;
			$instances: Array<Instance>;
		}

		interface ArrayField<Type> extends Field<Array<Type>> {
			$array: true;
		}

		interface EnumField extends Field<number> {
			$enum: true;
			$enumValue: string;
		}

		interface ReferenceField extends Field<string | null> {
			$ref: true;
		}
		interface Reference {
			$partitionGuid: string;
			$instanceGuid: string;
		}
		interface ReferenceArrayField extends ArrayField<Reference> {
			$ref: true;
		}
		interface Vec3 {
			x: Field<number>;
			y: Field<number>;
			z: Field<number>;
		}
		interface LinearTransform {
			right: Field<Vec3>;
			up: Field<Vec3>;
			forward: Field<Vec3>;
			trans: Field<Vec3>;
		}
	}
}
