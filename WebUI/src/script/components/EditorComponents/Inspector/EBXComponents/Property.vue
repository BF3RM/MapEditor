<template>
	<div v-if="field.name !== 'name'" class="row" :class="['row-' + rowKind, { overridden: isOverridden }]">
		<div
			class="is-family-code is-narrow field-name"
			:class="{ numbered: !isNaN(Number(field.name)) }"
			:title="titleName"
		>
			{{ titleName }}
		</div>
		<div class="field-value">
			<div class="field-spacer">
				<component
					:type="field.type"
					:class="field.type"
					:autoOpen="autoOpen"
					:currentPath="currentPath"
					:is="propertyComponent"
					:partition="partition"
					:field="field"
					:value="getValue()"
					@input="onChangeValue(field.name, $event)"
					:instance="instance"
					:reference="field.value"
					:overrides="getOverrides()"
				></component>
			</div>
			<button
				v-if="isOverridden && isLeaf"
				class="field-revert"
				@click="revert"
				title="Revert this field to the blueprint value"
			>
				⟲
			</button>
		</div>
	</div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

import LinearTransformControl from '@/script/components/controls/LinearTransformControl.vue';
import StringControl from '@/script/components/controls/StringControl.vue';
import NumberControl from '@/script/components/controls/NumberControl.vue';
import BoolControl from '@/script/components/controls/BoolControl.vue';
import Vec2Control from '@/script/components/controls/Vec2Control.vue';
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import Vec4Control from '@/script/components/controls/Vec4Control.vue';
import GuidControl from '@/script/components/controls/GuidControl.vue';
import Instance from '@/script/types/ebx/Instance';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';
import { CtrRef } from '@/script/types/CtrRef';

// Frostbite scalar type-names. The live VEXT serializer emits engine names
// (Uint32, Float32, Int64, CString, ...) while the old webx JSON used pipeline
// names (Single, Int32, UInt32, String). Handle BOTH so scalars never fall through
// to ObjectProperty (which would iterate a string's characters / render a number blank).
const NUMBER_TYPES = new Set([
	'Single',
	'Double',
	'Float8',
	'Float16',
	'Float32',
	'Float64',
	'Int8',
	'Int16',
	'Int32',
	'Int64',
	'Uint8',
	'Uint16',
	'Uint32',
	'Uint64',
	'UInt16',
	'UInt32',
	'UInt64',
	'SByte',
	'Byte'
]);
const STRING_TYPES = new Set(['String', 'CString']);
// Single-line label|value row (primitives + guid + enum + bool).
const INLINE_TYPES = new Set([...NUMBER_TYPES, ...STRING_TYPES, 'Boolean', 'Guid']);
// Full-width label-above-control row (grouped vector/transform editors).
const WIDE_TYPES = new Set(['Vec2', 'Vec3', 'Vec4', 'LinearTransform']);

export default Vue.extend({
	name: 'Property',
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		field: {
			type: Object as PropType<Field<Instance>>,
			required: true
		},
		instance: {
			type: Object as PropType<Instance>,
			required: true
		},
		currentPath: {
			type: String,
			required: true
		},
		autoOpen: {
			type: Boolean,
			required: false
		},
		overrides: {
			type: undefined,
			default() {
				return null;
			},
			required: false
		}
	},
	methods: {
		onChangeValue(field: string, newValue: any) {
			const out: IEBXFieldData = {
				reference: new CtrRef(undefined, undefined, this.partition.guid, this.instance.guid),
				field: field,
				type: this.field.type,
				value: newValue,
				oldValue: this.field.value
			};
			this.$emit('input', out);
		},
		getValue() {
			if (this.overrides) {
				return this.overrides;
			}
			return this.field.value;
		},
		getOverrides() {
			if (this.overrides) {
				return this.overrides;
			}
		},
		// Revert an overridden field back to the blueprint's value (this.field.value is the base
		// partition value; getValue() only shows the override on top). Round-trips through the
		// normal edit path so the ext writes the base value back onto this instance's clone.
		revert() {
			this.onChangeValue(this.field.name, this.field.value);
		}
	},
	computed: {
		// An override exists for THIS field (getOverrides fanned a value down to us). Also true
		// for the container rows on the path to a leaf override, which get the highlight but no
		// revert button (revert is per-value, shown only on leaves).
		isOverridden(): boolean {
			return this.overrides !== null && this.overrides !== undefined;
		},
		// A concrete value row (scalar / enum / vector), not a container (array/reference/struct).
		isLeaf(): boolean {
			return this.rowKind !== 'container';
		},
		// Layout hint for styling only (does NOT affect which control renders):
		//   inline    -> label | value on one line (primitives, enums, bools)
		//   wide      -> label above a full-width control (Vec3 / LinearTransform)
		//   container -> label above an indented, nested block (arrays, refs, structs)
		rowKind(): string {
			if (Array.isArray(this.field.value)) {
				return 'container';
			}
			if (this.field.isReference()) {
				return 'container';
			}
			if (this.field.isEnum()) {
				return 'inline';
			}
			if (WIDE_TYPES.has(this.field.type)) {
				return 'wide';
			}
			if (INLINE_TYPES.has(this.field.type)) {
				return 'inline';
			}
			return 'container';
		},
		propertyComponent() {
			if (Array.isArray(this.field.value)) {
				return () => import('./ArrayProperty.vue');
			} else if (this.field.isReference()) {
				return () => import('./ReferenceProperty.vue');
			}

			const type: any = async () => {
				// Enums first: their $type is the enum's own name, so it must not be
				// mistaken for an unknown struct and fall through to ObjectProperty.
				if (this.field.isEnum()) {
					return import('./EnumProperty.vue');
				}
				switch (this.field.type) {
					case 'Vec2':
						return Vec2Control;
					case 'Vec3':
						return Vec3Control;
					case 'Vec4':
						return Vec4Control;
					case 'LinearTransform':
						return LinearTransformControl;
					case 'Boolean':
						return BoolControl;
					case 'Guid':
						return GuidControl;
				}
				if (STRING_TYPES.has(this.field.type)) {
					return StringControl;
				}
				if (NUMBER_TYPES.has(this.field.type)) {
					return NumberControl;
				}
				// Unknown / composite type -> generic nested key/value renderer.
				return import('./ObjectProperty.vue');
			};

			return type;
		},
		titleName() {
			if (!isNaN(Number(this.field.name))) {
				return '[' + this.field.name + ']';
			}
			return (this.field.name[0].toUpperCase() + this.field.name.substring(1)).replace(
				/([a-z0-9])([A-Z])/g,
				'$1 $2'
			); // Make first character uppercase and make it Title Case
		}
	},
	components: {
		StringControl,
		NumberControl,
		BoolControl
	}
});
</script>
<style lang="scss" scoped>
/* Inspector field row — name -> value, aligned like a game-engine inspector.
   Palette reused from the editor theme (style.scss / EditorComponent.vue):
     muted label  #8da1b6   value text #dfe4ea   accent #037fff
     deep field bg #161924  hairline rgba(255,255,255,.15) */

