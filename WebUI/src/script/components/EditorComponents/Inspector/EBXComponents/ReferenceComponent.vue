<template>
	<span>
		<template v-if="instance">
			<span @click="expanded = !expanded">
				<div class="ReferenceBox">
					<div class="type">{{instance.typeName}}</div>
					<div class="path">{{cleanPath()}}</div>
				</div>
			</span>
		</template>
		<template v-else>
			{{cleanPath()}} - {{ reference.partitionGuid }} / {{ reference.instanceGuid }}
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
import { Component, Prop } from 'vue-property-decorator';
import Reference from '@/script/types/ebx/Reference';

@Component({
	name: 'ReferenceComponent',
	components: {
		Instance: () => import('./Instance.vue')
	},
	methods: {
		cleanPath: String
	}
})
export default class ReferenceComponent extends Vue {
	@Prop({
		type: Object as PropType<Reference>,
		required: true
	})
	reference: Reference;

	@Prop({
		type: Boolean,
		default: () => true
	})
	link: Boolean;

	@Prop({
		type: String,
		required: false
	})
	currentPath: string;

	@Prop({
		type: Boolean,
		required: false
	})
	autoOpen: boolean;

	data(): { loading: boolean, instance: any | null, expanded: false, referencePath: string, partition: Partition | null } {
		return {
			loading: true,
			instance: null,
			expanded: false,
			referencePath: '',
			partition: null
		};
	}

	mounted() {
		this.$data.partition = window.editor.fbdMan.getPartition(this.reference.partitionGuid);
		if (this.$data.partition === undefined) {
			console.warn(`Failed to resolve reference ${(this.reference.partitionGuid)}/${this.reference.instanceGuid}`);
			return;
		}
		this.$data.partition.data.then(() => {
			this.$data.referencePath = this.$data.partition.name;
			this.$data.instance = this.$data.partition.instances[this.reference.instanceGuid.toString().toLowerCase()];
			console.log(this.$data.instance);
			this.$data.loading = false;
			if (this.autoOpen) {
				this.$data.expanded = true;
			}
		});
	}

	cleanPath() {
		if (this.$data.partition) {
			return this.$data.partition.fileName;
		}
		return this.$data.referencePath;
	}
}
</script>
<style lang="scss">
.ReferenceBox {
	height: 30px;
	/* width: 100%; */
	padding: 5px;
	margin: 0;
	border: 0;
	background-color: rgba(0, 0, 0, 0.4) !important;
	color: #fff;
	border-top: 1px solid rgb(0 0 0 / 40%) !important;
}
.type {
	color: #f98926;
}
.path {
	color: #688457;
}
</style>
