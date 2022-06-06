<template>
    <div v-if="field.name !== 'name'" class="row">
        <div class="is-family-code is-narrow field-name" :class="{'numbered': !isNaN(Number(field.name))}">
			{{ titleName }}
        </div>
        <div class="field-value">
            <div class="field-spacer">
				<component :type="field.type" :class="field.type" :autoOpen="autoOpen"
					:currentPath="currentPath" :is="propertyComponent" :partition="partition" :field="field"
					:value="getValue()" @input="onChangeValue(field.name, $event)" :instance="instance" :reference="field.value" :overrides="getOverrides()"></component>
			</div>
        </div>
    </div>
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
import { CtrRef } from '@/script/types/CtrRef';
import { isPrintable } from '@/script/modules/Utils';
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
			type: undefined,
			default() {
				return null;
			},
			required: false
		}
	},
	methods: {
		onChangeValue(field: string, newValue: any) {
			const out: IEBXFieldData = {
				reference: new CtrRef(
					undefined,
					undefined,
					this.partition.guid,
					this.instance.guid
				),
				field: field,
				type: this.field.type,
				value: newValue,
				oldValue: this.field.value
			};
			this.$emit('input', out);
		},
		getValue() {
			if (this.overrides) {
				return this.overrides;
			}
			return this.field.value;
		},
		getOverrides() {
			if (this.overrides) {
				return this.overrides;
			}
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
				default:
					console.log('Unknown property type: ' + this.field.type);
					break;
				}
				if (this.field.isEnum()) { // structs
					return import('./EnumProperty.vue');
				}
				return import('./ObjectProperty.vue');
			};

			// TODO: filter for colors

			return type;
		},
		titleName() {
			if (!isNaN(Number(this.field.name))) {
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
	.field-name.numbered {
		display: none;
	}

	.field-name {
		text-transform: capitalize;
		margin-bottom: 6px;
	}

	.field-value {
		margin-bottom: 14px;
	}

	/*
	.field-name.numbered {
		min-width: 0;
	}
	.field-value {
		grid-column: 2;
	}
	.value div[type=object] {
	}*/
</style>
