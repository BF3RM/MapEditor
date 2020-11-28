<template>
    <div class="value">
        <template v-if="field.value.length === 1">
            {{ field.value.length }} element
        </template>
        <template v-else>
            {{ field.value.length }} elements
        </template>

        <template v-if="field.value.length">
            <button class="button is-small" v-if="visible" @click="visible = false">Hide</button>
            <button class="button is-small" v-else @click="visible = true">Show</button>
        </template>

        <div class="table-container" v-if="visible">
            <table class="table is-array-element">
                <tbody>
                <property v-for="(value, index) in field.value"
                          :partition="partition" :field="value" :key="index"></property>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';
export default Vue.extend({
	name: 'ArrayProperty',
	components: {
		'property': () => import('./Property.vue')
	},
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		field: {
			type: Object as PropType<Field<any>>,
			required: true
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
