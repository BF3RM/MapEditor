<template>
	<input
		v-model="inputValue"
		:class="{ error: isNaN(value) }"
		:type="type"
		:min="min"
		:max="max"
		:step="step"
		@input="onInput"
		@blur="onBlur"
		@keyup.enter="onEnterPressed"
		@focus="dirty = true"
	/>
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
			if (isNaN(this.$props.value)) {
				return;
			}
			this.dirty = false;
			if (this.inputValue !== this.value) {
				this.inputValue = this.value;
			}
			this.$emit('blur');
		},
		onInput() {
			if (isNaN(this.$props.value)) {
				return;
			}
			this.$emit('input', this.inputValue);
		},
		onEnterPressed(e: any) {
			this.onBlur();
			e.target.blur();
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
