<template>
	<!-- Gameface: root MUST be block (a <span> is inline, so in Cohtml the chip header
	     and its expanded field block lay out side-by-side instead of the chip sitting
	     ABOVE its children — the reference rendered as a tall bar with fields crammed to
	     its right and off the panel). -->
	<div class="reference-property">
		<template v-if="reference">
			<!-- One consistent chip in every state (loading / loaded / unresolved) so the
			     inspector doesn't visually jump as data streams in. Loading just adds a
			     faint pulse; the data fills into the same layout in the background. Only a
			     genuinely unresolved target gets the dimmed `not-loaded` treatment. -->
			<div
				class="ReferenceBox"
				:class="{ expanded: expanded && instance, loading: loading, 'not-loaded': notLoaded }"
				@click="toggle"
			>
				<div class="type">{{ (instance && instance.typeName) || type || 'Reference' }}</div>
				<div class="path">
					{{ cleanPath }}<span class="guid">{{ guid || reference.instanceGuid }}</span>
				</div>
				<div v-if="instance && instance.typeName === 'ReferenceObjectData'" class="path">
					{{ referenceObjectBlueprint }}
				</div>
				<div class="path hint" v-if="notLoaded">not loaded</div>
			</div>
			<template v-if="expanded && partition && instance">
				<InstanceProperty
					:overrides="overrides"
					:instance="instance"
					:partition="partition"
					:reference-links="link"
					@input="$emit('input', $event)"
				></InstanceProperty>
			</template>
		</template>
		<template v-else>
			<div class="ReferenceBox" @click="expanded = !expanded">
				<div>
					<div class="type">{{ instance ? instance.typeName : type }}</div>
					<div class="path null">null</div>
				</div>
			</div>
		</template>
	</div>
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
	},
	props: {
		overrides: {
			type: Object,
			default() {
				return {};
			},
			required: false
		}
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

	data(): {
		loading: boolean;
		notLoaded: boolean;
		instance: any | null;
		expanded: false;
		referencePath: string;
		partition: Partition | null;
		cleanPath: string;
		guid: string;
		referenceObjectBlueprint: string;
	} {
		return {
			loading: true,
			notLoaded: false,
			instance: null,
			expanded: false,
			referencePath: '',
			partition: null,
			cleanPath: '',
			guid: '',
			referenceObjectBlueprint: ''
		};
	}

	// Only an actually-resolved instance is expandable; clicking a loading/unresolved
	// chip is a no-op (it keeps loading in the background).
	toggle() {
		if (this.$data.instance) {
			this.$data.expanded = !this.$data.expanded;
		}
	}

	mounted() {
		if (!this.reference) {
			return;
		}
		// Frostbite INTERNAL references carry a ZERO partition guid
		// (00000000-0000-0000-0000-000000000000): the target instance lives in the SAME
		// partition as the field. Resolve those against the containing partition (whose
		// name is currentPath) — a global getPartition(zero-guid) returns null, which is
		// why every internal reference was wrongly rendering "not loaded". External refs
		// (non-zero guid) still resolve by guid; if that partition isn't registered it
		// genuinely isn't loaded client-side, so the placeholder is correct there.
		const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
		const refPartitionGuid = this.reference.partitionGuid
			? this.reference.partitionGuid.toString().toLowerCase()
			: ZERO_GUID;
		const partition =
			refPartitionGuid === ZERO_GUID
				? window.editor.fbdMan.getPartitionByName(this.currentPath)
				: window.editor.fbdMan.getPartition(this.reference.partitionGuid);
		if (!partition) {
			console.warn(
				`Reference target partition not loaded: ${refPartitionGuid}/${this.reference.instanceGuid}`
			);
			this.$data.loading = false;
			this.$data.notLoaded = true;
			return;
		}
		this.$data.partition = partition;
		this.$data.partition.data
			.then(() => {
				this.$data.referencePath = this.$data.partition.name;
				this.$data.instance =
					this.$data.partition.instances[this.reference.instanceGuid.toString().toLowerCase()];
				this.$data.loading = false;
				// Partition loaded but this instance isn't in it (a different partition that
				// wasn't fully provided). Show the placeholder instead of dereferencing
				// undefined (`.guid` / `.typeName`) below.
				if (!this.$data.instance) {
					this.$data.notLoaded = true;
					return;
				}
				if (this.autoOpen) {
					this.$data.expanded = true;
				}
				this.$data.cleanPath = './';
				const regEx = new RegExp(this.currentPath.substring(0, this.currentPath.lastIndexOf('/')), 'ig');
				if (this.$data.partition.name.toLowerCase() !== this.currentPath.toLowerCase()) {
					// If instance is not located in the current path
					const path = this.$data.partition.name.replace(regEx, '');
					if (path.startsWith('/')) {
						this.$data.cleanPath = '.' + path + '/'; // Strip the path from the filename
					} else {
						this.$data.cleanPath = path + '/'; // Strip the path from the filename
					}
				}
				this.$data.guid = this.$data.instance.guid;

				if (this.$data.instance.typeName === 'ReferenceObjectData') {
					// The blueprint field can itself be a null / unresolved reference — guard
					// every hop so a nested unloaded partition can't crash the inspector.
					const blueprint = this.$data.instance.fields.blueprint && this.$data.instance.fields.blueprint.value;
					const bpPartition = blueprint && blueprint.getPartition && blueprint.getPartition();
					if (bpPartition) {
						bpPartition.data
							.then(() => {
								const bpInstance = blueprint.getInstance && blueprint.getInstance();
								if (bpInstance && bpInstance.fields.name) {
									this.$data.referenceObjectBlueprint = String(bpInstance.fields.name.value).replace(
										regEx,
										''
									);
								}
							})
							.catch(() => {
								/* nested blueprint partition not loaded — leave label blank */
							});
					}
				}
			})
			.catch((e: any) => {
				console.warn(
					`Failed to resolve reference ${this.reference.partitionGuid}/${this.reference.instanceGuid}`,
					e
				);
				this.$data.loading = false;
				this.$data.notLoaded = true;
			});
	}
}
</script>
<style lang="scss" scoped>
/* Block root that fills its column, so the chip is a full-width header and its
   expanded fields stack beneath it. */
