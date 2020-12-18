<template>
    <div>
        <div class="table-container" v-if="visible">
            <table class="table is-bordered">
                <tbody>
					<Property :currentPath="partition.name" v-for="(field, index) in instance.fields" :partition="partition" :instance="instance" :field="field" :key="index" @input="$emit('input', $event)"></Property>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Instance from '../../../../types/ebx/Instance';
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
		active: String
	},
	data() {
		return {
			visible: true
		};
	},
	mounted() {
		if (location.hash && location.hash.substring(1) === this.instance.guid) {
			this.visible = true;
		}
		console.log(this.$props.partition.name);
	},
	watch: {
		active(guid) {
			if (guid === this.instance.guid) {
				this.visible = true;
			}
		}
	}
});
</script>

<style lang="scss" scoped>

input[type=text].input {
  max-width: 20%;
}
.table-container {
	border-left: 1px solid #00000030;
	border-bottom: 1px solid #00000030;
	border-bottom-left-radius: 0.5em;
	padding-left: 10px;
	background-color: #0000001c;
	padding-bottom: 20px;
	margin-bottom: 20px;
}

</style>
