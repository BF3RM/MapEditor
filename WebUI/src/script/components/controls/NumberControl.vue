<template>
	<div class="NumberControl">
		<DraggableNumberInput
			@blur="$emit('blur')"
			:hideLabel="true"
			dragDirection="X"
			:value="value"
			label="X"
			:step="step"
			:min="min"
			@input="$emit('input', $event)"
			@startDrag="onStartDrag"
			@endDrag="onEndDrag"
			:type="type"
		/>
	</div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import DraggableNumberInput from '@/script/components/widgets/DraggableNumberInput.vue';

@Component({ components: { DraggableNumberInput } })
export default class NumberControl extends Vue {
	@Prop({ default: 0.014 }) step: number;
	@Prop() value: number;
	@Prop(Number) min: number;
	@Prop(String) type: string;

	onStartDrag(event: number) {
		this.$emit('input', event);
		return event;
	}

	onEndDrag(event: number) {
		this.$emit('input', event);
		return event;
	}
}
</script>

<style lang="scss" scoped></style>
