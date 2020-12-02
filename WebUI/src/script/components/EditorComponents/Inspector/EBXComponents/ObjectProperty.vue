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

export default Vue.extend({
	name: 'ObjectProperty',
	components: {
		Property: () => import('./Property.vue')
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
