<template>
    <div class="table">
        <div v-if="field.value">
			<property v-for="(value, index) in field.value" :key="value.name" :overrides="getOverrides(value.name)" :partition="partition" :instance="instance" :field="value"  :currentPath="currentPath"  @input="$emit('input', $event)"></property>
        </div>
		<div v-else>
			<Reference-property :overrides="getOverrides(field.name)" :class="field.type" :type="field.type" :currentPath="currentPath" :partition="partition" :field="field" :value="field.value" :instance="instance" :reference="null" @input="$emit('input', $event)"></Reference-property>
		</div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';
import Instance from '@/script/types/ebx/Instance';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';

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
			type: Object as PropType<IEBXFieldData>,
			default() {
				return { field: 'none', type: 'none', value: {} };
			},
			required: false
		}
	},
	methods: {
		getOverrides(field: string): any {
			if (this.$props.overrides) {
				return this.$props.overrides.field === field ? this.$props.overrides.value : { field: 'none', type: 'none', value: {} };
			}
			return { field: 'none', type: 'none', value: {} };
		}
	}
});
</script>
