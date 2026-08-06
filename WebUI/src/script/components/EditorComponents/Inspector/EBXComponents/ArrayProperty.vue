<template>
	<div class="value">
		<div @click="visible = !visible" class="elements">
			<template v-if="field.value.length">
				<i :class="{ 'el-icon-arrow-down': visible, 'el-icon-arrow-right': !visible }"></i>
			</template>
			<template v-if="field.value.length === 1"> {{ field.value.length }} element </template>
			<template v-else> {{ field.value.length }} elements </template>
		</div>
		<div class="table-container" v-if="visible">
			<div class="table is-array-element">
				<div v-for="value in field.value" :key="value.name">
					<property
						:overrides="getOverrides(value.name)"
						class="arrayEntry"
						:autoOpen="autoOpen"
						:currentPath="currentPath"
						:partition="partition"
						:field="value"
						:instance="instance"
						@input="onInput($event, value)"
					></property>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

import Property from './Property.vue';
import Instance from '@/script/types/ebx/Instance';

export default Vue.extend({
	name: 'ArrayProperty',
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
		field: {
			type: Object as PropType<Field<any>>,
			required: true
		},
		autoOpen: {
			type: Boolean,
			required: false
		},
		currentPath: {
			type: String,
			required: false
		},
		overrides: {
			type: Object,
			default() {
				return {};
			},
			required: false
		}
	},
	methods: {
		onInput(event: any) {
			this.$emit('input', event);
		},
		getOverrides(field: string): any {
			if (this.overrides) {
				return this.overrides[Number(field)];
			}
		}
	},
	data() {
		return {
			visible:
				this.field.value.length <= 10 &&
				['propertyConnections', 'linkConnections', 'eventConnections'].indexOf(this.field.name) < 0
		};
	}
});
</script>

<style lang="scss" scoped>
/* Array field: a collapsible "N elements" header row, then an indented list of
   entries sharing the same left-guide nesting cue as structs/instances. */
.elements {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 3px 6px;
	margin-bottom: 4px;
	font-size: 12px;
	color: #8da1b6;
	cursor: pointer;
	border-radius: 4px;
	user-select: none;

	i {
		font-size: 12px;
		color: #037fff;
	}

	&:hover {
		background: rgba(141, 161, 182, 0.07);
		color: #dfe4ea;
	}
}

.value {
	vertical-align: text-top;

	::v-deep .el-select {
		width: 100%;
	}
}

.table-container {
	padding-left: 10px;
	margin-left: 1px;
	border-left: 1px solid rgba(141, 161, 182, 0.18);
}

/* Separate each array element a touch so lists of structs don't run together. */
.is-array-element > div + div {
	margin-top: 2px;
	padding-top: 2px;
	border-top: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
