<template>
    <div class="table">
        <div v-if="field.value">
			<property v-for="(value, key) in field.value" :partition="partition" :field="value" :key="key"></property>
        </div>
		<div v-else>
			nil
		</div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';
import Property from '@/script/components/EditorComponents/Inspector/EBXComponents/Property.vue';

export default Vue.extend({
	name: 'ObjectProperty',
	components: {
		property: Property
	},
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		field: {
			type: Object as PropType<Field<any>>,
			required: true
		}
	}
});
</script>
