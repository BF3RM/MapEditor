<template>
    <tr v-if="field.name !== 'name'" class="row">
        <td class="is-family-code is-narrow field-name" :class="{'numbered': numberName}">
			{{ titleName }}
        </td>
        <td class="field-value">
            <div class="field-spacer">
				<component :type="field.type" :class="field.type" :autoOpen="autoOpen"
					:currentPath="currentPath" :is="propertyComponent" :partition="partition" :field="field"
					:value="getValue()" @input="onChangeValue(field.name, $event)" :instance="instance" :reference="field.value"></component>
			</div>
        </td>
    </tr>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import StringControl from '@/script/components/controls/StringControl.vue';
import NumberControl from '@/script/components/controls/NumberControl.vue';
import BoolControl from '@/script/components/controls/BoolControl.vue';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import Instance from '@/script/types/ebx/Instance';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';
export default Vue.extend({
	name: 'Property',
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		field: {
			type: Object as PropType<Field<Instance>>,
			required: true
		},
		instance: {
			type: Object as PropType<Instance>,
			required: true
		},
		currentPath: {
			type: String,
			required: true
		},
		autoOpen: {
			type: Boolean,
			required: false
		},
		overrides: {
			type: Object as PropType<IEBXFieldData>,
			default() {
				return { field: 'none', type: 'none', value: {} };
			},
			required: false
		}
	},
	methods: {
		onChangeValue(field: string, newValue: any) {
			this.$emit('input', {
				reference: {
					partitionGuid: this.partition.guid,
					instanceGuid: this.instance.guid
				},
				field: field,
				type: this.field.type,
				value: newValue,
				oldValue: this.field.value
			} as IEBXFieldData);
		},
		getValue() {
			if (this.overrides && this.overrides.field !== 'none') {
				return this.overrides.value;
			}
			return this.field.value;
		}
	},
	computed: {
		propertyComponent() {
			if (Array.isArray(this.field.value)) {
				return () => import('./ArrayProperty.vue');
			} else if (this.field.isReference()) {
				return () => import('./ReferenceProperty.vue');
			}

			const type: any = async () => {
				switch (this.field.type) {
				case 'Vec3':
					return Vec3Control;
				case 'LinearTransform':
					return LinearTransformControl;
				case 'String':
					return StringControl;
				case 'Single':
				case 'Int32':
				case 'UInt32':
				case 'Int16':
				case 'UInt16':
				case 'SByte':
					return NumberControl;
				case 'Boolean':
					return BoolControl;
				case 'AntRef':
				// TODO assetId
				// Characters/Soldiers/MpSoldier.json
					return import('./ObjectProperty.vue');
				default:
					console.log('Unknown property type: ' + this.field.type);
					break;
				}
				if (this.field.isEnum()) { // structs
					return import('./EnumProperty.vue');
				}
				if (typeof this.field.value === 'object') { // structs
					return import('./ObjectProperty.vue');
				}

				return import('./DefaultProperty.vue');
			};

			// TODO: filter for colors

			return type;
		},
		numberName() {
			return !!parseInt(this.field.name);
		},
		titleName() {
			if (this.numberName) {
				return '[' + this.field.name + ']';
			}
			return (this.field.name[0].toUpperCase() + this.field.name.substring(1)).replace(/([a-z0-9])([A-Z])/g, '$1 $2'); // Make first character uppercase and make it Title Case
		}
	},
	components: {
		StringControl,
		NumberControl,
		BoolControl
	}
});
</script>
<style lang="scss" scoped>
	.field-name {
		text-transform: capitalize;
		grid-column: 1;
		text-align: right;
		padding-right: 1em;
	}
	.field-name.numbered {
		min-width: 0;
	}
	.field-value {
		grid-column: 2;
	}
	.value div[type=object] {
	}
</style>
