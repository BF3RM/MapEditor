<template>
    <div class="table">
        <div v-if="field.value">
			<property v-for="(value, index) in field.value" :partition="partition" :instance="instance" :field="value" :key="index" :currentPath="currentPath"></property>
        </div>
		<div v-else>
			<reference-component :class="field.type" :type="this.field.type" :currentPath="currentPath" :partition="partition" :field="field" :value="field.value" :instance="instance" :reference="null"></reference-component>
		</div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';
import Instance from '@/script/types/ebx/Instance';

export default Vue.extend({
	name: 'ObjectProperty',
	components: {
		ReferenceComponent: () => import('./ReferenceComponent.vue'),
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
		},
		currentPath: {
			type: String,
			required: true
		},
		instance: {
			type: Object as PropType<Instance>,
			required: true
		}
	}
});
</script>
