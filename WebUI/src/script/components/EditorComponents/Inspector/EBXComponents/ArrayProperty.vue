<template>
    <div class="value">
		<div @click="visible = !visible">
			<template v-if="field.value.length">
				<i :class="{'el-icon-arrow-down': visible, 'el-icon-arrow-right': !visible}"></i>
			</template>
			<template v-if="field.value.length === 1">
				{{ field.value.length }} element
			</template>
			<template v-else>
				{{ field.value.length }} elements
			</template>
		</div>
        <div class="table-container" v-if="visible">
            <table class="table is-array-element">
                <tbody>
					<div v-for="(value, index) in field.value" :key="value.name">
						<property class="arrayEntry" :autoOpen="autoOpen" :currentPath=currentPath :partition="partition" :field="value" :instance="instance"></property>
					</div>
                </tbody>
            </table>
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
		}
	},
	data() {
		return {
			visible: this.field.value.length <= 10 && ['propertyConnections', 'linkConnections', 'eventConnections'].indexOf(this.field.name) < 0
		};
	}
});
</script>

<style lang="scss" scoped>

.value {
  vertical-align: text-top;

  button {
    margin-left: 0.5em;
  }
}

</style>

<style lang="scss">

.table.is-array-element > tbody > tr > td {
  border: none;
}

</style>
