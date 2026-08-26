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
				<!-- stop: clicking Replace must not also expand the chip -->
				<button class="ref-replace" @click.stop="togglePicker" title="Point this field at a different instance">
					{{ picking ? '×' : 'Replace' }}
				</button>
			</div>

			<!-- Picker. Compatible candidates only by default, because a reference pointed at the
			     wrong type is not an edit the engine can use -- but the filter is a guess based on
			     the declared type name, so it can be switched off rather than hiding the one entry
			     someone actually needs. -->
			<div class="ref-picker" v-if="picking" @click.stop>
				<input
					ref="refSearch"
					class="ref-search"
					v-model="query"
					type="text"
					:placeholder="'Search ' + (expectedType || 'instances') + '…'"
				/>
				<label class="ref-compat">
					<input type="checkbox" v-model="compatibleOnly" />
					compatible only ({{ expectedType || 'any' }})
				</label>
				<div class="ref-results">
					<div v-if="candidates.length === 0" class="ref-empty">
						no matches{{ compatibleOnly ? ' — try turning off the type filter' : '' }}
					</div>
					<div
						v-for="c in candidates"
						:key="c.partitionGuid + '/' + c.instanceGuid"
						class="ref-result"
						:class="{ current: c.instanceGuid === currentInstanceGuid }"
						@click="pick(c)"
						:title="c.name"
					>
						<span class="ref-r-type">{{ c.typeName }}</span>
						<span class="ref-r-name">{{ c.name }}</span>
					</div>
					<div v-if="truncated" class="ref-empty">…refine the search to see more</div>
				</div>
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
	// A level holds tens of thousands of instances; Gameface renders a list that long slowly
	// enough to read as a hang. Searching is how you get past this, and the list says so.
	static MAX_RESULTS = 60;

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

	// Picker state. Deliberately local: a half-typed search should not survive reselecting.
	picking = false;
	query = '';
	compatibleOnly = true;

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

	togglePicker() {
		this.picking = !this.picking;

		if (this.picking) {
			this.query = '';
			// Focus after the panel exists, or the input is not in the DOM yet.
			this.$nextTick(() => {
				const el = this.$refs.refSearch as HTMLInputElement | undefined;
				if (el && el.focus) el.focus();
			});
		}
	}

	/** The type this field wants, used to filter candidates. */
	get expectedType(): string {
		const inst = this.$data.instance;
		return (inst && inst.typeName) || this.type || '';
	}

	get currentInstanceGuid(): string {
		return this.reference ? String(this.reference.instanceGuid) : '';
	}

	/**
	 * Candidates to point this reference at.
	 *
	 * Two sources, because a reference can target either: BLUEPRINTS (what the browser lists, and
	 * what a ReferenceObjectData.blueprint wants) and INSTANCES already loaded in partitions. The
	 * ext accepts {partitionGuid, instanceGuid} either way -- it does not care which list the user
	 * found it in.
	 *
	 * Capped, because a level holds tens of thousands of instances and Gameface renders a long list
	 * slowly enough to look hung. Refining the search is the way to see past the cap; the list says
	 * so rather than silently stopping.
	 */
	get candidates(): { partitionGuid: string; instanceGuid: string; typeName: string; name: string }[] {
		const q = (this.query || '').toLowerCase().trim();
		const want = (this.expectedType || '').toLowerCase();
		const out: { partitionGuid: string; instanceGuid: string; typeName: string; name: string }[] = [];

		const matches = (typeName: string, name: string) => {
			if (this.compatibleOnly && want && String(typeName).toLowerCase() !== want) return false;
			if (!q) return true;
			return String(name).toLowerCase().indexOf(q) !== -1 ||
				String(typeName).toLowerCase().indexOf(q) !== -1;
		};

		try {
			const bm = (window as any).editor && (window as any).editor.blueprintManager;
			const bps = bm && bm.getBlueprints ? bm.getBlueprints() : (bm ? bm.blueprints.values() : []);
			for (const bp of bps || []) {
				if (out.length >= ReferenceComponent.MAX_RESULTS + 1) break;
				if (!bp || !matches(bp.typeName, bp.name)) continue;
				out.push({
					partitionGuid: String(bp.partitionGuid),
					instanceGuid: String(bp.instanceGuid),
					typeName: String(bp.typeName),
					name: String(bp.name)
				});
			}
		} catch (e) {
			// A missing browser must not take the inspector down; instances below may still serve.
		}

		try {
			const partition = (this as any).$props.partition;
			const insts = partition && partition.instances ? partition.instances : {};
			for (const guid of Object.keys(insts)) {
				if (out.length >= ReferenceComponent.MAX_RESULTS + 1) break;
				const inst = insts[guid];
				if (!inst) continue;
				const name = inst.name || inst.typeName || guid;
				if (!matches(inst.typeName, name)) continue;
				if (String(guid) === this.currentInstanceGuid) continue;
				out.push({
					partitionGuid: String(partition.guid),
					instanceGuid: String(guid),
					typeName: String(inst.typeName),
					name: String(name)
				});
			}
		} catch (e) {
			// same rationale as above
		}

		return out.slice(0, ReferenceComponent.MAX_RESULTS);
	}

	get truncated(): boolean {
		return this.candidates.length >= ReferenceComponent.MAX_RESULTS;
	}

	/**
	 * Point the field at `c`.
	 *
	 * Emits the `__ref` shape Property.onChangeValue already understands -- it wraps this into the
	 * ext's edit grammar (a `ref: true` terminal whose value is {partitionGuid, instanceGuid}),
	 * because the field NAME is known there and not here.
	 */
	pick(c: { partitionGuid: string; instanceGuid: string }) {
		const old = this.reference
			? { partitionGuid: String(this.reference.partitionGuid), instanceGuid: String(this.reference.instanceGuid) }
			: undefined;

		this.$emit('input', {
			__ref: true,
			partitionGuid: c.partitionGuid,
			instanceGuid: c.instanceGuid,
			__refOld: old
		});

		this.picking = false;
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

/* Reference picker. Kept inside the chip's own block so it scrolls with the inspector rather
   than floating over it — Gameface has no portal/overlay layer to rely on. */
.ref-replace {
	float: right;
	font-size: 9px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 1px 5px;
	margin-left: 6px;
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 2px;
	background: rgba(255, 255, 255, 0.06);
	color: #cfd6e4;
	cursor: pointer;
}
.ref-replace:hover {
	background: rgba(120, 170, 255, 0.22);
}
.ref-picker {
	padding: 6px;
	border: 1px solid rgba(120, 170, 255, 0.25);
	border-top: none;
	background: rgba(0, 0, 0, 0.22);
}
.ref-search {
	width: 100%;
	box-sizing: border-box;
	padding: 3px 5px;
	background: rgba(0, 0, 0, 0.35);
	border: 1px solid rgba(255, 255, 255, 0.15);
	color: #e8edf5;
	font-size: 11px;
}
.ref-compat {
	display: block;
	font-size: 10px;
	opacity: 0.75;
	margin: 4px 0;
}
.ref-results {
	max-height: 180px;
	overflow-y: auto;
}
.ref-result {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	padding: 2px 4px;
	font-size: 11px;
	cursor: pointer;
}
.ref-result:hover {
	background: rgba(120, 170, 255, 0.18);
}
.ref-result.current {
	opacity: 0.5;
}
.ref-r-type {
	color: #9ec5ff;
	flex: 0 0 auto;
}
.ref-r-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.85;
}
.ref-empty {
	font-size: 10px;
	opacity: 0.6;
	padding: 4px;
}
</style>
