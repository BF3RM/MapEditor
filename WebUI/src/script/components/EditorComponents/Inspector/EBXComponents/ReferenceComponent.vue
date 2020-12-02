<template>
    <span>
        <template v-if="instance">
			<span @click="expanded = !expanded">
				<div class="ReferenceBox">
					<div class="type">&rarr; {{instance.type}}</div>
					<div class="path">{{cleanPath()}}</div>
				</div>
			</span>
        </template>
        <template v-else>
            &rarr; {{cleanPath()}} - {{ reference.partitionGuid }} / {{ reference.instanceGuid }}
        </template>
		<template v-if="expanded && this.$data.partition">
                <Instance :instance="instance" :partition="this.$data.partition" :reference-links="link"></Instance>
		</template>
        <template v-if="loading">
            (loading)
        </template>
    </span>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import Partition from '@/script/types/ebx/Partition';
import { Component } from 'vue-property-decorator';
import Reference from '@/script/types/ebx/Reference';

@Component({
	name: 'ReferenceComponent',
	components: {
		Instance: () => import('./Instance.vue')
	},
	props: {
		reference: {
			type: Object as PropType<Reference>,
			required: true
		},
		link: {
			type: Boolean,
			default: () => true
		},
		currentPath: {
			type: String,
			required: false
		},
		methods: {
			cleanPath: String
		}
	},
	data(): { loading: boolean, instance: any | null, expanded: false, referencePath: string, partition: Partition } {
		return {
			loading: true,
			instance: null,
			expanded: false,
			referencePath: '',
			partition: null
		};
	}
})
export default class ReferenceComponent extends Vue {
	mounted() {
		this.partition = window.editor.fbdMan.getPartition(this.reference.partitionGuid);
		if (this.partition === undefined) {
			console.warn(`Failed to resolve reference ${(this.reference.partitionGuid)}/${this.reference.instanceGuid}`);
		}
		this.partition.data.then((res) => {
			this.referencePath = this.partition.name;
			this.instance = this.partition.instances[this.reference.instanceGuid.toString().toLowerCase()];
			console.log(this.instance);
			this.loading = false;
		});
	}

	cleanPath() {
		if (this.partition) {
			return this.partition.fileName;
		}
		return this.$data.referencePath;
	}
}
</script>
