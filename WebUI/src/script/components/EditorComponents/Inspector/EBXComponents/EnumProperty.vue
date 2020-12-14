<template>
    <div class="value">
		<el-select v-model="enumValue" @input="onInput($event)">
			<el-option v-for="(option, index) in options.values" :key="option.value" :value="option.value"><span class="enum">{{ cleanType(index) }}</span></el-option>
		</el-select>

    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

import Instance from '@/script/types/ebx/Instance';
const YAML = require('yaml');
const axios = require('axios').default;

export default Vue.extend({
	name: 'EnumProperty',
	components: {
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
		}
	},
	data() {
		return {
			options: []
		};
	},
	methods: {
		onInput(value: number) {
			console.log(value);
		},
		cleanType(index: string) {
			return index.replace(this.field.type + '_', '');
		}
	},
	computed: {
		enumValue: {
			get() {
				return this.cleanType(this.field.enumValue);
			},
			set() {
				console.log('Attempted to set enum');
			}
		}
	},
	mounted() {
		axios.get('https://raw.githubusercontent.com/EmulatorNexus/VU-Docs/master/types/fb/' + this.field.type + '.yaml').then((res) => {
			console.log(YAML.parse(res.data));
			this.$data.options = YAML.parse(res.data);
		}).catch((e) => {
			console.log(e);
		});
	}
});
</script>

<style lang="scss" scoped>
.enum {
	color: #ebff56;
}
</style>
