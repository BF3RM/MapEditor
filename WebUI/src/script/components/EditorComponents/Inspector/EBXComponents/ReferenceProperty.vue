<template>
    <reference :reference="field.value"></reference>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';
import Reference from '@/script/components/EditorComponents/Inspector/EBXComponents/Reference.vue';

export default Vue.extend({
	name: 'ReferenceProperty',
	components: {
		Reference
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
