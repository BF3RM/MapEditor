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
