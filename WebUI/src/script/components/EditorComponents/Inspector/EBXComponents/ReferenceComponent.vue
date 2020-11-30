<template>
    <span>
        <template v-if="instance">
			<span @click="expanded = !expanded">
				&rarr; {{instance.type}} - {{referencePath}}
			</span>
        </template>
        <template v-else>
            &rarr; {{referencePath}} - {{ reference.partitionGuid }} / {{ reference.instanceGuid }}
        </template>
		<template v-if="expanded">
                <instance-identifier :instance="instance" :reference-links="link"></instance-identifier>
		</template>
        <template v-if="loading">
            (loading)
        </template>
    </span>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Reference from '../../../../types/ebx/Reference';
export default Vue.extend({
	name: 'ReferenceComponent',
	components: {
		InstanceIdentifier: () => import('./InstanceIdentifier.vue')
	},
	props: {
		reference: {
			type: Object as PropType<Reference>,
			required: true
		},
		link: {
			type: Boolean,
			default: () => true
		}
	},
	data(): { loading: boolean, instance: any | null, expanded: false, referencePath: string, partition} {
		return {
			loading: true,
			instance: null,
			expanded: false,
			referencePath: '',
			partition: null
		};
	},
	async mounted() {
		try {
			this.partition = window.editor.fbdMan.getPartition(this.reference.partitionGuid);
			const data = this.partition.data;
			const instance = window.editor.fbdMan.getInstance(this.reference.partitionGuid, this.reference.instanceGuid);
			if (!instance) {
				console.error('Failed to fetch instance');
			}
			this.instance = instance;
			this.referencePath = window.editor.fbdMan.getPartitionName(this.reference.partitionGuid);
		} catch (err) {
			console.warn(`Failed to resolve reference ${(this.reference.partitionGuid)}/${this.reference.instanceGuid}`, err);
			return;
		} finally {
			this.loading = false;
		}
	}
});
</script>
