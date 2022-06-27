<template>
	<div class="value">
		<el-select v-model="enumValue" @focus="getEnums" @input="onInput($event)">
			<template v-if="options">
				<Promised :promise="options">
					<template v-slot="data">
						<span>
							<el-option v-for="(option, index) in data.values" :key="option.value" :value="option.value"
								><span class="enum">{{ cleanType(index) }}</span></el-option
							>
						</span>
					</template>
					<template v-slot:rejected="error">
						<p>Error: {{ error.message }}</p>
					</template>
				</Promised>
			</template>
			<template v-else>
				<el-option :value="-1">Loading...</el-option>
			</template>
		</el-select>
	</div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Partition from '../../../../types/ebx/Partition';
import Field from '../../../../types/ebx/Field';

import Instance from '@/script/types/ebx/Instance';
import { Promised } from 'vue-promised';
import YAML from 'yaml';
import axios from 'axios';

export default Vue.extend({
	name: 'EnumProperty',
	components: {
		Promised: Promised
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
	data: () => ({
		options: null
	}),
	methods: {
		onInput(value: number) {
			this.$emit('input', value);
		},
		cleanType(index: string) {
			return index.replace(this.field.type + '_', '');
		},
		getEnums() {
			console.log('Grabbing enums');
			// eslint-disable-next-line vue/no-async-in-computed-properties
			this.$data.options = axios
				.get(
					'https://raw.githubusercontent.com/EmulatorNexus/VU-Docs/master/types/fb/' +
						this.field.type +
						'.yaml'
				)
				.then((res: any) => {
					console.log(YAML.parse(res.data));
					console.log(this.$data.options);
					return YAML.parse(res.data);
				})
				.catch((e: any) => {
					console.log(e);
				});
		}
	},
	computed: {
		enumValue: {
			get() {
				return this.field.enumValue!.replace(this.field.type + '_', '');
			},
			set() {
				console.log('Attempted to set enum');
			}
		}
	}
});
</script>

<style lang="scss" scoped>
.enum {
	color: #ebff56;
}
</style>
