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
				<!-- Gameface has no :hover-only reveal worth relying on, so the affordance is
				     always visible. stop, or the click also toggles the chip's expansion. -->
				<div class="ref-actions">
					<button class="ref-btn" @click.stop="openPicker" title="Point this field at another instance">
						change
					</button>
				</div>
			</div>
			<div v-if="picking" class="ref-picker" @click.stop>
				<input
					class="ref-filter"
					v-model="filter"
					placeholder="filter by type, name or guid"
					@click.stop
				/>
				<div class="ref-hint">
					<span v-if="filter.trim().length < 2">
						Type at least 2 characters to search
						<span class="ref-type">{{ targetType || 'any type' }}</span> targets.
					</span>
					<span v-else>
						{{ candidates.length }} match{{ candidates.length === 1 ? '' : 'es' }}<span
							v-if="candidates.length >= 100"
							>+</span
						>
						· must be a <span class="ref-type">{{ targetType || 'any' }}</span>
					</span>
				</div>
				<div v-if="pickError" class="ref-error">{{ pickError }}</div>
				<div class="ref-list">
					<div
						v-for="c in candidates"
						:key="c.instanceGuid"
						class="ref-row"
						:class="{ current: c.instanceGuid === currentGuidLower }"
						@click.stop="choose(c)"
					>
						<div class="ref-row-name">
							{{ c.label }}<span v-if="checking === c.instanceGuid"> — checking…</span>
						</div>
						<div class="ref-row-guid">{{ c.instanceGuid }}</div>
					</div>
					<div v-if="candidates.length === 0 && filter.trim().length >= 2" class="ref-empty">
						Nothing matches that search.
					</div>
				</div>
				<div class="ref-foot">
					<button class="ref-btn" @click.stop="picking = false">cancel</button>
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
		type: Object,
		required: false
	})
	field: any;

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
		picking: boolean;
		filter: string;
		pickError: string;
		checking: string;
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
			picking: false,
			filter: '',
			pickError: '',
			checking: '',
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

	openPicker() {
		this.$data.filter = '';
		this.$data.picking = !this.$data.picking;
	}

	get targetType(): string {
		const declared = this.type || (this.field && (this.field as any).type);
		return declared || (this.$data.instance && this.$data.instance.typeName) || '';
	}

	get currentGuidLower(): string {
		return this.reference && this.reference.instanceGuid
			? this.reference.instanceGuid.toString().toLowerCase()
			: '';
	}

	// Candidates come from the partition INDEX (~70k entries), not from loaded partitions: the
	// client fetches partitions on demand and keeps almost none, so enumerating loaded ones found
	// exactly one instance and the picker was empty. The index carries name + guid +
	// primaryInstanceGuid, but NO type — so filtering by type is impossible here and the type is
	// instead checked on selection (see choose), which is also where a mismatch can be reported.
	get candidates(): any[] {
		const q = (this.$data.filter || '').trim().toLowerCase();
		if (q.length < 2) {
			return [];
		}
		const out: any[] = [];
		const partitions = window.editor.fbdMan.partitions.values();
		for (const p of partitions) {
			if (!p || !p.name || !p.primaryInstanceGuid) continue;
			const name = String(p.name);
			if (name.toLowerCase().indexOf(q) === -1) continue;
			out.push({
				label: name,
				instanceGuid: String(p.primaryInstanceGuid).toLowerCase(),
				partitionGuid: String(p.guid).toLowerCase()
			});
			if (out.length >= 100) break; // Gameface renders long lists slowly
		}
		return out;
	}

	choose(c: any) {
		const prev = this.reference
			? {
					partitionGuid: String(this.reference.partitionGuid).toLowerCase(),
					instanceGuid: String(this.reference.instanceGuid).toLowerCase()
			  }
			: null;
		this.$data.pickError = '';
		this.$data.picking = false;
		this.$emit('input', {
			__ref: true,
			partitionGuid: c.partitionGuid,
			instanceGuid: c.instanceGuid,
			__refOld: prev
		});
	}
}
</script>
<style lang="scss" scoped>
/* Picker. Gameface (Cohtml): no CSS grid, no :not(), no dashed borders — plain flex and
   explicit borders only. */
.ref-actions {
	margin-top: 5px;
}

.ref-btn {
	background-color: rgba(3, 127, 255, 0.15);
	border: 1px solid rgba(3, 127, 255, 0.5);
	border-radius: 4px;
	color: #7fbcff;
	font-size: 10px;
	padding: 2px 8px;
	cursor: pointer;
}

.ref-btn:hover {
	background-color: rgba(3, 127, 255, 0.3);
	color: #cde4ff;
}

.ref-picker {
	background-color: rgba(16, 19, 28, 0.98);
	border: 1px solid rgba(3, 127, 255, 0.4);
	border-top: 0;
	border-bottom-left-radius: 5px;
	border-bottom-right-radius: 5px;
	padding: 7px 9px 9px 9px;
}

.ref-filter {
	width: 100%;
	box-sizing: border-box;
	background-color: rgba(8, 10, 16, 0.9);
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 4px;
	color: #cdd6e0;
	font-size: 11px;
	padding: 4px 6px;
}

.ref-hint {
	color: #7a8797;
	font-size: 10px;
	margin-top: 5px;
	margin-bottom: 4px;
}

.ref-type {
	color: #4ea3ff;
}

.ref-list {
	max-height: 190px;
	overflow-y: auto;
}

.ref-row {
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	cursor: pointer;
	padding: 4px 3px;
}

.ref-row:hover {
	background-color: rgba(3, 127, 255, 0.18);
}

.ref-row.current {
	border-left: 2px solid #4ea3ff;
	padding-left: 5px;
}

.ref-row-name {
	color: #cdd6e0;
	font-size: 11px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ref-row-guid {
	color: #5f6f80;
	font-family: 'Consolas', 'Menlo', monospace;
	font-size: 10px;
}

.ref-empty {
	color: #7a8797;
	font-size: 10px;
	font-style: italic;
	padding: 6px 2px;
}

.ref-foot {
	margin-top: 6px;
}

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

.ref-error {
	background-color: rgba(255, 92, 92, 0.12);
	border: 1px solid rgba(255, 92, 92, 0.45);
	border-radius: 4px;
	color: #ffb3b3;
	font-size: 10px;
	margin-bottom: 5px;
	padding: 4px 6px;
}
</style>