.reference-property {
	display: block;
	width: 100%;
	min-width: 0;
}

/* Reference field rendered as a clickable chip: accent spine + target type,
   an expand caret, and a truncated monospace path/guid — the kind of link an
   engine inspector shows for an object reference. */
.ReferenceBox {
	padding: 6px 9px;
	margin: 0;
	background-color: rgba(22, 25, 36, 0.8);
	color: #8da1b6;
	width: 100%;
	box-sizing: border-box;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-left: 2px solid #037fff;
	border-radius: 5px;
	cursor: pointer;
	transition: background-color 0.1s ease, border-color 0.1s ease;

	&:hover {
		background-color: rgba(22, 25, 36, 1);
		border-color: rgba(3, 127, 255, 0.5);
		border-left-color: #037fff;
	}

	&.expanded {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom: 0;
	}

	.type {
		display: flex;
		align-items: center;
		color: #4ea3ff;
		font-size: 12px;
		font-weight: 600;
		margin-bottom: 3px;

		/* CSS-triangle caret — unicode arrows render as tofu in Gameface. */
		&::before {
			content: '';
			display: inline-block;
			width: 0;
			height: 0;
			border-left: 5px solid #4ea3ff;
			border-top: 4px solid transparent;
			border-bottom: 4px solid transparent;
			margin-right: 7px;
			flex: 0 0 auto;
		}
	}

	&.expanded .type::before {
		transform: rotate(90deg);
	}

	.path {
		font-family: 'Consolas', 'Menlo', monospace;
		font-size: 11px;
		color: #8da1b6;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		/* Gameface (Cohtml) has no :last-of-type. Use a TOP margin instead of a bottom
		   margin + last-child reset, so the final path never leaves trailing space. */
		margin-top: 2px;
	}

	.guid {
		color: #5f6f80;
		margin-left: 6px;
	}

	.path.null {
		color: #7a8797;
		font-style: italic;
	}

	.path.hint {
		color: #7a8797;
		font-style: italic;
	}

	/* Loading: identical chip, just a faint pulse so it reads as "filling in" rather
	   than a different widget. Data streams into the same layout in the background. */
	&.loading {
		cursor: default;
		animation: reference-pulse 1.1s ease-in-out infinite;
	}

	/* Unresolved target: same chip, but dimmed and not clickable (no caret action). */
	&.not-loaded {
		cursor: default;
		opacity: 0.8;
		border-left-color: #5f6f80;
		animation: none;

		.type::before {
			border-left-color: #5f6f80;
		}

		&:hover {
			background-color: rgba(22, 25, 36, 0.8);
			border-color: rgba(255, 255, 255, 0.12);
			border-left-color: #5f6f80;
		}
	}
}

@keyframes reference-pulse {
	0%,
	100% {
		opacity: 0.55;
	}
	50% {
		opacity: 0.85;
	}
}
</style>
