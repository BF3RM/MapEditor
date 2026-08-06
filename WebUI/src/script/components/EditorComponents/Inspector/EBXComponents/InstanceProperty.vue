<template>
	<div>
		<div class="table-container" v-if="visible">
			<div class="table is-bordered">
				<Property
					:currentPath="partition.name"
					v-for="(field, index) in instance.fields"
					:partition="partition"
					:instance="instance"
					:field="field"
					:overrides="getOverrides(field.name)"
					:key="index"
					@input="$emit('input', $event)"
				></Property>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Instance from '../../../../types/ebx/Instance';
import Property from './Property.vue';

export default Vue.extend({
	name: 'InstanceProperty',
	components: {
		Property
	},
	props: {
		partition: {
			type: Object as PropType<Partition>,
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
	data() {
		return {
			visible: true
		};
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

<style lang="scss" scoped>
input[type='text'].input {
	max-width: 20%;
}

/* Body of an (expanded) instance: a subtle left guide line + indent marks the
   nesting depth instead of a boxed-in border, so deep structures stay legible.
   Sits flush under the ReferenceBox header that toggled it open. */
.table-container {
	padding: 4px 0 6px 10px;
	margin-left: 1px;
	border-left: 1px solid rgba(141, 161, 182, 0.22);
	background-color: rgba(22, 25, 36, 0.25);
	border-bottom-left-radius: 4px;
	border-bottom-right-radius: 4px;
}
</style>
