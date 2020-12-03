<template>
    <tr v-if="field.name !== 'name'" class="row">
        <td class="is-family-code is-narrow field-name">
			{{ titleName }}
        </td>
        <td class="field-value">
            <div class="field-spacer">
				<component :class="field.type" :type="typeof(field.value)" :autoOpen="autoOpen" :currentPath="currentPath" :is="propertyComponent" :partition="partition" :field="field" :value="field.value" @input="onChangeValue"></component>
			</div>
        </td>
    </tr>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

// import DefaultProperty from './DefaultProperty.vue';
// import ArrayProperty from './ArrayProperty.vue';
// import ReferenceProperty from './ReferenceProperty.vue';
// import ObjectProperty from './ObjectProperty.vue';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import StringControl from '@/script/components/controls/StringControl.vue';
import NumberControl from '@/script/components/controls/NumberControl.vue';
import BoolControl from '@/script/components/controls/BoolControl.vue';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
require('@gouch/to-title-case');
export default Vue.extend({
	name: 'Property',
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		field: {
			type: Object as PropType<Field<any>>,
			required: true
		},
		currentPath: {
			type: String,
			required: false
		},
		autoOpen: {
			type: Boolean,
			required: false
		}
	},
	methods: {
		onChangeValue(newValue) {
			console.log(newValue);
		},
		async getType() {
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

			if (typeof this.field.value === 'object') {
				return import('./ObjectProperty.vue');
			}

			return import('./DefaultProperty.vue');
		}
	},
	computed: {
		propertyComponent() {
			if (Array.isArray(this.field.value)) {
				return () => import('./ArrayProperty.vue');
			} else if (this.field.isReference()) {
				return () => import('./ReferenceProperty.vue');
			}

			return () => {
				const type = this.getType();

				// TODO: filter for colors

				return type;
			};
		},
		titleName() {
			if (parseInt(this.field.name)) {
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
<style lang="scss">
	.row {
		display: table-footer-group;
	}

	.field-name {
		text-transform: capitalize;
		grid-column: 1;
	}
	.field-value {
		grid-column: 2;
	}
	.value div[type=object] {
	}
	.field-name {
		text-align: right;
		padding-right: 1em;
	}
	.Int32 input, .UInt32 input, .Int16 input, .UInt16 input, .SByte input {
		color: #66d9ef;
	}
	.Single input, {
		color: #9e73c6;
	}
</style>
