<template>
    <reference-component :autoOpen="autoOpen" :currentPath="currentPath" :reference="field.value" :partition="partition"></reference-component>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';
import ReferenceComponent from '@/script/components/EditorComponents/Inspector/EBXComponents/ReferenceComponent.vue';

export default Vue.extend({
	name: 'ReferenceProperty',
	components: {
		'reference-component': ReferenceComponent
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
		autoOpen: {
			type: Boolean,
			required: false
		}
	}
});
</script>
