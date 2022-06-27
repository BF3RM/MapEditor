<template>
	<div class="table">
		<div v-if="field.value">
			<property
				v-for="value in field.value"
				:key="value.name"
				:overrides="getOverrides(value.name)"
				:partition="partition"
				:instance="instance"
				:field="value"
				:currentPath="currentPath"
				@input="$emit('input', $event)"
			></property>
		</div>
		<div v-else>
			<Reference-property
				:overrides="getOverrides(field.name)"
				:class="field.type"
				:type="field.type"
				:currentPath="currentPath"
				:partition="partition"
				:field="field"
				:value="field.value"
				:instance="instance"
				:reference="null"
				@input="$emit('input', $event)"
			></Reference-property>
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
		ReferenceProperty: () => import('./ReferenceProperty.vue'),
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
		},
		overrides: {
			type: Object,
			default() {
				return {};
			},
			required: false
		}
	},
	methods: {
		getOverrides(field: string): any {
			if (this.overrides) {
				return this.overrides[field];
			}
		}
	}
});
</script>
