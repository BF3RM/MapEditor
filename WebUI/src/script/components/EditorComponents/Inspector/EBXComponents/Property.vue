<template>
    <tr v-if="field.name !== 'name'" class="row">
        <td class="is-family-code is-narrow field-name">
			{{ field.name }}
        </td>
        <template v-if="field.value === null">
            <td class="is-family-code">
                nil
            </td>
        </template>
        <td v-else class="field-value">
            <div>
				<component :currentPath="currentPath" :is="propertyComponent" :partition="partition" :field="field" :value="field.value"></component>
			</div>
        </td>
    </tr>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

import DefaultProperty from './DefaultProperty.vue';
import Vec3Property from './Vec3Property.vue';
import LinearTransformProperty from './LinearTransformProperty.vue';
import ArrayProperty from './ArrayProperty.vue';
import ReferenceProperty from './ReferenceProperty.vue';
import ObjectProperty from './ObjectProperty.vue';
import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import StringControl from '@/script/components/controls/StringControl.vue';
import NumberControl from '@/script/components/controls/NumberControl.vue';
import BoolControl from '@/script/components/controls/BoolControl.vue';

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
			required: true
		}
	},
	computed: {
		propertyComponent() {
			if (Array.isArray(this.field.value)) {
				return ArrayProperty;
			} else if (this.field.isReference()) {
				return ReferenceProperty;
			}

			switch (this.field.type) {
			case 'Vec3':
				return Vec3Property;
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
				return ObjectProperty;
			default:
				break;
			}

			if (typeof this.field.value === 'object') {
				return ObjectProperty;
			}

			return DefaultProperty;
		}
	},
	components: {
		DefaultProperty,
		ObjectProperty,
		ReferenceProperty,
		ArrayProperty,
		Vec3Property,
		LinearTransformProperty,
		StringControl,
		NumberControl,
		BoolControl
	}
});
</script>
<style lang="scss">
	.row {
		display: table-row;
	}
</style>
