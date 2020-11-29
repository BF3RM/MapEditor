<template>
    <tr>
        <td class="is-family-code is-narrow">
            {{ field.name }}
        </td>

        <template v-if="field.value === null">
            <td class="is-family-code">
                nil
            </td>
        </template>
        <td v-else>
            <component :is="propertyComponent" :partition="partition" :field="field"></component>
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
				return LinearTransformProperty;
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
		LinearTransformProperty
	}
});
</script>
