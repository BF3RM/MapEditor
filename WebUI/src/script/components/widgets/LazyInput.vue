<template>
	<input
		v-model="inputValue"
		:class="{ error: isInvalidNumber }"
		:type="type"
		:min="min"
		:max="max"
		:step="step"
		@blur="onBlur"
		@keyup.enter="onEnterPressed"
		@focus="dirty = true"
	/>
</template>

<script lang="ts">
import { defineComponent, PropType } from '@vue/composition-api';

export default defineComponent({
	name: 'LazyInput',
	props: {
		value: {
			type: [Number, String] as PropType<number | string>,
			required: true
		},
		type: {
			type: String,
			default: 'text'
		},
		min: [String, Number],
		max: [String, Number],
		step: [String, Number]
	},

	data() {
		return {
			inputValue: this.value as number | string
		};
	},

	computed: {
		isInvalidNumber(): boolean {
			return this.type === 'number' && Number.isNaN(Number(this.inputValue));
		}
	},

	methods: {
		onBlur() {
			let emitValue: string | number = this.inputValue;

			if (this.type === 'number' && this.inputValue !== '') {
				emitValue = Number(this.inputValue);
			}

			this.$emit('input', emitValue);
			this.$emit('blur');
		},
		onEnterPressed(event: Event) {
			(event.target as HTMLInputElement).blur();
		}
	},

	watch: {
		value(newVal) {
			// Update internal state when prop changes externally
			this.inputValue = newVal;
		}
	}
});
</script>
