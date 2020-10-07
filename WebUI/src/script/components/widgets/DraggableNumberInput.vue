<template>
	<div
			class="vue-draggable-number-container"
			:class="inputName"
			>
		<label
				:for="inputName"
				:style="{ cursor: cursorDirection }"
				@mousedown="dragStart"
				v-if="!hideLabel">
			{{ label }}
		</label>
		<input
				type="number"
				:max="max"
				:min="min"
				:name="inputName"
				:step="step"
				:value="formattedValue"
				@input="adjustValue($event.target.value)"
				@blur="$emit('blur')">
	</div>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue, Watch } from 'vue-property-decorator';

@Component
export default class DraggableNumberInput extends Vue {
	get boundAdjust() {
		return this.adjustValue.bind(this);
	}

	get boundEnd() {
		return this.dragEnd.bind(this);
	}

	get cursorDirection(): 'ns-resize' | 'ew-resize' {
		return this.dragDirection === 'Y' ? 'ns-resize' : 'ew-resize';
	}

	get inputName(): string {
		return `draggable-number-${this.label.toLowerCase().replace(' ', '-')}`;
	}

	public isDragging = false;

	@Prop({ default: 'Y', type: String })
	private dragDirection!: 'X' | 'Y';

	@Prop({ default: false, type: Boolean })
	private hideLabel: boolean;

	@Prop({ required: true, type: String })
	private label!: string;

	@Prop({ type: Number })
	private max!: number;

	@Prop({ type: Number })
	private min!: number;

	@Prop({ default: 1, type: Number })
	private step!: number;

	@Prop({ required: true, type: Number })
	private value!: number;

	@Emit('input')
	private adjustValue(val: number | string | MouseEvent): number {
		let newVal;

		if (val instanceof MouseEvent) {
			newVal = this.dragDirection === 'Y' ? -val.movementY * this.step : val.movementX * this.step;
			newVal = Number(this.value + newVal);
		} else { newVal = Number(val); }

		if (!isNaN(this.min) && newVal < this.min) { newVal = Math.max(newVal, this.min); }
		if (!isNaN(this.max) && newVal > this.max) { newVal = Math.min(newVal, this.max); }

		return Number(newVal.toFixed(2));
	}

	get formattedValue() {
		return Number(this.value.toFixed(2));
	}

	private dragEnd(): void {
		this.isDragging = false;

		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		document.removeEventListener('mousemove', this.boundAdjust);
		document.removeEventListener('mouseup', this.boundEnd);
		this.$emit('end-drag');
	}

	private dragStart(): void {
		this.isDragging = true;

		document.body.style.cursor = this.cursorDirection;
		document.body.style.userSelect = 'none';

		document.addEventListener('mousemove', this.boundAdjust);
		document.addEventListener('mouseup', this.boundEnd);
		this.$emit('start-drag');
	}
}
</script>

<style lang="scss" scoped>
	.vue-draggable-number-container {
		display: flex;
		flex-direction: row;
		align-items: center;
		label {
			padding: 0 1vmin;
		}
		input {
			padding: 0 1vmin;
			border-radius: 0.3vmin;
			padding-left: 0.5vmin;
		}
	}
</style>
