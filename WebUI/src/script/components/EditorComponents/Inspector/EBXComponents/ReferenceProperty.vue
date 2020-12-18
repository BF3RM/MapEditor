<template>
	<span>
		<template v-if="reference">
			<template v-if="instance">
				<div class="ReferenceBox" @click="expanded = !expanded">
					<div class="type">{{instance.typeName}}</div>
					<div class="path">{{cleanPath}}<span class="guid">{{guid}}</span></div>
					<div v-if="instance.typeName === 'ReferenceObjectData'" class="path">
						{{referenceObjectBlueprint}}
					</div>
				</div>
			</template>
			<template v-else>
				{{cleanPath}} <span class="Guid">{{guid}}</span> - {{ reference.partitionGuid }} / {{ reference.instanceGuid }}
			</template>
			<template v-if="expanded && partition">
					<InstanceProperty :instance="instance" :partition="partition" :reference-links="link" @input="$emit('input', $event)"></InstanceProperty>
			</template>
			<template v-if="loading">
				(loading)
			</template>
		</template>
		<template v-else>
			<div class="ReferenceBox" @click="expanded = !expanded">
				<div>
					<div class="type">{{instance ? instance.typeName : type}}</div>
					<div class="path null">null</div>
				</div>
			</div>
		</template>
	</span>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import Partition from '@/script/types/ebx/Partition';
import { Component, Prop } from 'vue-property-decorator';
import Reference from '@/script/types/ebx/Reference';
import { GameObject } from '@/script/types/GameObject';

@Component({
	name: 'ReferenceProperty',
	components: {
		InstanceProperty: () => import('./InstanceProperty.vue')
	}
})
export default class ReferenceComponent extends Vue {
	@Prop({
		type: Object as PropType<GameObject>,
		required: false
	})
	gameObject: GameObject;

	@Prop({
		type: String,
		required: false
	})
	type: string;

	@Prop({
		type: Object as PropType<Reference>,
		required: false
	})
	reference: Reference;

	@Prop({
		type: Boolean,
		default: () => true
	})
	link: Boolean;

	@Prop({
		type: String,
		required: true
	})
	currentPath: string;

	@Prop({
		type: Boolean,
		required: false
	})
	autoOpen: boolean;

	data(): { loading: boolean, instance: any | null, expanded: false, referencePath: string, partition: Partition | null, cleanPath: string } {
		return {
			loading: true,
			instance: null,
			expanded: false,
			referencePath: '',
			partition: null,
			cleanPath: '',
			guid: '',
			referenceObjectBlueprint: ''
		};
	}

	mounted() {
		if (!this.reference) {
			return;
		}
		this.$data.partition = window.editor.fbdMan.getPartition(this.reference.partitionGuid);
		if (this.$data.partition === undefined) {
			console.warn(`Failed to resolve reference ${(this.reference.partitionGuid)}/${this.reference.instanceGuid}`);
			return;
		}
		this.$data.partition.data.then(() => {
			this.$data.referencePath = this.$data.partition.name;
			this.$data.instance = this.$data.partition.instances[this.reference.instanceGuid.toString().toLowerCase()];
			this.$data.loading = false;
			if (this.autoOpen) {
				this.$data.expanded = true;
			}
			this.$data.cleanPath = './';
			const regEx = new RegExp(this.currentPath.substring(0, this.currentPath.lastIndexOf('/')), 'ig');
			if (this.$data.partition.name.toLowerCase() !== this.currentPath.toLowerCase()) { // If instance is not located in the current path
				const path = this.$data.partition.name.replace(regEx, '');
				if (path.startsWith('/')) {
					this.$data.cleanPath = '.' + path + '/'; // Strip the path from the filename
				} else {
					this.$data.cleanPath = path + '/'; // Strip the path from the filename
				}
			}
			this.$data.guid = this.$data.instance.guid;

			if (this.$data.instance.typeName === 'ReferenceObjectData') {
				this.$data.instance.fields.blueprint.value.getPartition().data.then(() => {
					this.$data.referenceObjectBlueprint = this.$data.instance.fields.blueprint.value.getInstance().fields.name.value;
					this.$data.referenceObjectBlueprint = this.$data.referenceObjectBlueprint.replace(regEx, '');
				});
			}
		});
	}
}
</script>
<style lang="scss" scoped>
.ReferenceBox {
	padding: 5px;
	margin: 0;
	border: 0;
	background-color: rgba(0, 0, 0, 0.4) !important;
	color: #fff;
	border-top: 1px solid rgb(0 0 0 / 40%) !important;
}
</style>
