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
				<div v-if="referenceName" class="path name" :title="referenceName">{{ referenceName }}</div>
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
import { Component, Prop, Watch } from 'vue-property-decorator';
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
		referenceName: string;
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
			referenceObjectBlueprint: '',
			referenceName: ''
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
		this.resolve();
	}

	// The reference prop ARRIVES LATE.
	//
	// Resolution used to happen only in mounted(), which runs once. The inspector renders this chip
	// before the partition it describes has finished loading, so `reference` is frequently
	// undefined at mount: the component returned early and then sat at its initial state forever —
	// loading:true (so the chip pulses) and instance:null (so toggle() refuses to expand). That is
	// the "it blinks and won't open" symptom; nothing was broken, the chip was never told to look
	// again once its data arrived.
	@Watch('reference')
	onReferenceChanged() {
		this.$data.loading = true;
		this.$data.notLoaded = false;
		this.$data.instance = null;
		this.$data.partition = null;
		this.$data.expanded = false;
		this.$data.referenceName = '';
		this.$data.referenceObjectBlueprint = '';
		this.resolve();
	}

	resolve() {
		if (!this.reference) {
			// A null reference is a FINISHED state, not a pending one. Leaving loading true here is
			// what made empty reference fields pulse indefinitely.
			this.$data.loading = false;
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
		let partition =
			refPartitionGuid === ZERO_GUID
				? window.editor.fbdMan.getPartitionByName(this.currentPath)
				: window.editor.fbdMan.getPartition(this.reference.partitionGuid);
		// External reference (non-zero partition guid) not cached yet: REGISTER it so it fetches
		// on demand from the game (getPartition is a pure lookup). Pass the target instance guid as
		// a hint so the server can single-instance-resolve when the whole partition isn't cached.
		if (!partition && refPartitionGuid !== ZERO_GUID) {
			partition = window.editor.fbdMan.registerPartition(
				refPartitionGuid,
				this.reference.partitionGuid,
				this.reference.instanceGuid.toString()
			);
		}
		if (!partition) {
			// No partition to try — resolve the instance globally by its guid instead of giving up.
			this.resolveGlobally();
			return;
		}
		// const so TS keeps it non-null inside the async closure below.
		const resolved = partition;
		this.$data.partition = resolved;
		resolved.data
			.then(() => {
				const inst = resolved.instances[this.reference.instanceGuid.toString().toLowerCase()];
				if (!inst) {
					// Instance isn't in this partition. A ZERO partition guid does NOT always mean
					// "same partition": Frostbite leaves it zero for IMPORTED blueprint references
					// (e.g. VehicleSpawnReferenceObjectData.blueprint), which the engine resolves
					// GLOBALLY by instance guid at load. Search across all loaded partitions instead
					// of rendering "not loaded".
					this.resolveGlobally();
					return;
				}
				this.onInstanceResolved(inst, resolved);
			})
			.catch((e: any) => {
				console.warn(
					`Failed to resolve reference ${this.reference.partitionGuid}/${this.reference.instanceGuid}`,
					e
				);
				this.resolveGlobally();
			});
	}

	// Resolve the reference target by its INSTANCE guid alone, across all loaded partitions —
	// for imported/zero-partition references. Registers a synthetic partition keyed by the instance
	// guid; the server's PartitionSerializer falls back to SearchForInstanceByGuid and returns a
	// one-instance partition.
	resolveGlobally() {
		const instGuidStr = this.reference.instanceGuid.toString();
		const p = window.editor.fbdMan.registerPartition(instGuidStr, this.reference.instanceGuid, instGuidStr);
		this.$data.partition = p;
		p.data
			.then(() => {
				const inst = p.instances[instGuidStr.toLowerCase()];
				if (!inst) {
					this.$data.loading = false;
					this.$data.notLoaded = true;
					return;
				}
				this.onInstanceResolved(inst, p);
			})
			.catch((e: any) => {
				console.warn(`Global reference resolve failed ${instGuidStr}`, e);
				this.$data.loading = false;
				this.$data.notLoaded = true;
			});
	}

	// Shared handling once the target instance is resolved (from either the partition or the global
	// path): fill the chip label/path and, for a nested ReferenceObjectData, its blueprint name.
	onInstanceResolved(instance: any, partition: any) {
		this.$data.instance = instance;
		this.$data.referencePath = partition.name;
		this.$data.loading = false;
		if (this.autoOpen) {
			this.$data.expanded = true;
		}
		this.$data.cleanPath = './';
		const regEx = new RegExp(this.currentPath.substring(0, this.currentPath.lastIndexOf('/')), 'ig');
		if (partition.name && partition.name.toLowerCase() !== this.currentPath.toLowerCase()) {
			const path = partition.name.replace(regEx, '');
			this.$data.cleanPath = path.startsWith('/') ? '.' + path + '/' : path + '/';
		}
		this.$data.guid = instance.guid;

		// Surface the target's own name/path so the chip says WHAT it points to (e.g. which
		// vehicle blueprint), not just its type. Blueprints carry their asset path in `name`.
		if (instance.fields && instance.fields.name && instance.fields.name.value != null) {
			this.$data.referenceName = String(instance.fields.name.value);
		}

		if (instance.typeName === 'ReferenceObjectData') {
			const blueprint = instance.fields.blueprint && instance.fields.blueprint.value;
			const bpPartition = blueprint && blueprint.getPartition && blueprint.getPartition();
			if (bpPartition) {
				bpPartition.data
					.then(() => {
						const bpInstance = blueprint.getInstance && blueprint.getInstance();
						if (bpInstance && bpInstance.fields.name) {
							this.$data.referenceObjectBlueprint = String(bpInstance.fields.name.value).replace(regEx, '');
						}
					})
					.catch(() => {
						/* nested blueprint partition not loaded — leave label blank */
					});
			}
		}
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

	/* The target's own name/path (which blueprint this points to) — the most useful line, so
	   give it the readable body colour and let it wrap instead of truncating the tail. */
	.path.name {
		color: #cdd6e0;
		font-weight: 600;
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