.row {
	border-radius: 4px;
	/* Gameface (Cohtml) has no CSS Grid -> flexbox everywhere. */
	display: flex;
	min-width: 0;
}

.field-name {
	/* Readable muted label instead of the raw monospace it used before. */
	font-family: 'Roboto', sans-serif;
	font-size: 12px;
	color: #8da1b6;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	min-width: 0;
}

.field-name.numbered {
	display: none;
}

.field-value {
	min-width: 0;
}

/* Overridden field: amber label + faint wash so it stands out from base values, plus a small
   revert button to the right of the input. Highlight also lands on the container rows on the
   path to the override (Unity-style); the revert button only renders on leaf value rows. */
.row.overridden {
	background: rgba(224, 182, 78, 0.07);
}
.row.overridden > .field-name {
	color: #e0b64e;
	font-weight: 600;
}
.field-revert {
	flex: 0 0 auto;
	margin-left: 6px;
	background: rgba(255, 255, 255, 0.06);
	color: #cdd6e0;
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 4px;
	width: 20px;
	height: 20px;
	padding: 0;
	font-size: 12px;
	line-height: 1;
	cursor: pointer;
}
.field-revert:hover {
	background: rgba(224, 82, 82, 0.2);
	border-color: #e05252;
	color: #ff8c8c;
}

/* --- inline: single-line label | value (strings, numbers, bools, enums) --- */
.row-inline {
	flex-flow: row nowrap;
	align-items: center;
	gap: 10px;
	padding: 3px 6px;
	min-height: 26px;

	> .field-name {
		flex: 0 0 42%;
		max-width: 42%;
		padding-top: 1px;
	}

	> .field-value {
		flex: 1 1 0;
		display: flex;
		justify-content: flex-end;
	}

	&:hover {
		background: rgba(141, 161, 182, 0.07);
	}
}

/* --- wide: label above a full-width control (Vec3 / LinearTransform) --- */
.row-wide {
	flex-flow: column nowrap;
	padding: 5px 6px;
	gap: 5px;

	> .field-name {
		flex: 0 0 auto;
		font-weight: 500;
		letter-spacing: 0.2px;
	}

	&:hover {
		background: rgba(141, 161, 182, 0.05);
	}
}

/* --- container: label header above an indented nested block --- */
.row-container {
	flex-flow: column nowrap;
	padding: 5px 6px;
	gap: 5px;

	> .field-name {
		flex: 0 0 auto;
		font-weight: 500;
		letter-spacing: 0.2px;
		color: #9fb2c6;
	}

	/* Numbered array entries ([0], [1]…) hide their label — reclaim the top gap. */
	&.row-inline > .field-name.numbered,
	> .field-name.numbered {
		display: none;
	}
}

.field-spacer {
	min-width: 0;
	width: 100%;
}

/* ---- per-type control polish (child controls live in scoped children, reach
        them with ::v-deep) ------------------------------------------------- */

/* Compact, right-aligned number boxes. */
.field-value ::v-deep .NumberControl {
	width: 100%;
	max-width: 130px;

	input {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
}

.field-value ::v-deep .StringControl {
	width: 100%;

	input {
		width: 100%;
	}
}

/* Vec3 / transform: drop the empty inner label slot (the row already names it)
   and let the X/Y/Z boxes fill the width with their coloured axis letters. */
.field-value ::v-deep .Vec3Control > .label:empty {
	display: none;
}

.field-value ::v-deep .transformControls {
	display: flex;
	flex-direction: column;
	gap: 5px;
}

.field-value ::v-deep .BoolControl {
	display: flex;
	align-items: center;
}
</style>
