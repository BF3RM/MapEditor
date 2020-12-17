<template>
  <input v-model="inputValue"
         :type="type"
         :min="min"
         :max="max"
         :step="step"
         @input="onInput"
         @blur="onBlur"
         @focus="dirty = true"/>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
	name: 'LazyInput',
	props: {
		value: [Number, String],
		type: String,
		min: [String, Number],
		max: [String, Number],
		step: [String, Number]
	},
	data: () => ({
		inputValue: '' as any,
		dirty: false
	}),
	methods: {
		onBlur() {
			this.dirty = false;
			if (this.inputValue !== this.value) {
				this.inputValue = this.value;
			}
			this.$emit('blur');
		},
		onInput() {
			this.$emit('input', this.inputValue);
		}
	},
	watch: {
		value(newVal) {
			if (!this.dirty) {
				this.inputValue = newVal;
			}
		}
	},
	mounted() {
		this.inputValue = this.value;
	}
});
</script>
