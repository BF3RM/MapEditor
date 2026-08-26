<template>
	<!-- Named root, like .reference-property: the e2e suites reach the rendered field order
	     through it (document.querySelectorAll('.instance-property')[i].__vue__). -->
	<div class="instance-property">
		<div class="table-container" v-if="visible">
			<div class="table is-bordered">
				<!-- Grouped: one header per type in the inheritance chain, base-most first. -->
				<template v-if="groups.length > 0">
					<template v-for="group in groups">
						<div
							class="type-group"
							:class="{ collapsed: collapsed[group.typeName] }"
							:key="'group-' + group.typeName"
							:title="group.typeName"
							@click="toggleGroup(group.typeName)"
						>
							<span class="type-caret"></span>
							<span class="type-name">{{ group.typeName }}</span>
							<span class="type-count">{{ group.fields.length }}</span>
						</div>
						<Property
							v-for="field in collapsed[group.typeName] ? [] : group.fields"
							:currentPath="partition.name"
							:partition="partition"
							:instance="instance"
							:field="field"
							:overrides="getOverrides(field.name)"
							:key="group.typeName + '.' + field.name"
							@input="$emit('input', $event)"
						></Property>
					</template>
				</template>
				<!-- No ordering on the wire (webx / emulator): flat list, as before. -->
				<template v-else>
					<Property
						:currentPath="partition.name"
						v-for="(field, index) in instance.fields"
						:partition="partition"
						:instance="instance"
						:field="field"
						:overrides="getOverrides(field.name)"
						:key="index"
						@input="$emit('input', $event)"
					></Property>
				</template>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Instance, { FieldGroup } from '../../../../types/ebx/Instance';
import Property from './Property.vue';

export default Vue.extend({
	name: 'InstanceProperty',
	components: {
		Property
	},
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		instance: {
			type: Object as PropType<Instance>,
			required: true
		},
		overrides: {
			type: Object,
			default() {
				return {};
			},
			required: false
		}
	},
	data() {
		return {
			visible: true,
			// typeName -> hidden. Keyed by type rather than by index so it survives the instance
			// being re-rendered after an EBX edit is echoed back.
			collapsed: {} as { [typeName: string]: boolean }
		};
	},
	computed: {
		// The declaring-type grouping the serializer sent, or [] when it sent none.
		groups(): FieldGroup[] {
			return (this.instance && this.instance.groups) || [];
		}
	},
	methods: {
		getOverrides(field: string): any {
			if (this.overrides) {
				return this.overrides[field];
			}
		},
		toggleGroup(typeName: string) {
			// Vue 2 cannot see a key added to a plain object after creation.
			this.$set(this.collapsed, typeName, !this.collapsed[typeName]);
		}
	}
});
</script>

<style lang="scss" scoped>
input[type='text'].input {
	max-width: 20%;
}

/* Body of an (expanded) instance: a subtle left guide line + indent marks the
   nesting depth instead of a boxed-in border, so deep structures stay legible.
   Sits flush under the ReferenceBox header that toggled it open. */
.table-container {
	padding: 4px 0 6px 10px;
	margin-left: 1px;
	border-left: 1px solid rgba(141, 161, 182, 0.22);
	background-color: rgba(22, 25, 36, 0.25);
	border-bottom-left-radius: 4px;
	border-bottom-right-radius: 4px;
}

/* Declaring-type header: which class in the inheritance chain owns the rows beneath it.
   Quieter than a field row (it is structure, not data) but with the accent colour that
   marks type names everywhere else in the inspector. */
.type-group {
	/* Gameface (Cohtml) has no CSS Grid -> flexbox. */
	display: flex;
	align-items: center;
	min-width: 0;
	padding: 5px 6px 3px 0;
	margin-top: 4px;
	border-bottom: 1px solid rgba(141, 161, 182, 0.18);
	cursor: pointer;
	user-select: none;
}

.type-group:hover .type-name {
	color: #4ea3ff;
}

/* CSS-triangle caret — unicode arrows render as tofu in Gameface. */
.type-caret {
	display: inline-block;
	width: 0;
	height: 0;
	border-left: 4px solid #6f8298;
	border-top: 3px solid transparent;
	border-bottom: 3px solid transparent;
	margin-right: 6px;
	flex: 0 0 auto;
	transform: rotate(90deg);
}

.type-group.collapsed .type-caret {
	transform: none;
}

.type-name {
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.4px;
	text-transform: uppercase;
	color: #7f93a8;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	min-width: 0;
}

.type-count {
	margin-left: 6px;
	flex: 0 0 auto;
	font-size: 10px;
	color: #5f6f80;
}
</style>
